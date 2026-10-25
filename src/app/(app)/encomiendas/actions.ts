"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeOperarPanel } from "@/lib/auth/sesion";
import { intNull, num, s, sReq, type FormState } from "@/lib/comun/forms";
import { esFecha, hoyChile } from "@/lib/comun/fechas";
import { uuidv7 } from "@/lib/comun/uuid";
import { TIPOS_PAGO, esClave, type TipoEvento } from "@/lib/encomiendas/catalogos";
import type { Tarifa } from "@/lib/encomiendas/pago";

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

// ----------------------------------------------------------------------------
// La tarifa: los seis números que definen cuánto vale un día
//
// Son exactamente los mismos para la regla global (guardarReglaPago) y para la
// tarifa que se le dicta a un día suelto al cargarlo (0033), así que se leen y
// se validan en un solo lugar. Si se validaran por separado, la regla podría
// aceptar algo que el día rechaza —o al revés— y la diferencia solo aparecería
// en un sueldo mal calculado.
// ----------------------------------------------------------------------------

// El porcentaje NO puede leerse con num(): ese helper borra los puntos para
// soportar el formato chileno de miles ("1.234.567"), y el <input type=
// "number" step="0.1"> del formulario envía "7.5" — que num() convertiría en
// 75. Un 7,5 % guardado como 75 % es diez veces el pago del conductor, todos
// los días, sin ningún aviso. Acá el punto SÍ es separador decimal.
function porcentaje(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function leerTarifa(formData: FormData): { tarifa: Tarifa } | { error: string } {
  const tipo_pago = sReq(formData.get("tipo_pago"));
  if (!esClave(TIPOS_PAGO, tipo_pago)) return { error: "Tipo de pago inválido." };

  // El % admite decimales; el monto fijo por pedido son pesos con separador
  // de miles. Dos formatos distintos, dos parsers distintos.
  const valor_pago =
    tipo_pago === "porcentaje"
      ? porcentaje(formData.get("valor_pago"))
      : num(formData.get("valor_pago"));
  if (valor_pago < 0) return { error: "El valor de pago no puede ser negativo." };
  if (tipo_pago === "porcentaje" && valor_pago > 100) {
    return { error: "El porcentaje no puede superar 100." };
  }

  // Sin valor por entrega no hay ingreso estimado, y con tipo_pago porcentaje
  // tampoco hay sueldo: el 7 % de cero es cero. Así que se exige.
  const valor_pedido = intNull(formData.get("valor_pedido"));
  if (valor_pedido == null || valor_pedido <= 0) {
    return { error: "Pon cuánto se estima que entra por cada entrega." };
  }

  const monto_dia = intNull(formData.get("monto_dia")) ?? 0;
  if (monto_dia < 0) return { error: "El monto por día no puede ser negativo." };

  const meta_entregas_dia = intNull(formData.get("meta_entregas_dia"));
  const bono_monto = intNull(formData.get("bono_monto"));
  if ((meta_entregas_dia == null) !== (bono_monto == null)) {
    return { error: "Para el bono, completa tanto la meta de entregas como el monto." };
  }

  return {
    tarifa: { tipo_pago, valor_pago, valor_pedido, monto_dia, meta_entregas_dia, bono_monto },
  };
}

/** Los argumentos con los que la base valora un día con una tarifa dictada a
 *  mano (encomienda_valorar_dia, 0033). */
function argumentosValorar(conductorId: string, fecha: string, tarifa: Tarifa) {
  return {
    p_conductor_id: conductorId,
    p_fecha: fecha,
    p_valor_pedido: tarifa.valor_pedido,
    p_tipo_pago: tarifa.tipo_pago,
    p_valor_pago: tarifa.valor_pago,
    p_monto_dia: tarifa.monto_dia,
    p_meta_entregas_dia: tarifa.meta_entregas_dia,
    p_bono_monto: tarifa.bono_monto,
  };
}

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

// ----------------------------------------------------------------------------
// Configuración: reglas de pago e ingresos reales (0029)
//
// Vivían en /encomiendas/configuracion, una página aparte. Ahora todo esto se
// edita en un diálogo sobre el mismo panel: son ajustes que se miran contra los
// números que están en pantalla —"¿cuánto estamos estimando por entrega?",
// "¿cuánto entró de verdad este mes?"— y mandar a otra página obligaba a
// recordar la cifra o a ir y volver.
// ----------------------------------------------------------------------------

// HAY UNA SOLA REGLA Y SE EDITA ENCIMA (0031). Antes cada guardado insertaba
// una fila nueva con su propia fecha de vigencia —también al corregir un dedazo
// dos minutos después—, así que la tabla se llenó de versiones que no usó nadie
// y saber cuánto valía un día obligaba a resolver cuál de todas regía.
//
// Cambiarla NO mueve nada de lo ya registrado, y eso no depende de esta acción:
// cada día tiene sus cifras escritas en encomienda_pagos desde el momento en
// que se registró (ver la cabecera de la 0031). Lo que se guarde acá manda
// sobre los días que se registren de ahora en adelante.
//
// Una regla tiene hasta cuatro componentes: cuánto se estima que entra por
// entrega (valor_pedido, 0029), un fijo por día trabajado (monto_dia, 0024), lo
// que corresponda por pedido entregado (tipo_pago + valor_pago) y un bono
// opcional al alcanzar una meta diaria.
export async function guardarReglaPago(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // RLS ya frena el insert de un conductor, pero devolvería un mensaje de Postgres
  // en la cara. Mejor decirlo de frente, igual que el resto de este archivo.
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para cambiar las reglas de pago." };
  }

  const leida = leerTarifa(formData);
  if ("error" in leida) return { error: leida.error };
  const campos = leida.tarifa;

  const supabase = await createClient();

  // Se busca la fila que hay (hay una o ninguna) y se decide entre modificarla
  // o crearla. No se usa upsert: el cliente no conoce el empresa_id —lo pone un
  // trigger— y sin él no hay cómo nombrar las columnas del conflicto.
  //
  // La restricción unique(empresa_id) de la 0031 es la red de abajo: si dos
  // pestañas guardan a la vez, la segunda choca en vez de crear una regla
  // paralela.
  const { data: actual, error: errLectura } = await supabase
    .from("encomienda_reglas_pago")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (errLectura) {
    return { error: `No se pudo leer la regla actual: ${errLectura.message}` };
  }

  const { error } = actual
    ? await supabase.from("encomienda_reglas_pago").update(campos).eq("id", actual.id)
    : await supabase.from("encomienda_reglas_pago").insert(campos);
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  // El insert de la PRIMERA regla dispara en la base el barrido de los días que
  // habían quedado sin cifras por no haber tenido con qué calcularse — pasa en
  // una instalación nueva, donde el conductor puede haber salido antes de que la
  // oficina configure nada. Un update no barre nada: ahí está todo el diseño.
  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

/** Anota lo que Starken liquidó de verdad en un PERIODO de facturación (0035).
 *
 *  Va por periodo y no por mes porque la liquidación llega por corte, y un corte
 *  puede cruzar dos meses: imputarla a uno obligaba a repartirla a ojo, y era
 *  justo esa cifra la que se usa para calibrar el valor por entrega.
 *
 *  Reemplaza si ese periodo ya estaba cargado: la liquidación puede llegar
 *  corregida, o cargarse primero un adelanto y después el total. */
export async function guardarIngresoReal(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para cargar ingresos." };
  }

  const periodo_id = s(formData.get("periodo_id"));
  if (!periodo_id) {
    return { error: "Elige a qué periodo de facturación corresponde lo que entró." };
  }

  const monto = intNull(formData.get("monto"));
  if (monto == null || monto < 0) {
    return { error: "Pon cuánto entró de verdad en ese periodo." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("encomienda_ingresos_reales")
    .upsert(
      { periodo_id, monto, nota: s(formData.get("nota")), anio: null, mes: null },
      { onConflict: "periodo_id" },
    );
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/encomiendas");
  return { ok: true };
}

/** Borra la liquidación cargada de un periodo. Es la salida para dos casos: se
 *  cargó en el periodo equivocado, o hay que borrar el periodo y la base no deja
 *  mientras tenga una liquidación colgando (0035). */
export async function eliminarIngresoReal(periodoId: string): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para borrar ingresos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("encomienda_ingresos_reales")
    .delete()
    .eq("periodo_id", periodoId);
  if (error) return { error: `No se pudo borrar el ingreso: ${error.message}` };

  revalidatePath("/encomiendas");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Periodos de facturación (0034)
//
// De qué fecha a qué fecha va cada corte. No llevan nombre: se llaman por sus
// fechas, y por eso acá no hay ningún campo de texto que validar.
//
// Una sola acción para crear y para editar, decidida por si viene `id`. Es el
// mismo formulario en la pantalla —se elige un periodo del desplegable o se
// deja en "Nuevo"— y partirlas en dos duplicaría la validación de fechas, que
// es todo lo que hacen.
// ----------------------------------------------------------------------------

/** Crea un periodo, o mueve las fechas de uno que ya existe.
 *
 *  Que dos periodos no se pisen NO se comprueba acá: lo rechaza la base con la
 *  restricción de exclusión de la 0034. Comprobarlo en este código sería una
 *  segunda opinión que puede quedar desactualizada, y además no cubre dos
 *  pestañas guardando a la vez. Lo que sí hace esta función es traducir ese
 *  rechazo a una frase que se entienda. */
export async function guardarPeriodoFacturacion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para definir periodos de facturación." };
  }

  const id = s(formData.get("id"));
  const fecha_inicio = sReq(formData.get("fecha_inicio"));
  const fecha_fin = sReq(formData.get("fecha_fin"));

  if (!esFecha(fecha_inicio)) return { error: "Pon la fecha de inicio del periodo." };
  if (!esFecha(fecha_fin)) return { error: "Pon la fecha de término del periodo." };
  // Comparar strings YYYY-MM-DD es comparar fechas, y no arrastra la zona
  // horaria del servidor a una decisión que es de calendario.
  if (fecha_fin < fecha_inicio) {
    return { error: "El periodo termina antes de empezar: revisa las fechas." };
  }

  const supabase = await createClient();
  const campos = { fecha_inicio, fecha_fin };
  const { error } = id
    ? await supabase.from("encomienda_periodos_facturacion").update(campos).eq("id", id)
    : await supabase.from("encomienda_periodos_facturacion").insert(campos);

  if (error) {
    // 23P01 = exclusion_violation: el rango pisa a otro periodo ya cargado. El
    // mensaje de Postgres nombra la restricción y no dice nada de fechas.
    if (error.code === "23P01") {
      return {
        error:
          "Esas fechas se cruzan con otro periodo ya definido. Los periodos no se pueden solapar: un día pertenece a un corte o a ninguno.",
      };
    }
    return { error: `No se pudo guardar el periodo: ${error.message}` };
  }

  revalidatePath("/encomiendas");
  return { ok: true };
}

/** Borra un periodo. No toca ningún día ni ninguna cifra: un periodo es solo el
 *  corte con el que se leen: sacarlo deja esos días sin agrupar, nada más. */
export async function eliminarPeriodoFacturacion(id: string): Promise<FormState> {
  if (!(await puedeOperarPanel())) {
    return { error: "No tienes permiso para borrar periodos de facturación." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("encomienda_periodos_facturacion")
    .delete()
    .eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation: el periodo tiene cargado lo que se facturó
    // de verdad, y eso vino de una liquidación que la app no puede reconstruir.
    // La base lo frena (0035, on delete restrict); acá se dice por dónde salir.
    if (error.code === "23503") {
      return {
        error:
          "Este periodo tiene cargado un ingreso real. Bórralo primero en “Comparar ingresos” y después el periodo.",
      };
    }
    return { error: `No se pudo borrar el periodo: ${error.message}` };
  }

  revalidatePath("/encomiendas");
  return { ok: true };
}
