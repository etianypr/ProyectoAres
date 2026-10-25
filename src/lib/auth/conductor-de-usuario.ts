// Ficha de conductor vinculada a un usuario. Una sola consulta para las tres
// puertas que la necesitan: /conductor, las pantallas de encomiendas y la API.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

export type ConductorDeUsuario = { id: string; nombre: string; activo: boolean };

/** null = el usuario no tiene ficha vinculada. Si la consulta falla, LANZA: un
 *  error de red no puede confundirse con "sin ficha", que borra los datos del
 *  teléfono (spec 007). */
export async function conductorDeUsuario(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ConductorDeUsuario | null> {
  const { data, error } = await supabase
    .from("conductores")
    .select("id, nombre, activo")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
