// El estilo del mapa, sus fuentes de líneas y la comprobación de WebGL (sale de
// ruta-mapa.tsx, spec 002 T038).

import type * as maplibregl from "maplibre-gl";
import type { Trazado } from "@/lib/geo/coordenada";

// El estilo, el worker y sus ajustes viven en lib/geo/estilo-mapa.ts: los
// comparte la estampilla de una dirección (components/direccion).
export { ESTILO, URL_WORKER, ajustarEstilo } from "@/lib/geo/estilo-mapa";

export const FUENTE_DIA = "ruta-dia";
export const FUENTE_NAV = "ruta-navegacion";
// Ruta propuesta y todavía no guardada (ver vista-previa-ruta.tsx). Se dibuja
// cortada y en color de marca: es una ruta "en borrador", distinta a la línea
// azul de "por acá tienes que ir ahora".
export const FUENTE_PREVIA = "ruta-previa";

// El mapa necesita WebGL. Se comprueba ANTES de intentar crearlo: si no está,
// `new Map` explota y el conductor se queda con una pantalla gris sin
// explicación.
export function soportaWebGL(): boolean {
  if (typeof document === "undefined") return true; // en el servidor no se sabe
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Una línea de la ruta, con su casco claro debajo si lo lleva: así se lee
 *  sobre cualquier calle. */
function agregarLinea(
  mapa: maplibregl.Map,
  fuente: string,
  pintura: { color: string; ancho: number; opacidad: number },
  casco: number | null,
  debajoDe: string | undefined,
): void {
  mapa.addSource(fuente, { type: "geojson", data: linea() });
  const forma = { "line-join": "round", "line-cap": "round" } as const;
  if (casco != null) {
    mapa.addLayer(
      {
        id: `${fuente}-casco`,
        type: "line",
        source: fuente,
        layout: forma,
        paint: { "line-color": "#fdfbf9", "line-width": casco, "line-opacity": 0.95 },
      },
      debajoDe,
    );
  }
  mapa.addLayer(
    {
      id: fuente,
      type: "line",
      source: fuente,
      layout: forma,
      paint: { "line-color": pintura.color, "line-width": pintura.ancho, "line-opacity": pintura.opacidad },
    },
    debajoDe,
  );
}

/** La primera capa de textos e íconos del mapa base: las líneas van debajo de ella. */
function primeraCapaDeTextos(mapa: maplibregl.Map): string | undefined {
  return mapa.getStyle()?.layers?.find((c) => c.type === "symbol")?.id;
}

/** Las tres líneas, en el orden en que se apilan: la del día abajo y apagada
 *  (gris cálido); encima la de navegación y, encima de todo, la propuesta —
 *  cuando hay una, es lo único que hay que mirar—, las dos en el naranja de
 *  Dashund (tema-dashund.css). Todas DEBAJO de los nombres de las calles (spec
 *  047): manejando con ARES, la línea naranja tapaba el nombre de la calle por
 *  la que se va. Las paradas se agregan después y quedan encima de todo. */
export function agregarLineas(mapa: maplibregl.Map): void {
  const debajoDe = primeraCapaDeTextos(mapa);
  agregarLinea(mapa, FUENTE_DIA, { color: "#8a7d74", ancho: 3, opacidad: 0.55 }, null, debajoDe);
  agregarLinea(mapa, FUENTE_NAV, { color: "#d4531a", ancho: 6, opacidad: 0.95 }, 9, debajoDe);
  agregarLinea(mapa, FUENTE_PREVIA, { color: "#d4531a", ancho: 5, opacidad: 1 }, 8.5, debajoDe);
}

/** Los nombres de las calles de Liberty (2026-11-26); si OpenFreeMap renombra una
 *  capa, queda como viene. */
const NOMBRES_DE_CALLES = ["highway-name-path", "highway-name-minor", "highway-name-major"];

/** Manejando se miran de lejos (spec 047): un 20 % más grandes que en Liberty
 *  (13 px a zoom 14), y más a medida que se acerca. Solo en el mapa del conductor. */
export function agrandarNombresDeCalles(mapa: maplibregl.Map): void {
  for (const id of NOMBRES_DE_CALLES) {
    if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "text-size", ["interpolate", ["linear"], ["zoom"], 13, 13, 15, 16, 17, 18]);
  }
}

type LineaGeoJSON = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: Trazado };
};

export function linea(coordenadas?: Trazado | null): LineaGeoJSON {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coordenadas ?? [] },
  };
}
