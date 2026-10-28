"use server";

// Panel de encomiendas: los periodos de facturación (sale de actions.ts, spec 002 T040).
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
import { s, sReq, type FormState } from "@/lib/comun/forms";
import { esFecha } from "@/lib/comun/fechas";

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
