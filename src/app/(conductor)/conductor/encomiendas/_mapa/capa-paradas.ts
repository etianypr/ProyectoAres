// Las paradas DIBUJADAS POR EL MAPA (WebGL), no como elementos de la página
// (terreno 2026-10-29: "tantos puntos animados hacen que el rendimiento caiga").
//
// Antes cada parada era un div con sombra (filter: drop-shadow) y animación de
// entrada. Navegando, la cámara se desliza con cada lectura del GPS y el
// teléfono tenía que reubicar y repintar ~66 divs en cada cuadro. Como capa del
// mapa son parte del mismo dibujo que las calles: moverlo no cuesta nada extra.
// Lo único que sigue en el DOM es el punto del conductor (use-marcador-conductor).
import type mapboxgl from "mapbox-gl";
import type { Coordenada } from "@/lib/geo/coordenada";
import type { LugarMapa } from "./marcadores-dom";

export const FUENTE_PARADAS = "paradas";
const CAPA_SOMBRA = "paradas-sombra";
const CAPA_FONDO = "paradas-fondo";
const CAPA_CIFRAS = "paradas-cifras";

/** Los colores de la pastilla, como en el tema Dashund. */
const COLORES = {
  pendiente: "#8a7d74",
  hecha: "#0f6b45",
  previa: "#d4531a",
  activa: "#d4531a",
  central: "#221a15",
} as const;
type Estado = keyof typeof COLORES;
/** Encima la activa y la central; debajo, las hechas. */
const ENCIMA: Record<Estado, number> = { hecha: 0, pendiente: 1, previa: 2, activa: 3, central: 4 };

/** Margen del dedo: un número de 26 px se toca sin apuntar. */
const MARGEN_TOQUE_PX = 14;
/** El fundido con que entran los puntos de una ruta propuesta. */
const MS_ENTRADA = 400;

function estadoDe(l: LugarMapa, previa: boolean): Estado {
  if (previa) return "previa";
  if (l.puntos.some((p) => p.activa)) return "activa";
  if (l.puntos.every((p) => p.completada)) return "hecha";
  return "pendiente";
}

/** Lo que va escrito en un lugar con varias paradas: "40–43" si son seguidas,
 *  "41+3" si no. Antes iban todas ("41·42·43·40") y el círculo quedaba enorme;
 *  al tocarlo, el globo las sigue nombrando una por una. */
export function cifraDelLugar(etiquetas: string[]): string {
  if (etiquetas.length === 1) return etiquetas[0];
  const numeros = etiquetas.map(Number);
  if (numeros.every(Number.isInteger)) {
    const orden = [...numeros].sort((a, b) => a - b);
    if (orden.every((n, i) => i === 0 || n === orden[i - 1] + 1)) return `${orden[0]}–${orden[orden.length - 1]}`;
  }
  return `${etiquetas[0]}+${etiquetas.length - 1}`;
}

type Propiedades = { i: number; cifra: string; color: string; encima: number; radio: number; letra: number };
type Punto = { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Propiedades };
export type DatosParadas = { type: "FeatureCollection"; features: Punto[] };

/** Lo que dibuja la capa: un punto por lugar ("30·31" si caen juntas) y la
 *  central. `i` es el índice del lugar, para abrir su globo al tocarlo. */
export function datosParadas(
  lugares: LugarMapa[],
  previa: boolean,
  central: Coordenada | null,
): DatosParadas {
  const punto = (lng: number, lat: number, p: Propiedades): Punto => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: p,
  });
  const features = lugares.map((l, i) => {
    const estado = estadoDe(l, previa);
    const cifra = cifraDelLugar(l.puntos.map((p) => p.label));
    const grande = estado === "activa";
    // Tres o más caracteres ("100", "40–43") no caben en el círculo de dos.
    const largo = cifra.length;
    return punto(l.lng, l.lat, {
      i,
      cifra,
      color: COLORES[estado],
      encima: ENCIMA[estado],
      radio: (grande ? 16 : 13) + (largo >= 3 ? 3 : 0) + (largo >= 5 ? 3 : 0),
      letra: largo >= 5 ? 10 : largo >= 4 ? 11 : grande ? 13 : 11.5,
    });
  });
  if (central) {
    features.push(
      punto(central.lng, central.lat, { i: -1, cifra: "C", color: COLORES.central, encima: ENCIMA.central, radio: 16, letra: 14 }),
    );
  }
  return { type: "FeatureCollection", features };
}

