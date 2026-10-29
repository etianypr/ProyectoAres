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

/** Lo que cuesta pasar por `parada` viniendo de `anterior` y siguiendo a
 *  `siguiente` (FIN = volver a la base), además de los tramos: en una calle
 *  estrecha, entrar y salir por el mismo extremo es un rodeo (terreno
 *  2026-10-29, ver generar-ruta/sentido.ts). Tiene que ser SIMÉTRICA —pen(a, s, b)
 *  igual a pen(b, s, a)—: así dar vuelta un tramo no cambia la de adentro. */
export type Penalizacion = ((anterior: number, parada: number, siguiente: number) => number) & {
  /** La penalización más alta de una parada: una jugada que empeora los tramos
   *  en más de lo que podría ahorrar en penalizaciones ni se mira. */
  maximo?: number;
};

/** La penalización de la parada en la posición k del orden. */
export function penalizacionEn(orden: number[], k: number, pen: Penalizacion): number {
  return pen(orden[k - 1], orden[k], k + 1 < orden.length ? orden[k + 1] : FIN);
}

export function distanciaOrden(orden: number[], costo: Costo, pen?: Penalizacion): number {
  let total = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    total += costo(orden[i], orden[i + 1]);
  }
  if (pen) for (let k = 1; k < orden.length; k++) total += penalizacionEn(orden, k, pen);
  return orden.length > 0 ? total + costo(orden[orden.length - 1], FIN) : total;
}

// Diferencia mínima para considerar que un cambio mejora. Los costos son metros
// (cientos o miles), así que esto solo frena el ruido de coma flotante: sin él,
// dos órdenes que valen lo mismo se turnarían para "mejorarse" mutuamente y el
// bucle no terminaría nunca.
export const EPSILON = 1e-6;
