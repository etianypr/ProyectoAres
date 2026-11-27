// Cómo se mueve la cámara en modo navegación: zoom, inclinación, relleno y
// cuándo girar (sale de ruta-mapa.tsx, spec 002 T038).

import type * as maplibregl from "maplibre-gl";

// Zoom e inclinación al ENTRAR a modo navegación — nivel calle y vista
// inclinada, como Google Maps/Waze al arrancar un viaje. La inclinación es lo
// que hace que se vea "hacia adelante" y no desde arriba. Después de eso el
// zoom queda en manos del conductor.
//
// En camino, 15: unas cuadras más que al llegar, para ver hacia dónde se va. A
// 250 m o menos de la parada, el de la llegada, 16.5 —la cuadra y la puerta—, que
// es el que le gusta al dueño (2026-11-09: «el zoom de la navegación no sea
// tanto»; era 18.4, la calle de su ancho real, cuando ARES guiaba; desde la spec
// 020 guía Google Maps). Con menos inclinación, por lo mismo.
export const ZOOM_NAVEGACION = 15;
export const ZOOM_LLEGADA = 16.5;
export const PITCH_NAVEGACION = 40;
const METROS_ZOOM_LLEGADA = 250;
/** Para soltar el zoom de llegada hay que alejarse más: el GPS oscila, y justo en
 *  los 250 m el mapa se acercaría y alejaría sin parar. */
const METROS_SOLTAR_LLEGADA = 300;

// El GPS avisa cada uno o dos segundos, así que animar cerca de un segundo hace
// que el mapa "fluya" en vez de dar saltos de una posición a la otra.
export const MS_DESPLAZAMIENTO = 1000;

// Zoom según la velocidad (spec 017, N12): a 30 km/h o menos, el de camino; a 60
// km/h, medio nivel más lejos, para ver el cruce que viene con unos diez segundos
// de anticipación y no cuando ya está encima (era un nivel, sobre el 18.4). Solo
// mientras el conductor no haya elegido su zoom con los dedos.
const VELOCIDAD_ZOOM_CERCA_MS = 8;
const VELOCIDAD_ZOOM_LEJOS_MS = 17;
const ZOOM_MENOS_A_VELOCIDAD = 0.5;
/** Cambios de zoom más chicos que esto no se aplican: la velocidad oscila y el
 *  mapa respiraría todo el viaje. */
export const ZOOM_MINIMO_PARA_CAMBIAR = 0.3;

function zoomPorVelocidad(velocidad: number | null | undefined): number {
  if (velocidad == null || Number.isNaN(velocidad)) return ZOOM_NAVEGACION;
  const t = Math.min(
    1,
    Math.max(0, (velocidad - VELOCIDAD_ZOOM_CERCA_MS) / (VELOCIDAD_ZOOM_LEJOS_MS - VELOCIDAD_ZOOM_CERCA_MS)),
  );
  return ZOOM_NAVEGACION - t * ZOOM_MENOS_A_VELOCIDAD;
}

/** ¿Llegando a la parada? Entra a ≤ 250 m y sale pasados los 300 m. Pura. */
export function llegandoAParada(metros: number | null, antes: boolean): boolean {
  if (metros == null) return false;
  return metros <= (antes ? METROS_SOLTAR_LLEGADA : METROS_ZOOM_LLEGADA);
}

/** El zoom del seguimiento: el de la llegada cerca de la parada; si no, el de
 *  camino según la velocidad. Pura. */
export function zoomDeSeguimiento(velocidad: number | null | undefined, llegando: boolean): number {
  return llegando ? ZOOM_LLEGADA : zoomPorVelocidad(velocidad);
}

// ----------------------------------------------------------------------------
// En ruta: el auto y el camino por delante (dueño, 2026-11-16 y 2026-11-26)
// ----------------------------------------------------------------------------
// Con una parada activa, «Centrar» no se pega al auto: encuadra el auto y la
// línea que viene, girada al camino y sin inclinación (con perspectiva el
// encuadre no calza y lo de arriba se achica). Desde la spec 047 ARES guía: el
// dueño quiere «una vista general desde arriba, pudiendo distinguir calles, y que
// se vaya acercando a medida que avanza». Antes se encuadraban el auto y la
// parada: a 3 km el mapa quedaba a nivel ciudad y no se leían las calles. Ahora,
// lejos, se ven ~800 m de línea por delante (zoom ~15,2 a 360 px: más lejos
// Liberty ya no nombra las calles chicas); más cerca que eso, el
// encuadre se achica solo hasta la cuadra.
/** Tope de zoom del encuadre: con el auto encima de la parada, la cuadra. */
export const ZOOM_MAXIMO_ENCUADRE = 17;
/** Piso: de ahí para abajo Liberty ya no nombra las calles chicas (minzoom 15). */
export const ZOOM_PISO_NAVEGACION = 15;
/** Cuánta línea por delante se encuadra. */
export const METROS_ADELANTE = 800;
/** Margen a los lados del encuadre (arriba y abajo los pone la pantalla). */
export const RELLENO_LADOS_ENCUADRE = 48;
/** Cambios de zoom del encuadre más chicos que esto no se aplican (el GPS oscila). */
export const ZOOM_MINIMO_ENCUADRE = 0.1;
/** Si el camino no cabe, el auto queda a esta altura de lo visible (de arriba abajo). */
const AUTO_ABAJO = 0.8;
/** Metros por pixel a zoom 0 en el ecuador (MapLibre: teselas de 512 px). */
const MPP_ZOOM_0 = 78_271.517;
const M_POR_GRADO = 111_195;

