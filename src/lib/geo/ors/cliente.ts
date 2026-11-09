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
import { hoyChile } from "@/lib/comun/fechas";

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

/** Por qué no llegó la última consulta (spec 024). "cupo": ORS dijo que se
 *  acabaron las del día, o no contestó con la red andando —el 403 «Quota
 *  exceeded» llega sin CORS y el navegador lo ve igual que un corte—. Antes los
 *  dos se mostraban como «Sin señal». */
export type FallaOrs = "cupo" | "sin_senal" | "error";

let ultimaFalla: FallaOrs | null = null;

/** La falla de la última consulta a ORS; null si llegó. */
export function ultimaFallaOrs(): FallaOrs | null {
  return ultimaFalla;
}

/** Un POST a ORS con tope de tiempo. Nunca lanza. */
export async function postOrs<T>(ruta: string, cuerpo: unknown, ms: number): Promise<RespuestaOrs<T>> {
  const clave = claveOrs();
  if (!clave) return null;
  contarConsulta(ruta.includes("/matrix") ? "matriz" : "trazado");
  try {
    const res = await fetch(`${BASE}${ruta}`, {
      method: "POST",
      headers: { Authorization: clave, "Content-Type": "application/json", Accept: "application/json, application/geo+json" },
      body: JSON.stringify(cuerpo),
      signal: tope(ms),
    });
    if (res.status === 429 || res.status === 403) {
      ultimaFalla = "cupo";
      return { cupo: true };
    }
    if (!res.ok) {
      ultimaFalla = "error";
      return null;
    }
    const datos = (await res.json()) as T;
    ultimaFalla = null;
    return { datos };
  } catch (e) {
    // Un corte de red es TypeError; el tope de tiempo, no (es señal lenta).
    ultimaFalla = e instanceof TypeError && (await hayRed()) ? "cupo" : "sin_senal";
    return null;
  }
}

/** ¿Hay red? Se le pregunta a ARES, sin datos: cualquier respuesta, aunque sea un
 *  405, dice que el teléfono llega a internet. El service worker no toca /api. */
async function hayRed(): Promise<boolean> {
  if (typeof location === "undefined" || globalThis.navigator?.onLine === false) return false;
  try {
    await fetch("/api/geocodificar", { method: "HEAD", cache: "no-store", signal: tope(MS_HAY_RED) });
    return true;
  } catch {
    return false;
  }
}
const MS_HAY_RED = 3_000;

// Las consultas del día a ORS desde este teléfono, para Diagnóstico (spec 024:
// medir cuánto gasta un día). Solo cuántas: ni puntos ni respuestas. En
// localStorage porque Android recarga ARES al ir a Google Maps.
const CLAVE_CONSULTAS = "ares-consultas-ors";

export type ConsultasOrs = { fecha: string; matriz: number; trazado: number };

/** Las consultas de hoy (matriz y trazado) que salieron de este teléfono. */
export function consultasOrsDeHoy(): ConsultasOrs {
  const fecha = hoyChile();
  try {
    const c = JSON.parse(globalThis.localStorage?.getItem(CLAVE_CONSULTAS) ?? "null") as ConsultasOrs | null;
    if (c?.fecha === fecha) return c;
  } catch {
    // Bloqueado (modo privado) o de otra versión: se cuenta desde cero.
  }
  return { fecha, matriz: 0, trazado: 0 };
}

function contarConsulta(tipo: "matriz" | "trazado"): void {
  const c = consultasOrsDeHoy();
  try {
    globalThis.localStorage?.setItem(CLAVE_CONSULTAS, JSON.stringify({ ...c, [tipo]: c[tipo] + 1 }));
  } catch {
    // Sin localStorage no hay cuenta; la consulta sale igual.
  }
}
