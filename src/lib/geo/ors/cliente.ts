// La puerta a OpenRouteService desde el teléfono (spec 019): la matriz, la línea
// del día y la navegación salen de acá desde que se dejó Mapbox ("no quiero
// seguir gastar"). ORS es gratis y sin tarjeta: pasado el límite del día contesta
// 429 y la app se degrada (línea recta, sin cartel), nunca cobra.
//
// La consulta va directo del teléfono a ORS, nunca por el servidor: lleva puntos
// de destinatarios (ver docs/PRIVACIDAD.md). Por eso la clave es pública, como lo
// era el token de Mapbox; lo peor que puede pasar es que alguien gaste la cuota
// del día.
import { tope } from "@/lib/comun/tope";

const BASE = "https://api.openrouteservice.org";

/** Clave pública de ORS: la única lectura de NEXT_PUBLIC_ORS_KEY. Se lee al
 *  llamar para que las pruebas puedan ponerla y quitarla; Next.js la reemplaza
 *  al compilar porque aparece escrita completa acá. */
export function claveOrs(): string | null {
  return process.env.NEXT_PUBLIC_ORS_KEY || null;
}

/** Lo que contestó ORS: los datos, `cupo` (se acabaron las del día) o null (sin
 *  clave, sin red, sin camino o un error). */
export type RespuestaOrs<T> = { datos: T } | { cupo: true } | null;

/** Un POST a ORS con tope de tiempo. Nunca lanza. */
export async function postOrs<T>(ruta: string, cuerpo: unknown, ms: number): Promise<RespuestaOrs<T>> {
  const clave = claveOrs();
  if (!clave) return null;
  try {
    const res = await fetch(`${BASE}${ruta}`, {
      method: "POST",
      headers: { Authorization: clave, "Content-Type": "application/json", Accept: "application/json, application/geo+json" },
      body: JSON.stringify(cuerpo),
      signal: tope(ms),
    });
    if (res.status === 429) return { cupo: true };
    if (!res.ok) return null;
    return { datos: (await res.json()) as T };
  } catch {
    return null;
  }
}
