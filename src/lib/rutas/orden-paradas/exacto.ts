import type { Costo } from "./costo";

// Óptimo exacto (Held-Karp)
// ----------------------------------------------------------------------------
// Programación dinámica sobre subconjuntos: dp[conjunto][j] = lo mínimo que
// cuesta salir de la base, visitar exactamente ese conjunto de paradas y quedar
// parado en j. Es exponencial (2^n), pero con n chico son milisegundos y a
// cambio no queda ninguna duda: no existe un orden mejor.
//
// Devuelve null si no hay ningún recorrido completo posible (tramos sin camino
// entre sí, que Mapbox marca como Infinity): ahí no hay óptimo que dar y manda
// la heurística, que al menos devuelve algo.
export function exacto(n: number, costo: Costo): number[] | null {
  const m = n - 1; // paradas, sin contar la base
  const combinaciones = 1 << m;
  const dp = new Float64Array(combinaciones * m).fill(Infinity);
  const desde = new Int16Array(combinaciones * m).fill(-1);

  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = costo(0, j + 1);

  for (let conjunto = 1; conjunto < combinaciones; conjunto++) {
    for (let j = 0; j < m; j++) {
      if (!(conjunto & (1 << j))) continue;
      const hasta = dp[conjunto * m + j];
      if (!Number.isFinite(hasta)) continue;

      for (let k = 0; k < m; k++) {
        if (conjunto & (1 << k)) continue;
        const siguiente = conjunto | (1 << k);
        const total = hasta + costo(j + 1, k + 1);
        if (total < dp[siguiente * m + k]) {
          dp[siguiente * m + k] = total;
          desde[siguiente * m + k] = j;
        }
      }
    }
  }

  const todas = combinaciones - 1;
  let ultimo = -1;
  let mejor = Infinity;
  for (let j = 0; j < m; j++) {
    if (dp[todas * m + j] < mejor) {
      mejor = dp[todas * m + j];
      ultimo = j;
    }
  }
  if (ultimo === -1 || !Number.isFinite(mejor)) return null;

  const orden: number[] = [];
  let conjunto = todas;
  let j = ultimo;
  while (j >= 0) {
    orden.push(j + 1);
    const previo = desde[conjunto * m + j];
    conjunto ^= 1 << j;
    j = previo;
  }
  orden.reverse();
  return [0, ...orden];
}
