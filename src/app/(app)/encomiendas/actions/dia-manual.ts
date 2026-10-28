"use server";

// Panel de encomiendas: cargar, borrar o recalcular un día a mano (sale de actions.ts, spec 002 T040).
//
// Acá solo vive lo exclusivamente admin: la regla de pago, los ingresos reales
// y cargar a mano un día que el teléfono no alcanzó a registrar. La carga de
// pedidos y el armado de la ruta ya no pasan por el servidor — viven en el
// teléfono del conductor (ver lib/encomiendas/local y la cabecera de la 0026).
//
// YA NO HAY ACCIONES DE "CONFIRMAR PAGO" (0031). Existían para escribir la fila
// de encomienda_pagos de un día, o de un mes entero, a pedido. Ahora esa fila la
// escribe la base sola —un trigger sobre encomienda_actividad— apenas cambia la
// actividad del día, así que no queda nada que confirmar: las cifras ya están.
// Con eso se fue también el estado "por recalcular", que era la posibilidad de
// que el snapshot y el cálculo al vuelo no coincidieran.

// Las Server Actions son endpoints POST de la ruta donde se usan: cualquiera
// con sesión puede invocarlas, el proxy no las filtra. RLS ya frena la
// escritura de encomienda_pagos y de la actividad manual a admin/operador, pero
// un DELETE/UPDATE bloqueado por RLS devuelve "0 filas, sin error" y la acción
// respondería {ok:true} sin haber hecho nada. Mejor decirlo de frente: por eso
// cada acción empieza con puedeOperarPanel().

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeOperarPanel } from "@/lib/auth/sesion";
import { intNull, sReq, type FormState } from "@/lib/comun/forms";
import { esFecha, hoyChile } from "@/lib/comun/fechas";
import { uuidv7 } from "@/lib/comun/uuid";
import type { TipoEvento } from "@/lib/encomiendas/catalogos";
import type { Tarifa } from "@/lib/encomiendas/pago";
import { argumentosValorar, leerTarifa } from "../_tarifa";

// ----------------------------------------------------------------------------
// Cargar a mano un día que el teléfono no registró (0028)
//
// Un día de trabajo solo existe si hay filas en encomienda_actividad, y hasta
// acá las ponía únicamente el teléfono del conductor. Si el teléfono no
// sincronizó —sin batería, app reinstalada, o el día es anterior a que la app
// existiera— el conductor trabajó, hay que pagarle, y el panel no lo sabe.
// Esto lo arregla desde la oficina.
// ----------------------------------------------------------------------------

// Techo por día. No es una regla del negocio, es un cortafuegos contra el dedo
// resbalado: escribir "320" donde iban "32" insertaría 320 filas y multiplicaría
// por diez la liquidación de ese día. Un día real en Arica son ~60
// entregas, así que 300 no le queda corto a nadie.
const MAX_EVENTOS_DIA = 300;

/** Mediodía UTC del día cargado. La hora real de cada entrega NO se conoce
 *  —nadie la anotó— y este campo es `not null`, así que hay que poner algo.
 *  Mediodía UTC cae dentro del mismo día de calendario en Chile (UTC-4/-3),
 *  que es lo único que importa: `fecha` es la columna de la que sale el pago.
 *  Las pantallas no muestran esta hora en los días manuales, justamente para
 *  no aparentar una precisión que no existe. */
function horaRelleno(fecha: string): string {
  return `${fecha}T12:00:00Z`;
}

/** Carga (o reemplaza) la actividad manual de un conductor en un día.
 *
 *  REEMPLAZA a propósito: volver a guardar el mismo (conductor, día) borra la
 *  carga manual anterior antes de escribir la nueva. Es la forma de corregir un
 *  número mal tecleado sin dejar el día sumado dos veces, que es el error que
 *  un "insertar y listo" haría fácil y silencioso.
 *
 *  Lo que el TELÉFONO mandó no se toca nunca: si ese día ya tenía 20 entregas
 *  sincronizadas y acá se cargan 12, el día queda en 32. La pantalla avisa de
 *  esa suma antes de guardar.
 *
 *  Con qué tarifa se valora el día lo decide el campo modo_tarifa: la que el
 *  día ya tiene, la regla de ahora, o una escrita a mano solo para ese día. */
