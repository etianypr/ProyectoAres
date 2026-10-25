import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RolUsuario } from "@/types/db";
import { inicioSegunRol, leerRol, ROLES_PANEL } from "./roles";

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

export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return { userId: user.id, email: user.email ?? "", rol: await leerRol(supabase, user.id) };
});

/** Para las server actions del panel: una action no redirige, devuelve el error
 *  al formulario, así que necesita la respuesta y no la puerta. Es la misma
 *  regla que exigirPanel(), y RLS la vuelve a exigir en la base. */
export async function puedeOperarPanel(): Promise<boolean> {
  const rol = (await sesionActual())?.rol;
  return rol != null && ROLES_PANEL.includes(rol);
}

/** Hay sesión, sin importar el rol. Si no, al login. */
export async function exigirSesion(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  return sesion;
}

// Puerta del panel admin. Un conductor con sesión abierta que entra a "/" (o a
// cualquier ruta del grupo (app)) termina acá: se lo manda a su propia app en
// vez de mostrarle un panel donde RLS le niega casi todos los datos y las
// acciones. Antes esto solo pasaba en el momento del login, así que la
// SEGUNDA visita — con la cookie ya puesta — caía directo en el panel admin.
export async function exigirPanel(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (sesion.rol === "conductor") redirect(inicioSegunRol("conductor"));
  return sesion;
}

// Puerta de la app del conductor, simétrica a exigirPanel(). Sin esto, un
// admin que teclea /conductor cae en la pantalla "Cuenta sin vincular" (no
// tiene ficha de conductor) sin ningún link de vuelta al panel.
export async function exigirConductor(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "conductor") redirect("/");
  return sesion;
}
