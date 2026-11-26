// El punto de paso para Google Maps (dueño, 2026-11-25: «la navegación de Google
// Maps no es congruente con la ruta planeada por ARES; el móvil no queda en la
// dirección correcta»). Google Maps recibía solo el destino y llegaba a cada
// parada por donde quería: el auto quedaba apuntando al revés de lo que planeó la
// ruta con rumbo (spec 031) y el tramo siguiente empezaba con una vuelta.
//
// Ahora va también un punto de la línea de ARES antes de la parada: unos metros
// antes de la última esquina, en la calle por la que la ruta llega a la de la
// parada. Así Google Maps tiene que doblar en esa esquina y llega en el sentido
// planeado. Un punto en la misma calle de la parada sería más débil: Google podría
// alcanzarlo desde el otro lado y dar la vuelta ahí.
//
// Sale de la línea del día que ya está guardada (Ruta.trazado y Ruta.tramos): no
// se recalcula nada ni se consulta a nadie. Puro.
import { deLngLat, distanciaMetros, rumboEntre, type Coordenada, type Trazado } from "./coordenada";
import { tramoHacia, type LineaDelDia } from "./hacia-parada";
import { giroEntre } from "./trazado";

/** Un tramo más corto que esto no lleva punto: la parada anterior está ahí mismo. */
const TRAMO_MINIMO_M = 80;
/** Hasta dónde se busca la esquina hacia atrás desde la parada. */
const BUSCAR_ESQUINA_M = 300;
/** Cuánto tiene que doblar la línea para que sea una esquina. */
const GRADOS_ESQUINA = 40;
/** El punto va esto antes de la esquina, en la calle por la que se llega. */
const ANTES_DE_LA_ESQUINA_M = 30;
/** Sin esquina, esto antes de la parada, en su misma calle. */
const SIN_ESQUINA_M = 150;
/** El rumbo con que se llega se mide en los últimos metros. */
const RUMBO_DE_LLEGADA_M = 15;

/** El punto de la línea a `metros` de su final, recorriéndola hacia atrás. */
function aDelFinal(puntos: Coordenada[], metros: number): Coordenada {
  let falta = metros;
  for (let i = puntos.length - 1; i > 0; i--) {
    const largo = distanciaMetros(puntos[i - 1], puntos[i]);
    if (largo >= falta && largo > 0) {
      const f = falta / largo;
      return { lat: puntos[i].lat + f * (puntos[i - 1].lat - puntos[i].lat), lng: puntos[i].lng + f * (puntos[i - 1].lng - puntos[i].lng) };
    }
    falta -= largo;
  }
  return puntos[0];
}

/**
 * El punto de paso de la línea que llega a una parada (de la anterior a ella), o
 * null si el tramo es muy corto para que sirva.
 */
export function puntoDePaso(linea: Trazado): Coordenada | null {
  const puntos = linea.map(deLngLat);
  // Los pedazos hacia atrás desde la parada: rumbo y a cuántos metros del final empieza cada uno.
  const pedazos: { rumbo: number; desdeElFinal: number }[] = [];
  let recorrido = 0;
  for (let i = puntos.length - 1; i > 0; i--) {
    const largo = distanciaMetros(puntos[i - 1], puntos[i]);
    if (largo >= 1) pedazos.push({ rumbo: rumboEntre(puntos[i - 1], puntos[i]), desdeElFinal: recorrido + largo });
    recorrido += largo;
  }
  const total = recorrido;
  if (total < TRAMO_MINIMO_M || pedazos.length === 0) return null;

  // El rumbo con que se llega: el del pedazo que cubre los últimos metros.
  const llegada = (pedazos.find((p) => p.desdeElFinal >= RUMBO_DE_LLEGADA_M) ?? pedazos[pedazos.length - 1]).rumbo;
  // La esquina: donde, yendo hacia atrás, la línea venía con otro rumbo.
  let esquina = -1;
  let doblo = 0;
  let hastaAhi = 0;
  for (const p of pedazos) {
    if (hastaAhi > BUSCAR_ESQUINA_M) break;
    doblo = giroEntre(p.rumbo, llegada);
    if (doblo > GRADOS_ESQUINA) {
      esquina = hastaAhi;
      break;
    }
    hastaAhi = p.desdeElFinal;
  }

  if (esquina < 0) return aDelFinal(puntos, Math.min(SIN_ESQUINA_M, total / 2));
  // En la calle de la parada, pasada la esquina (si queda lejos de la parada).
  const pasadaLaEsquina = esquina >= 45 ? aDelFinal(puntos, esquina - 15) : null;
  // Una vuelta en U (la ruta pasa la parada, da la vuelta en la avenida y vuelve):
  // el punto va entre la vuelta y la parada. Antes de la vuelta quedaría del otro
  // lado de la parada y Google llegaría al revés.
  if (doblo > 150) return pasadaLaEsquina;
  const antes = esquina + ANTES_DE_LA_ESQUINA_M;
  // La parada anterior está justo antes de la esquina: no hay calle por la que llegar.
  if (antes > total - 10) return pasadaLaEsquina;
  return aDelFinal(puntos, antes);
}

/** Lo que hace falta de la ruta guardada: la línea del día y el orden de visita. */
export type RutaParaNavegar = LineaDelDia & { orden: string[] };

/** La parada pendiente que va antes de `pedidoId` en `ids` (null si es la primera
 *  pendiente; undefined si no está). Las cerradas no cuentan: el orden guardado las
 *  pone primero, en el orden en que se cerraron. */
function pendienteAnterior(ids: readonly (string | null)[], pedidoId: string, pendientes: ReadonlySet<string>): string | null | undefined {
  const i = ids.indexOf(pedidoId);
  if (i < 0) return undefined;
  for (let k = i - 1; k >= 0; k--) {
    const id = ids[k];
    if (id != null && pendientes.has(id)) return id;
  }
  return null;
}

/**
 * El punto de paso hacia una parada, si su tramo de la línea guardada sirve para el
 * orden de ahora: que la parada pendiente que va antes de ella sea la misma en la
 * línea y en el orden. Después de «Dejar como pendiente» o «Ahora» la línea se
 * vuelve a trazar de fondo (use-reordenar.ts) y mientras tanto no calza: null, y
 * Google Maps va solo al destino, como antes. Entregar otra parada fuera de orden
 * no cambia nada: las cerradas no cuentan (probado en el V2430, 2026-11-26).
 */
export function pasoHacia(ruta: RutaParaNavegar | null, pedidoId: string, pendientes: ReadonlySet<string>): Coordenada | null {
  const tramos = ruta?.tramos;
  if (!ruta || !tramos) return null;
  const enLaLinea = pendienteAnterior(
    tramos.map((t) => t.pedidoId),
    pedidoId,
    pendientes,
  );
  if (enLaLinea === undefined || enLaLinea !== pendienteAnterior(ruta.orden, pedidoId, pendientes)) return null;
  const tramo = tramoHacia(ruta, pedidoId);
  return tramo ? puntoDePaso(tramo.linea) : null;
}
