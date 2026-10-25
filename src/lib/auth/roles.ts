// Roles y a dónde entra cada uno. Sin "server-only": también lo usa una
// pantalla del navegador (set-password) con su propio cliente de Supabase.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RolUsuario } from "@/types/db";

/** Roles que ven el panel de escritorio. El conductor NO: su app es /conductor. */
export const ROLES_PANEL: RolUsuario[] = ["admin", "operador"];

/** Rol de un usuario, leído de `perfiles` (la policy `perfiles_self_read` deja que
 *  cada uno lea su propia fila, con cualquier rol). null = sin perfil. */
export async function leerRol(supabase: SupabaseClient<Database>, userId: string): Promise<RolUsuario | null> {
  const { data } = await supabase.from("perfiles").select("rol").eq("id", userId).maybeSingle();
  return (data?.rol as RolUsuario | undefined) ?? null;
}

/** Ruta de inicio de cada rol: a dónde mandar a alguien recién autenticado.
 *
 *  El conductor entra derecho al reparto y no a /conductor: esa página ya no es un
 *  menú, solo reenvía acá, y pasar por ella es un salto de servidor que se
 *  siente al abrir la app con señal mala. /conductor sigue existiendo para las
 *  cuentas sin ficha vinculada. */
export function inicioSegunRol(rol: RolUsuario | null | undefined): string {
  return rol === "conductor" ? "/conductor/encomiendas" : "/";
}

/** ¿`ruta` es un destino válido para ese rol después de entrar? Solo rutas
 *  internas, y cada rol en su propia app: un conductor no termina en el panel (RLS
 *  le negaría casi todo) ni el jefe en /conductor. */
export function destinoPermitido(rol: RolUsuario | null, ruta: string): boolean {
  if (!ruta.startsWith("/") || ruta.startsWith("//")) return false;
  return rol === "conductor" ? ruta.startsWith("/conductor") : !ruta.startsWith("/conductor");
}
