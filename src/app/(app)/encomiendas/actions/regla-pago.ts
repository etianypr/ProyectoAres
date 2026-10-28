"use server";

// Panel de encomiendas: la regla de pago y los ingresos reales (sale de actions.ts, spec 002 T040).
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
import { intNull, s, type FormState } from "@/lib/comun/forms";
import { leerTarifa } from "../_tarifa";

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
