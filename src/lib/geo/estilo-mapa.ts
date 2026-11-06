// El mapa base de la app (spec 019): el estilo de OpenFreeMap y dónde está el
// worker de MapLibre. Lo usan el mapa del conductor (app/(conductor)/…/_mapa) y
// la estampilla de una dirección (components/direccion/estampilla-mapa.ts), para
// que el punto se vea igual en los dos.
import type * as maplibregl from "maplibre-gl";

// El mapa de OpenFreeMap (spec 019; antes Mapbox, que cobra pasado lo gratis y no
// tiene tope de gasto): sin clave, sin límite y con uso comercial permitido. Es
// "Liberty", elegido por el dueño (2026-11-06) frente a "Positron": avenidas
// amarillas y calles blancas con borde, como el "navigation-day" de Mapbox que
// usaba antes, con paraderos y comercios.
export const ESTILO = "https://tiles.openfreemap.org/styles/liberty";

/** El worker de MapLibre, servido desde public/ (scripts/copiar-worker-mapa.mjs). */
export const URL_WORKER = "/maplibre-gl-worker.mjs";

// Liberty dibuja los edificios planos solo hasta el zoom 14 y, desde ahí, en 3D.
// El dueño los quiso planos (2026-11-06): con el mapa inclinado siguiendo al auto,
// los bloques con altura le piden más a la batería en cada cuadro, y en Arica
// OpenStreetMap tiene la altura de muy pocos edificios, así que no se gana nada a
// la vista. Las teselas que se bajan son las mismas.
const EDIFICIOS_PLANOS = "building";
const EDIFICIOS_3D = "building-3d";

export function ajustarEstilo(mapa: maplibregl.Map): void {
  // Si OpenFreeMap renombra una capa, queda como viene: no rompe el mapa.
  if (mapa.getLayer(EDIFICIOS_3D)) mapa.setLayoutProperty(EDIFICIOS_3D, "visibility", "none");
  if (mapa.getLayer(EDIFICIOS_PLANOS)) mapa.setLayerZoomRange(EDIFICIOS_PLANOS, 13, 24);
}