export async function agregarDiaManual(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para cargar días." };
  }

  const conductor_id = sReq(formData.get("conductor_id"));
  if (!conductor_id) return { error: "Elige un conductor." };

  const fecha = sReq(formData.get("fecha"));
  if (!esFecha(fecha)) return { error: "La fecha no es válida." };
  // Comparación de strings sobre YYYY-MM-DD: ordena igual que por calendario y
  // evita construir un Date (que interpretaría la fecha en UTC y correría el
  // límite un día). hoyChile() ya viene en la zona del negocio.
  if (fecha > hoyChile()) return { error: "No se puede cargar un día que todavía no ocurre." };

  const entregados = intNull(formData.get("entregados")) ?? 0;
  const omitidos = intNull(formData.get("omitidos")) ?? 0;
  if (entregados < 0 || omitidos < 0) {
    return { error: "Los conteos no pueden ser negativos." };
  }
  if (entregados + omitidos > MAX_EVENTOS_DIA) {
    return {
      error: `Son ${entregados + omitidos} registros para un solo día (el tope es ${MAX_EVENTOS_DIA}). Revisa los números.`,
    };
  }

  // Con qué tarifa se valora este día. Lo elige quien carga:
  //
  //   "dia"     la que el día ya tiene congelada. Es el default y el único modo
  //             que no escribe plata: se usa al completar un día que el
  //             teléfono ya empezó a registrar.
  //   "actual"  la regla de pago de ahora.
  //   "editada" una tarifa escrita a mano para ESTE día, sin tocar la regla.
  //             Es lo que hace cargables los días viejos que se pagaban
  //             distinto (ver la 0033).
  const modo = sReq(formData.get("modo_tarifa")) || "dia";
  if (!["dia", "actual", "editada"].includes(modo)) {
    return { error: "No se entendió con qué tarifa calcular el día." };
  }

  // La tarifa se valida ANTES de escribir nada: un error acá tiene que dejar el
  // día sin guardar. Si se validara después del insert, un porcentaje mal
  // tecleado dejaría el día cargado y valorado con la regla de hoy, que es
  // justo lo que se estaba tratando de evitar.
  let tarifa: Tarifa | null = null;
  if (modo === "editada") {
    const leida = leerTarifa(formData);
    if ("error" in leida) return { error: leida.error };
    tarifa = leida.tarifa;
  }

  const supabase = await createClient();

  // Sin regla de pago configurada no hay con qué valorar el día: la base no le
  // escribiría cifras (ver private.encomienda_congelar_dia en la 0031) y
  // quedaría un día trabajado que no suma a los ingresos ni se le puede pagar
  // al conductor. Se frena acá, con el día todavía sin guardar, en vez de
  // dejarlo entrar y que aparezca marcado "Sin regla" en el panel.
  const { count: hayRegla, error: errRegla } = await supabase
    .from("encomienda_reglas_pago")
    .select("id", { count: "exact", head: true });
  if (errRegla) {
    return { error: `No se pudo leer la regla de pago: ${errRegla.message}` };
  }
  if (!hayRegla) {
    return {
      error: "Configura primero la regla de pago: sin ella no se puede calcular el día.",
    };
  }

  // Que el conductor exista. Sin esto, un conductor_id inventado revienta contra la
  // foreign key con un mensaje de Postgres en la cara.
  //
  // Antes acá se comprobaba además que tuviera asignada la categoría
  // "encomiendas": el sistema del que salió este proyecto tenía tres líneas de
  // trabajo y cargarle un día de reparto a un conductor de taxis metía otra área
  // en esta liquidación. Con un solo negocio no hay a quién confundir.
  const { count: existe } = await supabase
    .from("conductores")
    .select("id", { count: "exact", head: true })
    .eq("id", conductor_id);
  if (!existe) {
    return { error: "Ese conductor no existe." };
  }

  // Un día en que salió y no logró entregar nada igual es un día trabajado y se
  // paga el fijo diario: se registra con una 'llamada', que es exactamente para
  // lo que existe ese tipo (ver 0026).
  const tipos: TipoEvento[] =
    entregados + omitidos === 0
      ? ["llamada"]
      : [
          ...Array<TipoEvento>(entregados).fill("entrega"),
          ...Array<TipoEvento>(omitidos).fill("omision"),
        ];

  const hora = horaRelleno(fecha);
  const filas = tipos.map((tipo) => ({
    id: uuidv7(),
    conductor_id,
    fecha,
    tipo,
    hora,
    origen: "manual" as const,
  }));

  // Primero borrar la carga manual anterior de ese día, si la hubo (ver el
  // comentario de arriba sobre reemplazar). El filtro por origen es lo que deja
  // intacto lo que mandó el teléfono.
  //
  // Borrar y volver a insertar no es una transacción (serían dos consultas
  // PostgREST; hacerlo atómico pediría una función en la base). Si el insert
  // falla después del delete, la carga manual anterior se pierde y el día queda
  // solo con lo del teléfono. Se eligió ese orden a propósito: el fallo se ve
  // —el badge "Carga manual" desaparece y los conteos bajan— y se arregla
  // volviendo a guardar. Al revés, el fallo sería el día contado dos veces, que
  // no se nota y paga de más.
  const { error: errBorrado } = await supabase
    .from("encomienda_actividad")
    .delete()
    .eq("conductor_id", conductor_id)
    .eq("fecha", fecha)
    .eq("origen", "manual");
  if (errBorrado) {
    return { error: `No se pudo reemplazar la carga anterior: ${errBorrado.message}` };
  }

  const { error } = await supabase.from("encomienda_actividad").insert(filas);
  if (error) return { error: `No se pudo guardar el día: ${error.message}` };

  // El día tiene que quedar CERRADO: la oficina no está abriendo una ruta,
  // está anotando un día que ya pasó. Sin esto el día quedaría "en curso" para
  // siempre y no se valoraría nunca (0032) — los triggers de actividad solo
  // calculan sobre días cerrados.
  //
  // Va después del insert de actividad: cerrar el día es lo que dispara el
  // cálculo, así que tiene que encontrar los eventos ya puestos.
  //
  // NO es un upsert a secas. Si el día ya estaba cerrado —el conductor lo
  // terminó y la oficina está corrigiendo el conteo— pisar cerrada_en movería
  // la hora de fin de la ruta a la hora de la corrección, que es mentira. En
  // ese caso no hay nada que hacer: el insert de arriba ya recalculó el día.
  //
  // inicio queda null cuando el día se crea acá, a propósito: nadie sabe a
  // qué hora empezó ese día, y la hora de relleno lo haría parecer un dato.
  const { data: diaTrabajo, error: errLeer } = await supabase
    .from("encomienda_jornadas")
    .select("id, cerrada_en")
    .eq("conductor_id", conductor_id)
    .eq("fecha", fecha)
    .maybeSingle();
  if (errLeer) {
    return { error: `Se guardó el día, pero no se pudo leer el día de trabajo: ${errLeer.message}` };
  }

  if (!diaTrabajo || diaTrabajo.cerrada_en == null) {
    const ahora = new Date().toISOString();
    const { error: errDia } = diaTrabajo
      ? await supabase
          .from("encomienda_jornadas")
          .update({ cerrada_en: ahora })
          .eq("id", diaTrabajo.id)
      : await supabase
          .from("encomienda_jornadas")
          .insert({ conductor_id, fecha, cerrada_en: ahora });
    if (errDia) {
      return {
        error: `Se guardó el día, pero no se pudo cerrar el día de trabajo: ${errDia.message}`,
      };
    }
  }

  // Llegado acá el día YA tiene cifras: cerrar el día disparó el trigger que
  // lo congela (0031 + 0032), y lo hizo con la tarifa que el día tenía o, si es
  // nuevo, con la regla de ahora. Eso es exactamente el modo "dia".
  //
  // Los otros dos modos vuelven a valorarlo. Va después y no antes porque las
  // dos funciones cuentan la actividad del día: tienen que encontrarla ya
  // escrita. El precio es que un día con tarifa editada se calcula dos veces —
  // la segunda es la que queda.
  if (modo === "editada" && tarifa) {
    const { error: errTarifa } = await supabase.rpc(
      "encomienda_valorar_dia",
      argumentosValorar(conductor_id, fecha, tarifa),
    );
    if (errTarifa) {
      return {
        error: `Se guardó el día, pero quedó calculado con la regla actual: ${errTarifa.message}`,
      };
    }
  } else if (modo === "actual") {
    // Un día nuevo ya quedó con la regla de ahora, así que esto no lo mueve.
    // Importa cuando el día YA existía con otra tarifa: elegir "regla actual"
    // tiene que significar eso, no "la que traía".
    const { error: errRepreciar } = await supabase.rpc("encomienda_repreciar_dia", {
      p_conductor_id: conductor_id,
      p_fecha: fecha,
    });
    if (errRepreciar) {
      return {
        error: `Se guardó el día, pero no se pudo recalcular con la regla actual: ${errRepreciar.message}`,
      };
    }
  }

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

