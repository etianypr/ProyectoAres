// Las calles que hay alrededor de un punto, leídas de las mismas teselas de
// OpenFreeMap que dibuja el mapa (spec 019, T008; antes el Tilequery de Mapbox,
// una consulta por parada que se paga pasado lo gratis).
//
// Una tesela del zoom 14 cubre unos 2,4 km de Arica, así que un día de 100
// paradas se resuelve con unas pocas, y suelen ser las que el mapa ya bajó: la
// dirección de cada tesela lleva la versión del mapa, el navegador la guarda y
// no la vuelve a pedir. OpenFreeMap recibe solo qué zona se mira, igual que con
// el mapa (docs/PRIVACIDAD.md).
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { tope } from "@/lib/comun/tope";
import type { Coordenada } from "./coordenada";

/** Dice dónde están las teselas vigentes: su dirección cambia con cada versión. */
export const TILEJSON = "https://tiles.openfreemap.org/planet";
/** El zoom más detallado de OpenFreeMap: el único que trae todas las calles. */
export const ZOOM = 14;
const MS_TOPE = 8_000;
/** Teselas guardadas en memoria; un día de Arica usa menos. */
const MAX_TESELAS = 24;
/** La misma calle viene dos veces: en "transportation" (con su clase, sin
 *  nombre) y en "transportation_name" (con nombre). Dos puntos más cercanos
 *  así de juntos son la misma calle. */
const METROS_MISMA_CALLE = 3;

export type ViaCercana = { clase: string; nombre: string | null; metros: number; punto: Coordenada };

type Linea = { clase: string; nombre: string | null; tramos: number[][][] };

let plantilla: Promise<string | null> | null = null;
const teselas = new Map<string, Promise<Linea[] | null>>();

async function leerPlantilla(): Promise<string | null> {
  try {
    const res = await fetch(TILEJSON, { signal: tope(MS_TOPE) });
    if (!res.ok) return null;
    const datos = (await res.json()) as { tiles?: unknown };
    const url = Array.isArray(datos.tiles) ? datos.tiles[0] : null;
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

/** Sin señal no se guarda el fallo: la próxima ruta lo vuelve a intentar. */
function direccionDeTeselas(): Promise<string | null> {
  plantilla ??= leerPlantilla().then((url) => {
    if (!url) plantilla = null;
    return url;
  });
  return plantilla;
}

/** Las calles de una tesela, ya en latitud y longitud. */
export function lineasDeTesela(datos: Uint8Array, x: number, y: number): Linea[] {
  const tesela = new VectorTile(new PbfReader(datos));
  const lineas: Linea[] = [];
  for (const capa of ["transportation", "transportation_name"]) {
    const c = tesela.layers[capa];
    for (let i = 0; c && i < c.length; i++) {
      const f = c.feature(i);
      const clase = f.properties.class;
      if (f.type !== 2 || typeof clase !== "string") continue;
      const g = f.toGeoJSON(x, y, ZOOM).geometry;
      const tramos = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
      const nombre = typeof f.properties.name === "string" && f.properties.name ? f.properties.name : null;
      lineas.push({ clase, nombre, tramos });
    }
  }
  return lineas;
}

function lineasEn(x: number, y: number): Promise<Linea[] | null> {
  const clave = `${x}/${y}`;
  const guardada = teselas.get(clave);
  if (guardada) return guardada;
  if (teselas.size >= MAX_TESELAS) teselas.delete(teselas.keys().next().value!);
  const pedido = (async () => {
    const url = await direccionDeTeselas();
    if (!url) return null;
    try {
      const res = await fetch(url.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y)), {
        signal: tope(MS_TOPE),
      });
      if (!res.ok) return null;
      return lineasDeTesela(new Uint8Array(await res.arrayBuffer()), x, y);
    } catch {
      return null;
    }
  })().then((lineas) => {
    if (!lineas) teselas.delete(clave);
    return lineas;
  });
  teselas.set(clave, pedido);
  return pedido;
}

/** Metros por grado, para medir en un plano local: a 150 m el error no importa. */
const M_POR_GRADO_LAT = 110_574;
const mPorGradoLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Las teselas que tocan el círculo de `radioM` alrededor del punto (1 a 4). */
export function teselasAlrededor(punto: Coordenada, radioM: number): { x: number; y: number }[] {
  const n = 2 ** ZOOM;
  const dLat = radioM / M_POR_GRADO_LAT;
  const dLng = radioM / mPorGradoLng(punto.lat);
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const lista: { x: number; y: number }[] = [];
  for (let x = tx(punto.lng - dLng); x <= tx(punto.lng + dLng); x++) {
    for (let y = ty(punto.lat + dLat); y <= ty(punto.lat - dLat); y++) lista.push({ x, y });
  }
  return lista;
}

/** El punto de la línea más cercano al punto dado, y a cuántos metros está. */
function masCercano(punto: Coordenada, tramos: number[][][]): { metros: number; punto: Coordenada } | null {
  const kx = mPorGradoLng(punto.lat);
  let mejor: { metros: number; px: number; py: number } | null = null;
  for (const tramo of tramos) {
    for (let i = 1; i < tramo.length; i++) {
      const ax = (tramo[i - 1][0] - punto.lng) * kx;
      const ay = (tramo[i - 1][1] - punto.lat) * M_POR_GRADO_LAT;
      const dx = (tramo[i][0] - punto.lng) * kx - ax;
      const dy = (tramo[i][1] - punto.lat) * M_POR_GRADO_LAT - ay;
      const largo = dx * dx + dy * dy;
      const t = largo === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const metros = Math.hypot(px, py);
      if (!mejor || metros < mejor.metros) mejor = { metros, px, py };
    }
  }
  return mejor && { metros: mejor.metros, punto: { lng: punto.lng + mejor.px / kx, lat: punto.lat + mejor.py / M_POR_GRADO_LAT } };
}

/** Pura: las calles a menos de `radioM`, sin repetir la misma sin nombre. */
export function viasDeLineas(punto: Coordenada, lineas: Linea[], radioM: number): ViaCercana[] {
  const vias: ViaCercana[] = [];
  for (const l of lineas) {
    const c = masCercano(punto, l.tramos);
    if (c && c.metros <= radioM) vias.push({ clase: l.clase, nombre: l.nombre, metros: c.metros, punto: c.punto });
  }
  // Sin esto, la avenida sin nombre podría salir primero y tomarse por otra
  // carretera, aunque la dirección sea de esa misma avenida (ver acceso.ts).
  const conNombre = vias.filter((v) => v.nombre);
  return vias.filter(
    (v) =>
      v.nombre ||
      !conNombre.some(
        (n) =>
          n.clase === v.clase &&
          Math.hypot((n.punto.lng - v.punto.lng) * mPorGradoLng(v.punto.lat), (n.punto.lat - v.punto.lat) * M_POR_GRADO_LAT) <=
            METROS_MISMA_CALLE,
      ),
  );
}

/** Las calles a menos de `radioM` del punto, o null si no se pudo leer
 *  ninguna tesela (sin señal: la parada queda donde estaba). */
export async function viasCercanas(punto: Coordenada, radioM: number): Promise<ViaCercana[] | null> {
  const leidas = await Promise.all(teselasAlrededor(punto, radioM).map(({ x, y }) => lineasEn(x, y)));
  if (leidas.every((l) => l === null)) return null;
  return viasDeLineas(punto, leidas.flatMap((l) => l ?? []), radioM);
}
