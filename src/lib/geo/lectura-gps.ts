// ¿Esta lectura del GPS mueve el punto del conductor? (sale de use-ubicacion-actual.ts)
//
// Se tiran las lecturas imprecisas y los saltos imposibles, que son el GPS rebotando entre
// edificios. Pero con ARES guiando (spec 047) un punto quieto deja la navegación inútil (dueño,
// 2026-11-27: «quiero que siempre actualice la ubicación del móvil»): si la última lectura
// aceptada ya tiene más de MS_REFERENCIA_VIEJA, la que llega entra igual, imprecisa o no, y el
// aviso de GPS débil dice que es aproximada. Puro.
import { distanciaMetros } from "./coordenada";

/** Una lectura con más error que esto no ubica ni la manzana. */
export const PRECISION_MAXIMA_M = 60;
/** Más rápido que esto entre dos lecturas no es un auto (~200 km/h). */
export const VELOCIDAD_IMPOSIBLE_MS = 55;
/** Sin mover el punto en este tiempo, cualquier lectura sirve más que ninguna. */
export const MS_REFERENCIA_VIEJA = 5_000;

export type LecturaGps = { lat: number; lng: number; tomadaEn: number; precisionM: number | null };

export function aceptarLectura(anterior: LecturaGps | null, nueva: LecturaGps, simulado = false): boolean {
  if (!anterior) return true;
  if (nueva.tomadaEn - anterior.tomadaEn > MS_REFERENCIA_VIEJA) return true;
  // La primera lectura entra aunque sea mala, y antes eso la dejaba de referencia: las buenas que
  // venían después «saltaban» más rápido de lo posible desde ella y se tiraban todas (spec 017,
  // N8). Si la que hay es mala, cualquier lectura más precisa la reemplaza, sin freno de velocidad.
  const anteriorBuena = anterior.precisionM == null || anterior.precisionM <= PRECISION_MAXIMA_M;
  if (nueva.precisionM != null && nueva.precisionM > PRECISION_MAXIMA_M) {
    if (anteriorBuena || nueva.precisionM >= (anterior.precisionM ?? Infinity)) return false;
  }
  const segundos = Math.max(0.001, (nueva.tomadaEn - anterior.tomadaEn) / 1000);
  // El simulado a ×10 o ×20 va «imposiblemente» rápido a propósito.
  if (anteriorBuena && !simulado && distanciaMetros(anterior, nueva) / segundos > VELOCIDAD_IMPOSIBLE_MS) return false;
  return true;
}
