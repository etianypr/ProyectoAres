// Cuánto falta hasta la parada activa, sin pedir ninguna ruta (spec 020).
//
// ARES ya no guía —guía Google Maps—, pero la tarjeta sigue mostrando los km y la
// hora de llegada, el mapa la línea de lo que falta y el auto pegado a la calle.
// Todo eso sale del TRAMO de la línea del día que llega a la parada (Ruta.tramos):
// la línea del día ya se pidió al armar la ruta, así que medir sobre ella es
// gratis. Si el auto no va por ese tramo (se desvió, el orden cambió con "Dejar
// como pendiente", o la ruta se guardó antes de la 020 sin tramos), los metros
// van en línea recta y sin lo demás.
//
// Puro: el pegado (con su memoria del último vértice) lo hace usePuntoEnRuta.

import { distanciaMetros, type Coordenada, type Trazado } from "./coordenada";
import { metrosRestantes, recortarTrazado, rumboDelCamino, type PosicionPegada } from "./trazado";

/** Lo que se guarda de la línea del día (ver Ruta en almacen/tipos.ts). */
export type LineaDelDia = {
  trazado: Trazado | null;
  tramos?: { pedidoId: string | null; desde: number; hasta: number; metros: number; segundos: number }[] | null;
};

/** El pedazo de la línea del día que llega a una parada. */
export type TramoHacia = { linea: Trazado; metros: number; segundos: number };

/** El tramo que llega a `pedidoId`, o null si la ruta no lo tiene (o sus índices
 *  no calzan con el trazado, que es lo mismo que no tenerlo). */
export function tramoHacia(ruta: LineaDelDia | null, pedidoId: string): TramoHacia | null {
  const trazado = ruta?.trazado;
  const tramo = ruta?.tramos?.find((t) => t.pedidoId === pedidoId);
  if (!trazado || !tramo) return null;
  const { desde, hasta } = tramo;
  if (!(desde >= 0 && desde < hasta && hasta < trazado.length)) return null;
  return { linea: trazado.slice(desde, hasta + 1), metros: tramo.metros, segundos: tramo.segundos };
}

export type HaciaParada = {
  metros: number;
  /** Proporcional a lo que falta del tramo; null fuera de él. */
  segundos: number | null;
  /** true = medido por el tramo; false = en línea recta. */
  porTramo: boolean;
  /** Lo que falta del tramo, desde el punto pegado (la línea naranja). */
  porDelante: Trazado | null;
  /** Hacia dónde sigue el camino; null fuera del tramo (se usa el del GPS). */
  rumbo: number | null;
};

/**
 * Cuánto falta desde `posicion` hasta `destino`. `pegado` es la posición pegada
 * a `tramo.linea` (null si el auto está a más de 90 m de él).
 */
export function haciaParada(
  posicion: Coordenada,
  destino: Coordenada,
  tramo: TramoHacia | null,
  pegado: PosicionPegada | null,
): HaciaParada {
  if (!tramo || !pegado) {
    return {
      metros: Math.round(distanciaMetros(posicion, destino)),
      segundos: null,
      porTramo: false,
      porDelante: null,
      rumbo: null,
    };
  }
  const porDelante = recortarTrazado(tramo.linea, pegado);
  const metros = metrosRestantes(pegado, porDelante);
  return {
    metros,
    segundos: tramo.metros > 0 ? Math.round((tramo.segundos * metros) / tramo.metros) : null,
    porTramo: true,
    porDelante,
    rumbo: rumboDelCamino(pegado, tramo.linea, 45, pegado.indice),
  };
}
