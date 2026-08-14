"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { s, sReq } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

export async function guardarEmpresa(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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
