// El estilo del mapa, sus fuentes de líneas y la comprobación de WebGL (sale de
// ruta-mapa.tsx, spec 002 T038).

import type mapboxgl from "mapbox-gl";
import type { Trazado } from "@/lib/geo/coordenada";
import { tokenMapbox } from "@/lib/geo/mapbox/token";

// Estilo pensado para manejar: calles más gruesas, menos ruido de puntos de
// interés y mejor contraste que el estilo genérico.
export const ESTILO = "mapbox://styles/mapbox/navigation-day-v1";

// Este estilo trae, ENCIMA de cada calle, las capas de tráfico de Mapbox
// (source-layer "traffic"), que colorean la congestión. El nivel "low" —tráfico
// fluido— lo pinta de hsl(120, 70%, 60%): un verde fosforescente. En Arica casi
// nunca hay atasco, así que "low" es prácticamente toda la ciudad y el mapa
// terminaba forrado en ese verde, que además no tiene nada que ver con la
// paleta de la app.
//
// La solución no es cambiar de estilo (el resto de navigation-day-v1 —calles
// gruesas, pocos POI— es justo lo que sirve para manejar), sino repintar esas
// capas: el verde se apaga del todo y quedan solo los tres niveles que sí son
// información, con los colores de la app.
const COLOR_CONGESTION: [string, ...unknown[]] = [
  "match",
  ["get", "congestion"],
  "moderate",
  "#b45309", // --warn
  "heavy",
  "#c0362c", // --danger
  "severe",
  "#7a1f18", // --danger, más oscuro
  "transparent",
];

// "low" no se dibuja: que la ciudad entera esté pintada de "acá se puede
// circular bien" no le dice nada al conductor, solo ensucia el mapa.
const OPACIDAD_CONGESTION: [string, ...unknown[]] = [
  "match",
  ["get", "congestion"],
  ["moderate", "heavy", "severe"],
  0.8,
  0,
];

export function apagarVerdeDelTrafico(mapa: mapboxgl.Map): void {
  for (const capa of mapa.getStyle()?.layers ?? []) {
    if (capa.type !== "line" || capa["source-layer"] !== "traffic") continue;

    // Las capas de congestión traen el color como expresión (un "match" sobre
    // la propiedad congestion); las de contorno lo traen como color fijo —esas
    // son el reborde blanco de las autopistas y no hay que recolorearlas, solo
    // que desaparezcan junto con la línea que envuelven.
    if (Array.isArray(capa.paint?.["line-color"])) {
      mapa.setPaintProperty(capa.id, "line-color", COLOR_CONGESTION);
    }
    mapa.setPaintProperty(capa.id, "line-opacity", OPACIDAD_CONGESTION);
  }
}

export const FUENTE_DIA = "ruta-dia";
export const FUENTE_NAV = "ruta-navegacion";
// Ruta propuesta y todavía no guardada (ver vista-previa-ruta.tsx). Se dibuja
// cortada y en color de marca: es una ruta "en borrador", distinta a la línea
// azul de "por acá tienes que ir ahora".
export const FUENTE_PREVIA = "ruta-previa";

// Se lee a nivel de módulo (Next.js reemplaza las NEXT_PUBLIC_* al compilar):
// así la falta del token se puede mostrar en el dibujado, sin estado ni efectos.
export const TOKEN = tokenMapbox();

// Mapbox necesita WebGL. Se comprueba ANTES de intentar crear el mapa: si no
// está, `new mapboxgl.Map` explota y el conductor se queda con una pantalla gris
// sin explicación.
export function soportaWebGL(): boolean {
  if (typeof document === "undefined") return true; // en el servidor no se sabe
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch {
    return false;
  }
}

export type LineaGeoJSON = {
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
