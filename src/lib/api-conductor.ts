import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
// exigir que cada fila sea del `chofer_id` de quien la pide (ver la migración
// 0003). Esto es la puerta; RLS es la cerradura.

export type ConductorAutenticado =
  | { ok: true; choferId: string; nombre: string }
  | { ok: false; respuesta: NextResponse };

function rechazo(estado: number, error: string): { ok: false; respuesta: NextResponse } {
  return { ok: false, respuesta: NextResponse.json({ error }, { status: estado }) };
}

export async function conductorDeLaApi(): Promise<ConductorAutenticado> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return rechazo(401, "Sesión vencida. Volvé a entrar a la app.");

  // El rol se lee de perfiles, igual que en lib/auth.ts. Un admin no puede usar
  // estas rutas: no tiene pedidos ni día, y dejarlo pasar significaría que
  // el `chofer_id` de las correlaciones podría no ser de nadie.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.rol !== "chofer") {
    return rechazo(403, "Esta operación es solo de la app del conductor.");
  }

  const { data: chofer } = await supabase
    .from("choferes")
    .select("id, nombre")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chofer) {
    return rechazo(
      403,
      "Tu usuario no está vinculado a ningún conductor. Pide a un administrador que lo configure.",
    );
  }

  return { ok: true, choferId: chofer.id, nombre: chofer.nombre };
}

/** Identificador opaco para correlacionar una respuesta de WhatsApp.
 *
 *  Aleatorio y NO un UUIDv7: el v7 lleva la hora en los primeros bytes, y este
 *  identificador sale del sistema (viaja a Meta dentro del payload del botón).
 *  No hay motivo para contarle a nadie cuándo se creó. Base64url para que quepa
 *  cómodo en los 128 caracteres de payload que permite Meta: 22 caracteres.
 *
 *  Tampoco se deriva de ningún dato del receptor. Un hash del teléfono se
 *  rompería por fuerza bruta en minutos —los celulares chilenos son nueve
 *  dígitos— y convertiría la tabla de correlaciones en un registro de
 *  destinatarios pseudonimizado. Esto no es nada: son 128 bits al azar. */
export function nuevoCorrelationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
