import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RolUsuario } from "@/types/db";

// Capa única de sesión + rol ("Data Access Layer" en los docs de Next 16:
// node_modules/next/dist/docs/01-app/02-guides/authentication.md).
//
// Por qué acá y no en el proxy (src/proxy.ts): la propia doc de Next dice que
// el proxy sirve para chequeos OPTIMISTAS y no debe hacer consultas a la base
// — corre en CADA request, incluidos los prefetch de <Link>. Leer el rol ahí
// significaría un viaje extra a Supabase por cada link que el navegador
// precarga. La autorización de verdad vive lo más cerca posible del dato: acá
// y en las policies RLS de Postgres.
//
// cache() de React memoiza el resultado durante UN render: el layout y la
// página pueden pedir la sesión sin que se consulte dos veces.

export type Sesion = {
  userId: string;
  email: string;
  rol: RolUsuario | null;
};

/** Roles que ven el panel de escritorio. El chofer NO: su app es /conductor. */
export const ROLES_PANEL: RolUsuario[] = ["admin", "operador"];

export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // perfiles_self_read permite que cada usuario lea su propia fila, así que esta
  // consulta funciona con cualquier rol.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    rol: (perfil?.rol as RolUsuario | undefined) ?? null,
  };
});

/** Hay sesión, sin importar el rol. Si no, al login. */
export async function exigirSesion(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  return sesion;
}

// Puerta del panel admin. Un chofer con sesión abierta que entra a "/" (o a
// cualquier ruta del grupo (app)) termina acá: se lo manda a su propia app en
// vez de mostrarle un panel donde RLS le niega casi todos los datos y las
// acciones. Antes esto solo pasaba en el momento del login, así que la
// SEGUNDA visita — con la cookie ya puesta — caía directo en el panel admin.
export async function exigirPanel(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (sesion.rol === "chofer") redirect(inicioSegunRol("chofer"));
  return sesion;
}

// Puerta de la app del conductor, simétrica a exigirPanel(). Sin esto, un
// admin que teclea /conductor cae en la pantalla "Cuenta sin vincular" (no
// tiene ficha de chofer) sin ningún link de vuelta al panel.
export async function exigirConductor(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "chofer") redirect("/");
  return sesion;
}

/** Ruta de inicio de cada rol: a dónde mandar a alguien recién autenticado.
 *
 *  El chofer entra derecho al reparto y no a /conductor: esa página ya no es un
 *  menú, solo reenvía acá, y pasar por ella es un salto de servidor que se
 *  siente al abrir la app con señal mala. /conductor sigue existiendo para las
 *  cuentas sin ficha vinculada. */
export function inicioSegunRol(rol: RolUsuario | null | undefined): string {
  return rol === "chofer" ? "/conductor/encomiendas" : "/";
}
