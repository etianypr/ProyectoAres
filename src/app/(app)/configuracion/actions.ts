"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeOperarPanel } from "@/lib/auth";
import { s, sReq } from "@/lib/form-helpers";
import { BLOQUES_HORARIOS } from "@/lib/encomiendas/config";

export type FormState = { error?: string; ok?: boolean };

// RLS (empresa_write_admin_op) ya frena a un conductor, pero un UPDATE bloqueado
// devuelve "0 filas, sin error" y la acción contestaría {ok:true} sin haber
// guardado nada. Igual que en encomiendas/actions.ts: se dice de frente.
const SIN_PERMISO: FormState = { error: "No tienes permiso para cambiar la configuración." };

export async function guardarEmpresa(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeOperarPanel())) return SIN_PERMISO;

  const id = s(formData.get("id"));

  // Sin proximo_numero_cotizacion: esta empresa no emite cotizaciones. El
  // correlativo era del sistema del que salió este proyecto.
  const values = {
    nombre: sReq(formData.get("nombre")) || "Encomiendas",
    razon_social: s(formData.get("razon_social")),
    rut: s(formData.get("rut")),
    direccion: s(formData.get("direccion")),
    ciudad: s(formData.get("ciudad")),
    giro: s(formData.get("giro")),
    telefono: s(formData.get("telefono")),
    email: s(formData.get("email")),
    representante: s(formData.get("representante")),
    logo_url: s(formData.get("logo_url")),
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("empresa").update(values).eq("id", id)
    : await supabase.from("empresa").insert(values);

  if (error) {
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: true };
}

/** Guarda cuáles bloques horarios se le ofrecen al receptor (FR-010).
 *
 *  Dos cosas que parecen detalles y no lo son:
 *
 *  · Se guardan solo los ids que EXISTEN en el código. Un id inventado (un
 *    formulario manipulado, un bloque retirado en una versión anterior) llegaría
 *    a un receptor dentro del payload de un botón, y su respuesta volvería con un
 *    id que el webhook no reconoce: esa respuesta se perdería en silencio.
 *
 *  · Se guarda un arreglo VACÍO cuando no se marcó ninguno, y no null. null
 *    significa "nunca se configuró, ofrecé los seis"; el arreglo vacío significa
 *    "el jefe decidió no ofrecer horarios". Confundirlos haría que desmarcar todo
 *    volviera a ofrecer los seis, que es exactamente lo contrario de lo que el
 *    jefe pidió. */
export async function guardarBloquesHorarios(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeOperarPanel())) return SIN_PERMISO;

  const id = s(formData.get("empresa_id"));
  if (!id) {
    return { error: "Primero hay que guardar los datos de la empresa." };
  }

  const validos = new Set(BLOQUES_HORARIOS.map((b) => b.id));
  const elegidos = formData
    .getAll("bloques")
    .map(String)
    .filter((v) => validos.has(v));

  const supabase = await createClient();
  const { error } = await supabase
    .from("empresa")
    .update({
      bloques_horarios_activos: elegidos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: `No se pudieron guardar los horarios: ${error.message}` };
  }

  revalidatePath("/configuracion");
  return { ok: true };
}
