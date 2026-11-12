// Lo que tarda el auto en la red (spec 031): a cuánto se anda en cada tipo de
// calle y lo que cuesta cada maniobra. Puro.
//
// Las velocidades no son opinión: salen de ajustar los tiempos del motor a los de
// la matriz real de ORS del fixture (5.500 pares de puntos en Arica, 2026-11-12).
// Con ellas el motor elige casi los mismos caminos que ORS y tarda lo mismo: la
// mediana de la diferencia es 0 % en metros y en segundos
// (pruebas/red-contra-ors.test.mjs lo cuida).
import { clase, PRIVADA, type Red } from "./grafo";

/** km/h en una calle SIN velocidad máxima anotada en OpenStreetMap, por clase
 *  (ver `clase` en grafo.ts): carretera, primaria, secundaria, terciaria, sin
 *  clasificar, residencial, de convivencia, de servicio y huella. */
export const KMH_SIN_MAXIMA = [80, 65, 64, 52, 30, 23.5, 10, 20, 15];
/** Con máxima anotada, se anda a esta parte de ella, por clase. */
export const PARTE_DE_LA_MAXIMA = [0.85, 0.95, 0.97, 1, 1, 0.78, 0.9, 0.9, 0.9];
/** Sin pavimento, nunca más que esto. */
export const KMH_SIN_PAVIMENTO = 30;
/** Lo que se pierde en cada cuadra frenando y acelerando, en segundos. */
export const SEGUNDOS_POR_CUADRA = 1.65;

/** Dar la vuelta en U en una calle ancha de doble sentido. */
export const MANIOBRA_U_S = 12;
/** Salir en reversa de un pasaje sin salida (dueño, 2026-11-12). */
export const MANIOBRA_REVERSA_S = 20;
/** Esperar a que abran un portón privado (un condominio). */
export const PORTON_S = 45;
/** Una calle privada es para llegar a una parada, no para acortar camino: al
 *  buscar el camino cuesta este número de veces su tiempo. El reloj cuenta el real. */
export const PESO_PRIVADA = 4;

/** A cuánto se anda en una arista: `vel` es su máxima anotada (0 si no hay), más
 *  1000 si no está pavimentada (ver scripts/generar-red.mjs). */
export function kmhDe(codigo: number, vel: number): number {
  const c = clase(codigo);
  const maxima = vel % 1000;
  const v = maxima > 0 ? maxima * PARTE_DE_LA_MAXIMA[c] : KMH_SIN_MAXIMA[c];
  return vel >= 1000 ? Math.min(v, KMH_SIN_PAVIMENTO) : v;
}

const tiempos = new WeakMap<Red, { real: Float64Array; peso: Float64Array }>();

/** Segundos de cada arista: los reales y los que pesa al buscar el camino. */
export function segundosPorArista(red: Red): { real: Float64Array; peso: Float64Array } {
  const listo = tiempos.get(red);
  if (listo) return listo;
  const real = new Float64Array(red.nAristas);
  const peso = new Float64Array(red.nAristas);
  for (let k = 0; k < red.nAristas; k++) {
    real[k] = red.largo[k] / (kmhDe(red.codigo[k], red.vel[k]) / 3.6) + SEGUNDOS_POR_CUADRA;
    peso[k] = red.codigo[k] & PRIVADA ? real[k] * PESO_PRIVADA : real[k];
  }
  const t = { real, peso };
  tiempos.set(red, t);
  return t;
}
