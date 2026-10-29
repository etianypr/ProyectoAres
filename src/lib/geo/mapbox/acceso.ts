// El punto de una parada pegado a una carretera (terreno 2026-10-29).
//
// Mapbox engancha cada parada a la calle MÁS CERCANA. Una casa de un condominio
// junto a la Av. Capitán Ávalos (la Ruta 5, troncal y con bandejón) quedaba
// enganchada a la carretera, y llegar a "ese punto de la carretera" era subir
// hasta un retorno y bajar: 6,8 km para una parada a 280 m de otras. Ni el aviso
// de paradas lejanas lo veía: la parada no está lejos, el punto está mal pegado.
//
// Antes de armar la ruta se mira qué calles hay alrededor de cada parada
// (Tilequery de Mapbox, la misma cuenta). Si la más cercana es una carretera o
// troncal que NO es la calle de la dirección, el punto se corre a la calle local
// más cercana —mejor si es la de la dirección—. Si la dirección es de esa misma
// avenida ("Avenida Capitán Ávalos 1234"), no se toca.
import type { Coordenada } from "@/lib/geo/coordenada";
import { palabrasDe } from "@/lib/geo/geocoding/consulta";
import { tope } from "@/lib/comun/tope";
import { tokenMapbox } from "./token";

/** Clases de Mapbox Streets v8 donde no se entrega: se llega por otra calle. */
const CARRETERAS = new Set(["motorway", "motorway_link", "trunk", "trunk_link"]);
const MANEJABLES = new Set([
  ...CARRETERAS,
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "street",
  "street_limited",
  "service",
]);
/** Hasta dónde se busca la calle local. */
const RADIO_M = 150;
/** Palabras que no distinguen una calle de otra. */
const GENERICAS = new Set([
  "avenida", "av", "avda", "calle", "pasaje", "pje", "psje", "ruta", "camino", "sector",
  "norte", "sur", "oriente", "poniente", "de", "del", "la", "las", "los", "el", "y",
]);

export type ViaCercana = { clase: string; nombre: string | null; metros: number; punto: Coordenada };
export type Acceso = { punto: Coordenada; calle: string | null; metros: number; carretera: string | null };

function palabrasDeCalle(texto: string): Set<string> {
  return new Set(palabrasDe(texto).filter((p) => !GENERICAS.has(p) && !/^\d+$/.test(p)));
}

/** ¿Es la misma calle? Basta una palabra que importe en común ("Santiago Arata"
 *  y "AVENIDA SANTIAGO ARATA GANDOLFO"). */
export function mismaCalle(a: string, b: string): boolean {
  const pa = palabrasDeCalle(a);
  for (const p of palabrasDeCalle(b)) if (pa.has(p)) return true;
  return false;
}

/** La calle de una dirección: lo que va antes del primer número o coma. */
export function calleDeLaDireccion(direccion: string): string {
  return direccion.split(/[,\d]/)[0].trim();
}

/** Pura: con las calles de alrededor, adónde correr el punto, o null si no hay
 *  que moverlo. */
export function elegirAcceso(vias: ViaCercana[], direccion: string): Acceso | null {
  const manejables = vias.filter((v) => MANEJABLES.has(v.clase)).sort((a, b) => a.metros - b.metros);
  const cercana = manejables[0];
  if (!cercana || !CARRETERAS.has(cercana.clase)) return null;
  const calle = calleDeLaDireccion(direccion);
  if (cercana.nombre && mismaCalle(cercana.nombre, calle)) return null;
  const locales = manejables.filter((v) => !CARRETERAS.has(v.clase) && v.metros <= RADIO_M);
  const elegida = locales.find((v) => v.nombre && mismaCalle(v.nombre, calle)) ?? locales[0];
  if (!elegida) return null;
  return { punto: elegida.punto, calle: elegida.nombre, metros: Math.round(elegida.metros), carretera: cercana.nombre };
}

type RespuestaTilequery = {
  features?: {
    geometry?: { coordinates?: [number, number] };
    properties?: { class?: string; name?: string; tilequery?: { distance?: number } };
  }[];
};

/** El punto de acceso de una parada, o null si está bien donde está (o no hubo
 *  respuesta: sin señal se usa el punto de siempre). */
export async function puntoDeAcceso(punto: Coordenada, direccion: string): Promise<Acceso | null> {
  const token = tokenMapbox();
  if (!token) return null;
  const q = new URLSearchParams({ radius: String(RADIO_M), limit: "20", layers: "road", dedupe: "true", access_token: token });
  try {
    const res = await fetch(
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${punto.lng},${punto.lat}.json?${q}`,
      { signal: tope(8_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as RespuestaTilequery;
    const vias: ViaCercana[] = (json.features ?? []).flatMap((f) => {
      const c = f.geometry?.coordinates;
      const clase = f.properties?.class;
      const metros = f.properties?.tilequery?.distance;
      return c && clase && metros != null
        ? [{ clase, nombre: f.properties?.name ?? null, metros, punto: { lng: c[0], lat: c[1] } }]
        : [];
    });
    return elegirAcceso(vias, direccion);
  } catch {
    return null;
  }
}