/** Las tres capas: sombra, círculo y cifra. Van encima de las líneas. */
export function agregarParadas(mapa: mapboxgl.Map): void {
  mapa.addSource(FUENTE_PARADAS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // Derechas aunque el mapa esté inclinado, y del mismo tamaño cerca y lejos,
  // como eran los marcadores.
  const derecho = { "circle-pitch-alignment": "viewport", "circle-pitch-scale": "viewport" } as const;
  mapa.addLayer({
    id: CAPA_SOMBRA,
    type: "circle",
    source: FUENTE_PARADAS,
    layout: { "circle-sort-key": ["get", "encima"] },
    paint: {
      ...derecho,
      "circle-radius": ["+", ["get", "radio"], 1.5],
      "circle-color": "#221a15",
      "circle-opacity": 0.22,
      "circle-blur": 0.5,
      "circle-translate": [0, 2.5],
    },
  });
  mapa.addLayer({
    id: CAPA_FONDO,
    type: "circle",
    source: FUENTE_PARADAS,
    layout: { "circle-sort-key": ["get", "encima"] },
    paint: {
      ...derecho,
      "circle-radius": ["get", "radio"],
      "circle-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fdfbf9",
    },
  });
  mapa.addLayer({
    id: CAPA_CIFRAS,
    type: "symbol",
    source: FUENTE_PARADAS,
    layout: {
      "text-field": ["get", "cifra"],
      "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      "text-size": ["get", "letra"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "symbol-sort-key": ["get", "encima"],
      "text-pitch-alignment": "viewport",
      "text-rotation-alignment": "viewport",
    },
    paint: { "text-color": "#ffffff" },
  });
}

const OPACIDADES: [string, string, number][] = [
  [CAPA_SOMBRA, "circle-opacity", 0.22],
  [CAPA_FONDO, "circle-opacity", 1],
  [CAPA_FONDO, "circle-stroke-opacity", 1],
  [CAPA_CIFRAS, "text-opacity", 1],
];

/** Pone los puntos. Con `entrar` (aparece una ruta propuesta) entran con un
 *  fundido: una sola transición del mapa, no una animación por punto. */
export function ponerParadas(mapa: mapboxgl.Map, datos: DatosParadas, entrar: boolean): void {
  (mapa.getSource(FUENTE_PARADAS) as mapboxgl.GeoJSONSource | undefined)?.setData(datos as never);
  if (!entrar) return;
  // Los nombres de propiedad armados con texto no los conoce el tipo de Mapbox.
  const pintar = mapa.setPaintProperty.bind(mapa) as (capa: string, prop: string, valor: unknown) => void;
  for (const [capa, prop] of OPACIDADES) {
    pintar(capa, `${prop}-transition`, { duration: 0, delay: 0 });
    pintar(capa, prop, 0);
  }
  requestAnimationFrame(() => {
    for (const [capa, prop, valor] of OPACIDADES) {
      pintar(capa, `${prop}-transition`, { duration: MS_ENTRADA, delay: 0 });
      pintar(capa, prop, valor);
    }
  });
}

/** El lugar que tocó el dedo (índice en la lista de lugares), o null. */
export function lugarTocado(mapa: mapboxgl.Map, punto: mapboxgl.Point): number | null {
  const caja: [mapboxgl.PointLike, mapboxgl.PointLike] = [
    [punto.x - MARGEN_TOQUE_PX, punto.y - MARGEN_TOQUE_PX],
    [punto.x + MARGEN_TOQUE_PX, punto.y + MARGEN_TOQUE_PX],
  ];
  const tocados = mapa.queryRenderedFeatures(caja, { layers: [CAPA_FONDO] });
  // El de más arriba: la activa antes que una hecha que quedó debajo.
  const i = tocados
    .map((f) => (f as unknown as { properties?: Partial<Propiedades> }).properties)
    .map((p) => ({ i: Number(p?.i ?? -1), encima: Number(p?.encima ?? 0) }))
    .filter((t) => t.i >= 0)
    .sort((a, b) => b.encima - a.encima)[0]?.i;
  return i ?? null;
}
