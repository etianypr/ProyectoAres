// Construcción: dos formas distintas de armar un primer orden.
import { FIN, type Costo } from "./costo";

/** Vecino más cercano. `primero` fuerza por cuál parada empezar (multi-arranque). */
export function vecinoMasCercano(n: number, costo: Costo, primero?: number): number[] {
  const visitado = new Array<boolean>(n).fill(false);
  visitado[0] = true;
  const orden = [0];
  let actual = 0;

  for (let k = 1; k < n; k++) {
    // Con la matriz de calles un costo puede ser Infinity (dos paradas sin
    // camino entre sí, según Mapbox), cosa que en línea recta no pasa nunca.
    // Si TODAS las que quedan son inalcanzables no hay "más cercana", así que
    // se toma la primera pendiente: mejor una parada en un orden discutible que
    // un índice -1 metido en la ruta.
    let mejor = -1;
    if (k === 1 && primero != null && primero > 0 && primero < n) {
      mejor = primero;
    } else {
      let mejorDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (visitado[j]) continue;
        if (mejor === -1) mejor = j;
        const d = costo(actual, j);
        if (d < mejorDist) {
          mejorDist = d;
          mejor = j;
        }
      }
    }
    visitado[mejor] = true;
    orden.push(mejor);
    actual = mejor;
  }
  return orden;
}

/** Inserción más barata: en cada vuelta mete la parada que menos alargue la
 *  ruta, en el lugar donde menos la alargue. Suele arrancar bastante mejor que
 *  el vecino más cercano, que deja las últimas paradas tiradas lejos. */
export function insercionMasBarata(n: number, costo: Costo): number[] {
  const orden = [0];
  const pendientes = new Set<number>();
  for (let i = 1; i < n; i++) pendientes.add(i);

  while (pendientes.size > 0) {
    let mejorParada = -1;
    let mejorPosicion = orden.length;
    let mejorCosto = Infinity;

    for (const parada of pendientes) {
      for (let p = 1; p <= orden.length; p++) {
        const a = orden[p - 1];
        const b = p < orden.length ? orden[p] : FIN;
        const delta = costo(a, parada) + costo(parada, b) - costo(a, b);
        if (delta < mejorCosto) {
          mejorCosto = delta;
          mejorParada = parada;
          mejorPosicion = p;
        }
      }
    }
    // Todo inalcanzable: se pega al final y se sigue.
    if (mejorParada === -1) mejorParada = pendientes.values().next().value!;

    orden.splice(mejorPosicion, 0, mejorParada);
    pendientes.delete(mejorParada);
  }
  return orden;
}
