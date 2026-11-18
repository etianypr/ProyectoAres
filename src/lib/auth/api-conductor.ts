import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conductorDeUsuario } from "./conductor-de-usuario";
import { leerRol } from "./roles";

// Quién está llamando a una ruta de API del conductor.
//
// Existe aparte de accesoEncomiendas() —el de las PANTALLAS— por una diferencia
// que no es cosmética: ese hace `redirect()`, y un redirect contestado a un
// `fetch` termina con el teléfono parseando el HTML del login como si fuera
// JSON. Acá se devuelve una respuesta con código y cuerpo, que es lo que la app
// puede interpretar y mostrar.
//
// La comprobación es la misma que la de las pantallas: sesión + ficha de
// conductor vinculada. Y no reemplaza a RLS: las policies de la base vuelven a
// exigir que cada fila sea del `conductor_id` de quien la pide (ver la migración
// 0003). Esto es la puerta; RLS es la cerradura.

export type ConductorAutenticado =
  | { ok: true; conductorId: string; nombre: string }
  | { ok: false; respuesta: NextResponse };

function rechazo(estado: number, error: string): { ok: false; respuesta: NextResponse } {
  return { ok: false, respuesta: NextResponse.json({ error }, { status: estado }) };
}

export async function conductorDeLaApi(): Promise<ConductorAutenticado> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return rechazo(401, "Sesión vencida. Vuelve a iniciar sesión.");

  // El rol y la ficha se preguntan a la vez (spec 038: dos viajes a Supabase en serie en cada
  // ida de la IA y cada consulta a Google), pero se decide en el orden de antes: primero el rol
  // —un admin es 403 aunque la ficha haya fallado— y después la ficha, cuyo error se lanza
  // (un error de red no es «sin ficha», spec 007).
  const [rol, ficha] = await Promise.allSettled([leerRol(supabase, user.id), conductorDeUsuario(supabase, user.id)]);
  if (rol.status === "rejected") throw rol.reason;

  // Un admin no puede usar estas rutas: no tiene pedidos ni día, y dejarlo pasar
  // significaría que el `conductor_id` de las correlaciones podría no ser de nadie.
  if (rol.value !== "conductor") {
    return rechazo(403, "Esta operación es solo de la app del conductor.");
  }

  if (ficha.status === "rejected") throw ficha.reason;
  const conductor = ficha.value;
  if (!conductor) {
    return rechazo(
      403,
      "Tu usuario no está vinculado a ningún conductor. Pide a un administrador que lo configure.",
    );
  }

  if (!conductor.activo) return rechazo(403, "Tu cuenta de conductor está desactivada.");

  return { ok: true, conductorId: conductor.id, nombre: conductor.nombre };
}
