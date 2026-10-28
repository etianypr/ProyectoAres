// Lo que comparten las piezas del ordenamiento: cómo se mide un orden.

/** Costo de ir del punto `a` al punto `b`, ambos por índice. `b` puede ser FIN. */
export type Costo = (a: number, b: number) => number;

/** El final de la ruta como un punto más: `costo(x, FIN)` es lo que cuesta
 *  terminar en x. En una ruta abierta es 0; en una cerrada, volver a la base
 *  (terreno 2026-10-28: "donde empieza debe terminar"). Así las jugadas no
 *  distinguen el último tramo de los demás. */
export const FIN = -1;

/** El costo con su final: `vuelta(x)` es volver desde x, o nada (ruta abierta). */
export function conFinal(tramo: Costo, vuelta?: (a: number) => number): Costo {
  return (a, b) => (b === FIN ? (vuelta ? vuelta(a) : 0) : tramo(a, b));
}

export function distanciaOrden(orden: number[], costo: Costo): number {
  let total = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    total += costo(orden[i], orden[i + 1]);
  }
  return orden.length > 0 ? total + costo(orden[orden.length - 1], FIN) : total;
}

// Diferencia mínima para considerar que un cambio mejora. Los costos son metros
// (cientos o miles), así que esto solo frena el ruido de coma flotante: sin él,
// dos órdenes que valen lo mismo se turnarían para "mejorarse" mutuamente y el
// bucle no terminaría nunca.
export const EPSILON = 1e-6;
