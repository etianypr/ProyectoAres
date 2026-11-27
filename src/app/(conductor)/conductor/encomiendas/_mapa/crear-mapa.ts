// Crear el mapa del conductor (sale de ruta-mapa.tsx, spec 047): el worker, el
// mapa guardado para verse sin conexión y el respaldo si el estilo no llega.

import { AttributionControl, Map as MapaGL, addProtocol, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { CENTRO_ARICA, aLngLat } from "@/lib/geo/coordenada";
import { PROTOCOLO, cargarRecurso, transformarPedido } from "@/lib/geo/mapa-guardado/protocolo";
import { ESTILO, URL_WORKER } from "./estilo";

/** Si el estilo no llegó en este tiempo (ni de la red ni de la copia), se sigue sin él. */
const MS_ESPERA_ESTILO = 10_000;

/** Sin el mapa de fondo: la ruta, las paradas y el auto se ven igual sobre un color
 *  liso. Las letras de los números salen de la copia, si están. */
const ESTILO_SIN_MAPA: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {},
  layers: [{ id: "fondo", type: "background", paint: { "background-color": "#f2efe9" } }],
};

let protocoloPuesto = false;

export function crearMapa(contenedor: HTMLElement): MapaGL {
  // MapLibre busca su worker al lado de su archivo, que al empaquetar deja de
  // existir: se sirve desde public/ (scripts/copiar-worker-mapa.mjs).
  setWorkerUrl(URL_WORKER);
  // Todo lo de OpenFreeMap pasa por la copia guardada (lib/geo/mapa-guardado).
  if (!protocoloPuesto) {
    addProtocol(PROTOCOLO, cargarRecurso);
    protocoloPuesto = true;
  }
  const mapa = new MapaGL({
    container: contenedor,
    style: ESTILO,
    transformRequest: transformarPedido,
    // Respaldo hasta que haya paradas o GPS.
    center: aLngLat(CENTRO_ARICA),
    zoom: 13,
    // Los controles por defecto no se montan: en el celular se hace zoom
    // con los dedos, y la esquina de arriba a la izquierda la ocupan el
    // botón "Inicio" y el cartel de navegación.
    attributionControl: false,
  });

  // La atribución es obligatoria por licencia, pero compacta: abajo a la
  // derecha ocupa lo mínimo y no tapa el botón de centrar.
  mapa.addControl(new AttributionControl({ compact: true }), "bottom-right");

  // Sin conexión y sin copia el estilo no llega, y sin estilo no hay «load»: la
  // pantalla quedaba en blanco, sin ruta ni paradas. Solo antes de cargar el
  // estilo: después, una tesela que no llega es una tesela, no el mapa entero.
  let estiloListo = false;
  let sinMapa = false;
  const seguirSinMapa = () => {
    if (estiloListo || sinMapa) return;
    sinMapa = true;
    mapa.setStyle(ESTILO_SIN_MAPA);
  };
  mapa.once("style.load", () => {
    estiloListo = true;
  });
  mapa.on("error", seguirSinMapa);
  const espera = setTimeout(seguirSinMapa, MS_ESPERA_ESTILO);
  mapa.once("remove", () => clearTimeout(espera));
  return mapa;
}
