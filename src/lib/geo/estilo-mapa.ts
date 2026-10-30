// El mapa base de la app (spec 019): el estilo de OpenFreeMap con los tonos
// Dashund y dónde está el worker de MapLibre. Lo usan el mapa del conductor
// (app/(conductor)/…/_mapa) y la estampilla de una dirección
// (components/direccion/estampilla-mapa.ts), para que el punto se vea igual en
// los dos.
import type * as maplibregl from "maplibre-gl";

// El mapa de OpenFreeMap (spec 019; antes Mapbox, que cobra pasado lo gratis y no
// tiene tope de gasto): sin clave, sin límite y con uso comercial permitido. Es
// "Positron", el más sobrio: casi sin puntos de interés, así la ruta naranja y las
// pastillas son lo que se ve.
export const ESTILO = "https://tiles.openfreemap.org/styles/positron";

/** El worker de MapLibre, servido desde public/ (scripts/copiar-worker-mapa.mjs). */
export const URL_WORKER = "/maplibre-gl-worker.mjs";

// Positron trae las calles casi del mismo gris que el fondo: manejando no se
// distinguían. Se repinta con la paleta Dashund (tema-dashund.css): el suelo crema
// cálido, las calles blancas y algo más gruesas, y los nombres en el gris tostado
// del texto secundario.
type Pintura = Parameters<maplibregl.Map["setPaintProperty"]>;
const TONOS: [capa: string, propiedad: Pintura[1], valor: Pintura[2]][] = [
  ["background", "background-color", "#ece5dc"],
  ["landuse_residential", "fill-color", "#e6ddd3"],
  ["park", "fill-color", "#dfe2d2"],
  ["landcover_wood", "fill-color", "#d9dfcf"],
  ["water", "fill-color", "#bcd0d6"],
  ["building", "fill-color", "#e0d6cb"],
  ["building", "fill-outline-color", "#d3c7ba"],
  ["highway_minor", "line-color", "#ffffff"],
  ["highway_minor", "line-opacity", 1],
  ["highway_minor", "line-width", ["interpolate", ["exponential", 1.55], ["zoom"], 13, 2.4, 20, 24]],
  ["highway_major_casing", "line-color", "#d6cabd"],
  ["highway_major_inner", "line-color", "#ffffff"],
  ["highway_motorway_casing", "line-color", "#cfc1b2"],
  ["highway_motorway_inner", "line-color", "#fffaf4"],
  ["highway-name-minor", "text-color", "#5c5048"],
  ["highway-name-major", "text-color", "#5c5048"],
  ["label_city", "text-color", "#221a15"],
  ["label_town", "text-color", "#221a15"],
  ["label_village", "text-color", "#221a15"],
];

export function tonoDashund(mapa: maplibregl.Map): void {
  for (const [capa, propiedad, valor] of TONOS) {
    // Si OpenFreeMap renombra una capa, esa queda con su color: no rompe el mapa.
    if (mapa.getLayer(capa)) mapa.setPaintProperty(capa, propiedad, valor);
  }
}
