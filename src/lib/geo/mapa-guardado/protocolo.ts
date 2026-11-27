// El mapa sin conexión (spec 047). Con ARES guiando, el mapa es lo que se mira
// manejando, y en la periferia de Arica la conexión se corta: sin esto el mapa
// quedaba en blanco (todo lo de OpenFreeMap iba directo a la red, y el service
// worker no lo guarda: es de otro origen y el worker de MapLibre queda fuera de su
// alcance).
//
// MapLibre pide cada recurso de OpenFreeMap con el protocolo `ares-mapa://` (lo
// cambia `transformarPedido`, su transformRequest) y este cargador lo atiende en
// el hilo principal, también los que piden sus workers:
//   · teselas, letras e íconos: primero la copia guardada (su URL trae la versión
//     del mapa, así que con la misma URL no cambian);
//   · el estilo y el índice de teselas (dicen cuál es la versión vigente): primero
//     la red, con un tope de 4 s, y si no, la copia.
// Se guarda en Cache Storage (`ares-mapa-v1`), no en IndexedDB: son datos públicos
// del mapa, sin nada de los destinatarios, y no se borran al cerrar el día. Cada
// copia lleva el día de su último uso y lo que pasa 30 días sin usarse se borra
// (limpiarMapa), como en el service worker.
import type { GetResourceResponse, RequestParameters } from "maplibre-gl";

export const PROTOCOLO = "ares-mapa";
const ORIGEN = "https://tiles.openfreemap.org/";
export const CACHE_MAPA = "ares-mapa-v1";
const SELLO = "x-ares-usado";
const MS_ESPERA_RED = 4_000;
const DIAS_SIN_USO = 30;

const hoy = () => new Date().toISOString().slice(0, 10);

/** La URL de OpenFreeMap con el protocolo propio; las demás, como vienen. Pura. */
export const aProtocolo = (url: string): string => (url.startsWith(ORIGEN) ? `${PROTOCOLO}://${url.slice("https://".length)}` : url);

/** De vuelta a https. Pura. */
export const deProtocolo = (url: string): string =>
  url.startsWith(`${PROTOCOLO}://`) ? `https://${url.slice(PROTOCOLO.length + 3)}` : url;

/** El transformRequest del mapa del conductor. */
export const transformarPedido = (url: string): { url: string } => ({ url: aProtocolo(url) });

/** ¿Con la misma URL es siempre lo mismo? Teselas, letras e íconos sí; el estilo y
 *  el índice de teselas no (apuntan a la versión vigente). Pura. */
export function esFijo(url: string): boolean {
  const ruta = new URL(url).pathname;
  return /\/\d+\/\d+\/\d+\.(pbf|png)$/.test(ruta) || ruta.startsWith("/fonts/") || ruta.startsWith("/sprites/");
}

/** ¿Una copia usada por última vez el día `sello` ya venció? Sin sello no. Pura. */
export function vencida(sello: string | null, dia = hoy()): boolean {
  if (!sello) return false;
  return Date.parse(dia) - Date.parse(sello) > DIAS_SIN_USO * 86_400_000;
}

async function abrir(): Promise<Cache | null> {
  try {
    return (await globalThis.caches?.open(CACHE_MAPA)) ?? null;
  } catch {
    // Sin Cache Storage (un navegador viejo, modo incógnito): solo red, como antes.
    return null;
  }
}

/** Guarda la copia con el día de hoy en una cabecera propia. */
async function guardar(cache: Cache, url: string, respuesta: Response): Promise<void> {
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set(SELLO, hoy());
  const cuerpo = respuesta.status === 204 ? null : await respuesta.blob();
  await cache.put(url, new Response(cuerpo, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras }));
}

const sirve = (r: Response): boolean => r.ok || r.status === 204;

/**
 * El recurso de `url` (https): de la copia o de la red según `esFijo`, guardando lo
 * que llega bien. Falla solo si no hay ni red ni copia.
 */
export async function traer(url: string, senal?: AbortSignal): Promise<Response> {
  const cache = await abrir();
  const desdeRed = () =>
    fetch(url, { signal: senal }).then(async (r) => {
      if (sirve(r) && cache) await guardar(cache, url, r.clone()).catch(() => {});
      return r;
    });

  if (esFijo(url)) {
    const guardada = await cache?.match(url);
    if (guardada) {
      // Una vez por día: lo que se usa no vence.
      if (cache && guardada.headers.get(SELLO) !== hoy()) void guardar(cache, url, guardada.clone()).catch(() => {});
      return guardada;
    }
    const r = await desdeRed();
    if (!sirve(r)) throw new Error(`Mapa: HTTP ${r.status}`);
    return r;
  }

  // El estilo y el índice: la red manda si contesta a tiempo.
  const red = desdeRed().catch(() => null);
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<null>((listo) => (reloj = setTimeout(() => listo(null), MS_ESPERA_RED)));
  const primera = await Promise.race([red, tope]);
  clearTimeout(reloj);
  if (primera && sirve(primera)) return primera;
  const guardada = await cache?.match(url);
  if (guardada) return guardada;
  const tarde = await red;
  if (!tarde) throw new Error("Mapa: sin conexión ni copia guardada");
  if (!sirve(tarde)) throw new Error(`Mapa: HTTP ${tarde.status}`);
  return tarde;
}

/** El cargador del protocolo `ares-mapa://` (maplibre addProtocol). */
export async function cargarRecurso(
  params: RequestParameters,
  abort: AbortController,
): Promise<GetResourceResponse<ArrayBuffer | string | object>> {
  const r = await traer(deProtocolo(params.url), abort.signal);
  if (params.type === "json") return { data: (await r.json()) as object };
  if (params.type === "string") return { data: await r.text() };
  // Teselas, letras e imágenes (en bytes: MapLibre las decodifica). Una tesela vacía, 204.
  return { data: r.status === 204 ? new ArrayBuffer(0) : await r.arrayBuffer() };
}

/** Borra lo que no se usó en 30 días. Lo llama la descarga diaria. */
export async function limpiarMapa(): Promise<number> {
  const cache = await abrir();
  if (!cache) return 0;
  let borradas = 0;
  for (const pedido of await cache.keys()) {
    const guardada = await cache.match(pedido);
    if (guardada && vencida(guardada.headers.get(SELLO))) {
      await cache.delete(pedido);
      borradas++;
    }
  }
  return borradas;
}

/** Cuántos archivos hay guardados, sin leerlos. 0 sin Cache Storage. */
export async function archivosGuardados(): Promise<number> {
  return (await (await abrir())?.keys())?.length ?? 0;
}

/** Cuántos archivos y bytes hay guardados (Diagnóstico). null sin Cache Storage. */
export async function estadoMapa(): Promise<{ archivos: number; bytes: number } | null> {
  const cache = await abrir();
  if (!cache) return null;
  let bytes = 0;
  const pedidos = await cache.keys();
  for (const pedido of pedidos) bytes += (await (await cache.match(pedido))?.blob())?.size ?? 0;
  return { archivos: pedidos.length, bytes };
}
