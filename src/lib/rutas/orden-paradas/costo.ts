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

/** Un Costo que lee de una tabla plana: `tabla[a · ancho + b + 1]`, con la columna
 *  0 para FIN (−1 + 1).
 *
 *  Precondición (spec 038): `a` va de 0 a n − 1 y `b` de 0 a n − 1 o es FIN, con
 *  n = ancho − 1. No revisa el rango porque se lee millones de veces, y fuera de él
 *  no da Infinity como `matriz[a]?.[b] ?? Infinity`: da el número de otra fila, o
 *  undefined con `a` = FIN. Se cumple porque los órdenes que llegan son
 *  permutaciones de 0..n − 1 (el arranque de sentido.ts es la identidad). */
export type CostoEnTabla = Costo & { tabla: Float64Array; ancho: number };

/** El mismo costo, leído de una tabla plana de n × (n + 1) (spec 038, tiempos): la
 *  búsqueda a fondo lo lee millones de veces, y cada lectura pasaba por conFinal,
 *  la vuelta, `matriz[a]?.[b] ?? Infinity` o la línea recta. La tabla guarda los
 *  mismos números (Infinity, la vuelta en la columna de FIN, la línea recta), así
 *  que el orden que sale es el mismo bit a bit. Un costo que ya es tabla y alcanza
 *  para n puntos se usa tal cual. */
export function enTabla(n: number, costo: Costo): CostoEnTabla {
  const yaEs = costo as Partial<CostoEnTabla>;
  if (yaEs.tabla && yaEs.ancho != null) {
    if (yaEs.ancho - 1 >= n) return costo as CostoEnTabla;
    // Rearmarla leyendo la tabla chica fuera de su rango copiaría números corridos
    // de otra fila: una ruta con costos falsos que nada avisa. Mejor fallar fuerte
    // (spec 038, ver la precondición de CostoEnTabla).
    throw new RangeError(`un orden con el punto ${n - 1}, pero la tabla del costo es de ${yaEs.ancho - 1} puntos`);
  }
  const ancho = n + 1;
  const tabla = new Float64Array(n * ancho);
  for (let a = 0; a < n; a++) {
    tabla[a * ancho] = costo(a, FIN);
    for (let b = 0; b < n; b++) tabla[a * ancho + b + 1] = costo(a, b);
  }
  return Object.assign((a: number, b: number) => tabla[a * ancho + b + 1], { tabla, ancho });
}

/** Cuántos puntos necesita una tabla para estos órdenes: el índice más alto + 1. */
export function puntosDe(ordenes: number[][]): number {
  let n = 0;
  for (const orden of ordenes) for (const i of orden) if (i + 1 > n) n = i + 1;
  return n;
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