type Punto = { lat: number; lng: number };

/** El auto y la línea por delante hasta `metros` (la línea empieza en el auto; ver
 *  hacia-parada.ts). Sin línea, la recta hacia el destino con el mismo tope. Pura. */
export function puntosDelEncuadre(auto: Punto, porDelante: [number, number][] | null, destino: Punto | null, metros = METROS_ADELANTE): Punto[] {
  const puntos: Punto[] = [auto];
  const camino: Punto[] =
    porDelante && porDelante.length > 1 ? porDelante.map(([lng, lat]) => ({ lat, lng })) : destino ? [auto, destino] : [];
  const cos = Math.cos((auto.lat * Math.PI) / 180);
  let falta = metros;
  for (let k = 1; k < camino.length && falta > 0; k++) {
    const [a, b] = [camino[k - 1], camino[k]];
    const largo = Math.hypot((b.lat - a.lat) * M_POR_GRADO, (b.lng - a.lng) * M_POR_GRADO * cos);
    if (largo >= falta) {
      const t = largo > 0 ? falta / largo : 0;
      puntos.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      return puntos;
    }
    puntos.push(b);
    falta -= largo;
  }
  return puntos;
}

/**
 * La cámara que encuadra `puntos` con el mapa girado a `rumbo` (lo que está hacia
 * `rumbo` queda arriba) en una vista de `ancho` × `alto` px menos los rellenos.
 * Devuelve el centro (con esos rellenos puestos) y el zoom, entre el piso y el
 * tope. Si no cabe, el auto (el primer punto) queda abajo y a la vista. Pura.
 */
export function encuadreGirado(
  puntos: Punto[],
  rumbo: number,
  vista: { ancho: number; alto: number; arriba: number; abajo: number; lados: number },
  zoomMin = ZOOM_PISO_NAVEGACION,
  zoomMax = ZOOM_MAXIMO_ENCUADRE,
): { centro: Punto; zoom: number } {
  const origen = puntos[0];
  const cos = Math.cos((origen.lat * Math.PI) / 180);
  const r = (rumbo * Math.PI) / 180;
  // Ejes de la pantalla en metros (x al este, y al norte): «arriba» es el rumbo.
  const enPantalla = (p: Punto) => {
    const x = (p.lng - origen.lng) * M_POR_GRADO * cos;
    const y = (p.lat - origen.lat) * M_POR_GRADO;
    return { u: x * Math.cos(r) - y * Math.sin(r), v: x * Math.sin(r) + y * Math.cos(r) };
  };
  const enMetros = puntos.map(enPantalla);
  const minU = Math.min(...enMetros.map((p) => p.u));
  const maxU = Math.max(...enMetros.map((p) => p.u));
  const minV = Math.min(...enMetros.map((p) => p.v));
  const maxV = Math.max(...enMetros.map((p) => p.v));
  const anchoPx = Math.max(40, vista.ancho - 2 * vista.lados);
  const altoPx = Math.max(40, vista.alto - vista.arriba - vista.abajo);
  // De alto, el camino entero y además el auto no más abajo que AUTO_ABAJO: pegado
  // al borde quedaría bajo los botones del mapa.
  const altoM = Math.max(maxV - minV, maxV / AUTO_ABAJO);
  const mpp = Math.max((maxU - minU) / anchoPx, altoM / altoPx, 1e-6);
  const zoom = Math.min(zoomMax, Math.max(zoomMin, Math.log2((MPP_ZOOM_0 * cos) / mpp)));
  // Con el zoom ya topado, lo que se ve de verdad. El auto (u = v = 0) queda entre
  // el 20 % y el 80 % de lo visible, cabido o no el camino.
  const mppReal = (MPP_ZOOM_0 * cos) / 2 ** zoom;
  const medioAncho = (anchoPx * mppReal) / 2;
  const medioAlto = (altoPx * mppReal) / 2;
  const holguraV = medioAlto * (2 * AUTO_ABAJO - 1);
  const cu = Math.min(medioAncho * AUTO_ABAJO, Math.max(-medioAncho * AUTO_ABAJO, (minU + maxU) / 2));
  const cv = Math.min(holguraV, Math.max(-holguraV, (minV + maxV) / 2));
  // De vuelta a metros al este y al norte, y a grados.
  const x = cu * Math.cos(r) + cv * Math.sin(r);
  const y = -cu * Math.sin(r) + cv * Math.cos(r);
  return { centro: { lat: origen.lat + y / M_POR_GRADO, lng: origen.lng + x / (M_POR_GRADO * cos) }, zoom };
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
