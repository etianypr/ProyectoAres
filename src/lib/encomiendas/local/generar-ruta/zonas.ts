// Cada zona una sola vez (terreno 2026-10-29: "abarcar todos los pedidos de una
// zona, luego otra; solamente deberíamos pasar por una zona una sola vez"). El
// criterio lo fijó el dueño: una ruta que sale y vuelve a la central repartía
// el barrio de la salida entre el principio y el final (la 4 y la 58 a 340 m).
//
// Las zonas se arman solas, por distancia por calle: se juntan los grupos de
// paradas más cercanos entre sí (enlace promedio) mientras estén a menos de
// ZONA_M. Al ordenar, cada cambio de zona cuesta CAMBIO_DE_ZONA_M de más: el
// optimizador entra a cada zona una sola vez y, dentro de eso, busca los menos
// km. Ese costo es solo para decidir el orden; los km que se muestran son los
// reales. Medido en la prueba de 66 paradas: 17 zonas, 0 repetidas, +1,4 km
// (la ruta sin zonas pisaba 2 zonas dos veces).

/** Paradas a menos de esto (promedio, por calle) son la misma zona: un barrio. */
export const ZONA_M = 900;
/** Lo que cuesta, para el orden, salir de una zona y entrar a otra. */
const CAMBIO_DE_ZONA_M = 3000;

/** La zona de cada fila de la matriz (la 0, la base, sin zona: -1). */
export function zonasPorCercania(matriz: number[][], distancia = ZONA_M): number[] {
  const n = matriz.length;
  const s = (a: number, b: number) => {
    const ida = matriz[a]?.[b];
    const vuelta = matriz[b]?.[a];
    return Number.isFinite(ida) && Number.isFinite(vuelta) ? (ida + vuelta) / 2 : Infinity;
  };
  const grupos: number[][] = Array.from({ length: n - 1 }, (_, i) => [i + 1]);
  const entre = (g: number[], h: number[]) => {
    let total = 0;
    for (const a of g) for (const b of h) total += s(a, b);
    return total / (g.length * h.length);
  };
  for (;;) {
    let mejor: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < grupos.length; i++) {
      for (let j = i + 1; j < grupos.length; j++) {
        const d = entre(grupos[i], grupos[j]);
        if (d < distancia && (!mejor || d < mejor.d)) mejor = { i, j, d };
      }
    }
    if (!mejor) break;
    grupos[mejor.i] = [...grupos[mejor.i], ...grupos[mejor.j]];
    grupos.splice(mejor.j, 1);
  }
  const zona = new Array<number>(n).fill(-1);
  grupos.forEach((g, z) => g.forEach((p) => (zona[p] = z)));
  return zona;
}

/** La matriz para ORDENAR: la real, más el costo de cambiar de zona entre dos
 *  paradas de zonas distintas. La fila y la columna 0 (salir de la base, volver
 *  a ella) no pagan. */
export function matrizPorZonas(matriz: number[][], zona: number[]): number[][] {
  return matriz.map((fila, i) =>
    fila.map((m, j) => (i > 0 && j > 0 && zona[i] !== zona[j] ? m + CAMBIO_DE_ZONA_M : m)),
  );
}

/** Cuántas zonas se pisan más de una vez en un orden de filas de la matriz. */
export function zonasRepetidas(orden: number[], zona: number[]): number {
  const vistas = new Set<number>();
  let repetidas = 0;
  let anterior: number | null = null;
  for (const p of orden) {
    const z = zona[p];
    if (z < 0 || z === anterior) continue;
    if (vistas.has(z)) repetidas++;
    vistas.add(z);
    anterior = z;
  }
  return repetidas;
}