/** Borra por completo la carga manual de un (conductor, día).
 *
 *  Es la vuelta atrás de un día cargado que no correspondía. Solo toca las
 *  filas de origen 'manual': lo que el teléfono registró en terreno no se puede
 *  borrar desde acá. */
export async function eliminarDiaManual(conductorId: string, fecha: string): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para borrar días." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("encomienda_actividad")
    .delete()
    .eq("conductor_id", conductorId)
    .eq("fecha", fecha)
    .eq("origen", "manual");
  if (error) return { error: `No se pudo borrar la carga manual: ${error.message}` };

  // La fila de encomienda_pagos la limpia el trigger: el delete de arriba
  // recalcula el día, y un día con cero eventos se lleva su liquidación. Si
  // quedó actividad del teléfono, el día sobrevive y sus cifras se reescriben
  // sin lo que se acaba de borrar.
  //
  // El día de trabajo sí hay que borrarlo acá. No cuelga de la actividad —es una tabla
  // aparte (0032)— así que sobreviviría al día entero: el panel mostraría una
  // ruta de ese día sin una sola entrega, y el barrido nocturno la miraría
  // todas las noches.
  const { count: quedan, error: errConteo } = await supabase
    .from("encomienda_actividad")
    .select("id", { count: "exact", head: true })
    .eq("conductor_id", conductorId)
    .eq("fecha", fecha);
  if (errConteo) {
    return { error: `Se borró la actividad, pero quedó el día de trabajo: ${errConteo.message}` };
  }

  if (!quedan) {
    const { error: errDia } = await supabase
      .from("encomienda_jornadas")
      .delete()
      .eq("conductor_id", conductorId)
      .eq("fecha", fecha);
    if (errDia) {
      return { error: `Se borró la actividad, pero quedó el día de trabajo: ${errDia.message}` };
    }
  }

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

