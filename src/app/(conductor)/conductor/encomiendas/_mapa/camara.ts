// Cómo se mueve la cámara en modo navegación: zoom, inclinación, relleno y
// cuándo girar (sale de ruta-mapa.tsx, spec 002 T038).

import type * as maplibregl from "maplibre-gl";

// Zoom e inclinación al ENTRAR a modo navegación — nivel calle y vista
// inclinada, como Google Maps/Waze al arrancar un viaje. La inclinación es lo
// que hace que se vea "hacia adelante" y no desde arriba. Después de eso el
// zoom queda en manos del conductor.
//
// 16.5, el mismo zoom con que se enfoca una parada: unas cuadras alrededor y las
// paradas cercanas. Era 18.4 (la calle de su ancho real, para mirar la maniobra)
// cuando ARES guiaba; desde la spec 020 guía Google Maps, y en ARES «Centrar»
// quedaba muy cerca y poco estético (dueño, 2026-11-09). Con menos inclinación,
// por lo mismo.
export const ZOOM_NAVEGACION = 16.5;
export const PITCH_NAVEGACION = 40;

// El GPS avisa cada uno o dos segundos, así que animar cerca de un segundo hace
// que el mapa "fluya" en vez de dar saltos de una posición a la otra.
export const MS_DESPLAZAMIENTO = 1000;

// Zoom según la velocidad (spec 017, N12): a 30 km/h o menos, la cuadra de
// cerca; a 60 km/h, un nivel más lejos, para ver el cruce que viene con unos
// diez segundos de anticipación y no cuando ya está encima. Solo mientras el
// conductor no haya elegido su zoom con los dedos.
export const VELOCIDAD_ZOOM_CERCA_MS = 8;
export const VELOCIDAD_ZOOM_LEJOS_MS = 17;
export const ZOOM_MENOS_A_VELOCIDAD = 1;
/** Cambios de zoom más chicos que esto no se aplican: la velocidad oscila y el
 *  mapa respiraría todo el viaje. */
export const ZOOM_MINIMO_PARA_CAMBIAR = 0.3;

export function zoomPorVelocidad(velocidad: number | null | undefined): number {
  if (velocidad == null || Number.isNaN(velocidad)) return ZOOM_NAVEGACION;
  const t = Math.min(
    1,
    Math.max(0, (velocidad - VELOCIDAD_ZOOM_CERCA_MS) / (VELOCIDAD_ZOOM_LEJOS_MS - VELOCIDAD_ZOOM_CERCA_MS)),
  );
  return ZOOM_NAVEGACION - t * ZOOM_MENOS_A_VELOCIDAD;
}

// ----------------------------------------------------------------------------
// Dónde queda el punto del conductor en la pantalla
// ----------------------------------------------------------------------------
// En el centro del contenedor, sin relleno. Con el mapa girado al rumbo, lo que
// viene queda ARRIBA del punto, y a 55° de inclinación esa mitad de arriba
// abarca varias cuadras mientras la de abajo apenas llega a media: la pantalla
// mira adelante sola, por la perspectiva. Sumado a que la hoja colapsada tapa
// los últimos 84 px, sobre el mapa que se ve el punto queda como a un 60%, que
// es exactamente el encuadre de la foto.
//
// Acá hubo un relleno de 45% abajo, puesto para "bajar el punto". Hace lo
// contrario: `padding` corre el centro de la cámara hacia el lado que queda
// libre, así que un relleno abajo SUBE el punto y deja media pantalla mostrando
// la calle que ya se pasó.
//
// Sin relleno el centro de la cámara cae justo sobre el punto, que es lo que lo
// vuelve el PIVOTE del giro: al doblar, el mapa gira alrededor del conductor. Con
// el centro corrido, el punto describe un arco — se ve como si el auto
// derrapara.
//
// Igual hay que pasarlo en CADA movimiento: el relleno queda pegado al mapa y
// los fitBounds de más abajo dejan el suyo puesto. Sin esto, al descartar una
// ruta propuesta (que encuadra con 48% abajo) el punto arrancaría el viaje
// pegado al borde de arriba.
export const SIN_RELLENO: maplibregl.PaddingOptions = { top: 0, right: 0, bottom: 0, left: 0 };

// Por debajo de esto no se gira. El rumbo casi siempre viene estimado (en
// iPhone el GPS no entrega heading), así que oscila uno o dos grados entre
// lecturas aunque el auto vaya derecho: sin este piso el mapa vibra todo el
// viaje, y cada vibración es una animación de un segundo que se pisa con la
// siguiente.
export const GRADOS_MINIMOS_PARA_GIRAR = 4;

/** Diferencia entre dos rumbos, siempre 0-180. */
export function difAngulo(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}
