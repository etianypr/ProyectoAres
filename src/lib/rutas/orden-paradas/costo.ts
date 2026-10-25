// Lo que comparten las piezas del ordenamiento: cómo se mide un orden.

/** Costo de ir del punto `a` al punto `b`, ambos por índice. */
export type Costo = (a: number, b: number) => number;

export function distanciaOrden(orden: number[], costo: Costo): number {
  let total = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    total += costo(orden[i], orden[i + 1]);
  }
  return total;
}

// Diferencia mínima para considerar que un cambio mejora. Los costos son metros
// (cientos o miles), así que esto solo frena el ruido de coma flotante: sin él,
// dos órdenes que valen lo mismo se turnarían para "mejorarse" mutuamente y el
// bucle no terminaría nunca.
export const EPSILON = 1e-6;