/** Vuelve a valorar un día con la regla de pago que rige AHORA.
 *
 *  Cada día conserva la tarifa con la que se calculó, así que cambiar la regla
 *  no lo mueve (0031). Esto es la salida para el caso en que la regla estaba
 *  mal escrita cuando ese día se registró: corregir la regla no arregla lo ya
 *  calculado, hay que decirlo día por día.
 *
 *  La cuenta la rehace la base —encomienda_repreciar_dia, que comprueba el rol
 *  por dentro— y no este código: es la misma función que corre el trigger, así
 *  que un día repreciado no puede quedar calculado distinto a uno nuevo. */
export async function repreciarDia(conductorId: string, fecha: string): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para recalcular pagos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("encomienda_repreciar_dia", {
    p_conductor_id: conductorId,
    p_fecha: fecha,
  });
  if (error) return { error: `No se pudo recalcular: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

/** Vuelve a valorar un día con una tarifa escrita a mano, sin tocar la regla.
 *
 *  Es la otra mitad de repreciarDia, y existe porque la regla rige hacia
 *  adelante: para un día de hace tres meses que se pagaba distinto no hay
 *  ninguna tabla de la que sacar su tarifa. Los números los pone quien liquida.
 *
 *  La cuenta la rehace la base (encomienda_valorar_dia, 0033), que valida y
 *  comprueba el rol por dentro: es la misma función que congela cualquier otro
 *  día, así que un día valorado a mano no puede quedar calculado con otra
 *  aritmética. */
export async function repreciarDiaConTarifa(
  conductorId: string,
  fecha: string,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para recalcular pagos." };
  }

  const leida = leerTarifa(formData);
  if ("error" in leida) return { error: leida.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "encomienda_valorar_dia",
    argumentosValorar(conductorId, fecha, leida.tarifa),
  );
  if (error) return { error: `No se pudo recalcular: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}
