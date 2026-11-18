// Mejora local: 2-opt y Or-opt hasta que ninguna encuentra nada.
//
// Spec 038 (tiempos): las jugadas leen el costo de la tabla plana de costo.ts
// (`T[a · ancho + b + 1]`, FIN en la columna 0) y el Or-opt evalúa sin armar
// arreglos por jugada. Las sumas van en el mismo orden que antes, así que cada
// jugada vale lo mismo bit a bit y la ruta que sale es la misma.
import { EPSILON, FIN, enTabla, puntosDe, type Costo, type Penalizacion } from "./costo";

/** Cuántas paradas seguidas prueba mover el Or-opt. Más de 3 casi no encuentra
 *  nada nuevo y multiplica el trabajo. */
const MAX_SEGMENTO_OROPT = 3;

/** Tope de vueltas de mejora local. Cada vuelta mejora de verdad (el EPSILON lo
 *  garantiza), así que el bucle termina solo; esto es un cinturón por si un
 *  costo raro —NaN de una matriz mal formada— rompiera esa garantía. */
const MAX_VUELTAS = 400;

/** La penalización de la parada en la posición k de un orden dado por función
 *  (sin armar el arreglo: se evalúan miles de jugadas por pasada). */
function penEn(en: (k: number) => number, k: number, n: number, pen: Penalizacion): number {
  return pen(en(k - 1), en(k), k + 1 < n ? en(k + 1) : FIN);
}

/** Cuánto cambia la penalización al dar vuelta el tramo [i..j]. Adentro del
 *  tramo cada parada conserva sus dos vecinos (dados vuelta) y la penalización
 *  es simétrica: solo cambian los dos bordes y sus vecinos de afuera. */
function deltaPenDosOpt(orden: number[], i: number, j: number, pen: Penalizacion): number {
  const n = orden.length;
  const antes = (k: number) => orden[k];
  const despues = (k: number) => (k < i || k > j ? orden[k] : orden[i + j - k]);
  let delta = 0;
  for (const k of [i - 1, i, j, j + 1]) {
    if (k < 1 || k >= n) continue;
    delta += penEn(despues, k, n, pen) - penEn(antes, k, n, pen);
  }
  return delta;
}

/** Cuánto cambia la penalización al sacar orden[i..i+largo-1] y meterlo (al
 *  derecho o dado vuelta) en la posición p de lo que queda sin él. Cambian los
 *  vecinos de los dos bordes de donde salió, de los dos de donde entra y de las
 *  puntas del grupo. Lee el orden nuevo por índice, sin armarlo (spec 038). */
function deltaPenOrOpt(orden: number[], i: number, largo: number, p: number, invertido: boolean, pen: Penalizacion): number {
  const n = orden.length;
  const largoResto = n - largo;
  // El orden sin el grupo, el grupo como entra y el orden nuevo, por posición.
  const resto = (x: number) => (x < i ? orden[x] : orden[x + largo]);
  const s = (x: number) => (invertido ? orden[i + largo - 1 - x] : orden[i + x]);
  const despues = (k: number) => (k < p ? resto(k) : k < p + largo ? s(k - p) : resto(k - largo));
  const enResto = (r: number) => (r < p ? r : r + largo);
  const enOrden = (r: number) => (r < i ? r : r + largo);
  // [posición antes, posición después] de cada parada que cambia de vecinos.
  const cambian: [number, number][] = [
    [i - 1, enResto(i - 1)],
    [enOrden(p - 1), p - 1],
    [invertido ? i + largo - 1 : i, p],
    [invertido ? i : i + largo - 1, p + largo - 1],
  ];
  if (i + largo < n) cambian.push([i + largo, enResto(i)]);
  if (p < largoResto) cambian.push([enOrden(p), p + largo]);
  const vistas = new Set<number>();
  let delta = 0;
  for (const [antes, ahora] of cambian) {
    if (antes < 1 || vistas.has(antes)) continue; // la base no paga; cada parada una vez
    vistas.add(antes);
    delta += penEn(despues, ahora, n, pen) - penEn((k) => orden[k], antes, n, pen);
  }
  return delta;
}

// 2-opt: da vuelta el tramo [i..j] y mira si conviene.
//
// La diferencia con la versión anterior no es qué prueba, sino cuánto cuesta
// probarlo: antes armaba el orden completo y lo sumaba entero, dos veces, por
// cada par (i,j) — O(n) por candidato. Acá las sumas del tramo en sus dos
// sentidos se arrastran al mover j, así que evaluar un candidato son cuatro
// costos. Con 61 puntos eso baja de ~230.000 sumas por pasada a ~3.700, y ese
// margen es el que después se gasta en probar MÁS órdenes, que es de donde sale
// la mejora de verdad.
function dosOptPasada(orden: number[], T: Float64Array, ancho: number, pen?: Penalizacion): boolean {
  const n = orden.length;
  let mejoro = false;

  for (let i = 1; i < n - 1; i++) {
    let derecho = 0; // suma del tramo [i..j] tal como está
    let invertido = 0; // el mismo tramo recorrido al revés (¡no es lo mismo!)
    // orden[i − 1] y orden[i] no cambian hasta el break.
    const desdePrevio = orden[i - 1] * ancho + 1;
    const desdePrimero = orden[i] * ancho + 1;
    const entrada = T[desdePrevio + orden[i]];

    for (let j = i + 1; j < n; j++) {
      derecho += T[orden[j - 1] * ancho + orden[j] + 1];
      invertido += T[orden[j] * ancho + orden[j - 1] + 1];

      // El último punto NO está fijo: la parada final también puede moverse.
      // Después de ella viene FIN, que en una ruta cerrada es volver a la base.
      const siguiente = j + 1 < n ? orden[j + 1] : FIN;
      const antes = entrada + derecho + T[orden[j] * ancho + siguiente + 1];
      const despues = T[desdePrevio + orden[j]] + invertido + T[desdePrimero + siguiente];

      if (despues - antes + (pen && despues - antes < 4 * (pen.maximo ?? Infinity) ? deltaPenDosOpt(orden, i, j, pen) : 0) < -EPSILON) {
        for (let a = i, b = j; a < b; a++, b--) {
          [orden[a], orden[b]] = [orden[b], orden[a]];
        }
        mejoro = true;
        break; // el tramo cambió: las sumas que venía arrastrando ya no valen
      }
    }
  }
  return mejoro;
}

// Or-opt: SACA un grupo de 1 a 3 paradas seguidas y lo mete en otro lado, con
// el grupo en su orden o dado vuelta.
//
// Es la jugada que le faltaba, y la que más rinde con costos asimétricos: mover
// un grupo sin invertirlo no cambia ningún tramo interno, así que el 2-opt
// —que vive de invertir— se pierde justo las mejoras que no cuestan nada. El
// caso típico del reparto es una parada que quedó encajada en medio de un
// barrio al que no pertenece: el 2-opt no la puede sacar de ahí sin dar vuelta
// media ruta.
function orOptPasada(orden: number[], T: Float64Array, ancho: number, pen?: Penalizacion): boolean {
  const n = orden.length;
  const c = (a: number, b: number) => T[a * ancho + b + 1];

  for (let largo = 1; largo <= MAX_SEGMENTO_OROPT && largo < n - 1; largo++) {
    for (let i = 1; i + largo <= n; i++) {
      // El grupo es orden[i..i+largo-1]; dado vuelta, de orden[i+largo-1] a orden[i].
      const primero = orden[i];
      const ultimo = orden[i + largo - 1];
      const previo = orden[i - 1];
      const siguiente = i + largo < n ? orden[i + largo] : FIN;

      // Lo que se ahorra al sacarlo de donde está.
      const saca = c(previo, primero) + c(ultimo, siguiente) - c(previo, siguiente);
      if (!Number.isFinite(saca)) continue;

      // Los tramos de adentro, en el mismo orden en que se sumaban.
      let internoDerecho = 0;
      for (let k = i; k < i + largo - 1; k++) internoDerecho += c(orden[k], orden[k + 1]);
      let internoInvertido = 0;
      for (let k = i + largo - 1; k > i; k--) internoInvertido += c(orden[k], orden[k - 1]);

      // Las posiciones del orden sin el grupo: x < i es orden[x]; x >= i, orden[x + largo].
      const largoResto = n - largo;
      for (let p = 1; p <= largoResto; p++) {
        if (p === i) continue; // volver a ponerlo donde estaba no es una mejora
        const a = p - 1 < i ? orden[p - 1] : orden[p - 1 + largo];
        const b = p < largoResto ? (p < i ? orden[p] : orden[p + largo]) : FIN;

        for (let vez = 0; vez < 2; vez++) {
          const invertir = vez === 1;
          const entra = invertir ? ultimo : primero;
          const sale = invertir ? primero : ultimo;
          const interno = invertir ? internoInvertido : internoDerecho;
          // El «+ (interno − internoDerecho)» se queda aunque al derecho valga 0: con
          // un tramo interno sin camino es NaN, y la jugada no se toma.
          const pone = c(a, entra) + c(sale, b) - c(a, b) + (interno - internoDerecho);

          if (pone - saca + (pen && pone - saca < 6 * (pen.maximo ?? Infinity) ? deltaPenOrOpt(orden, i, largo, p, invertir, pen) : 0) < -EPSILON) {
            // Recién al aplicarla se arma el orden nuevo, como antes.
            const s = orden.slice(i, i + largo);
            if (invertir) s.reverse();
            const resto = [...orden.slice(0, i), ...orden.slice(i + largo)];
            resto.splice(p, 0, ...s);
            for (let k = 0; k < n; k++) orden[k] = resto[k];
            return true; // aplicado: se vuelve a empezar sobre el orden nuevo
          }
        }
      }
    }
  }
  return false;
}

/** Aplica las dos mejoras hasta que ninguna encuentra nada. Con un costo que ya
 *  es tabla (ordenarParadas) la usa; si no, la arma una vez (spec 038). */
export function mejorarLocal(inicial: number[], costo: Costo, pen?: Penalizacion): number[] {
  const { tabla, ancho } = enTabla(puntosDe([inicial]), costo);
  const orden = [...inicial];
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const cambio2opt = dosOptPasada(orden, tabla, ancho, pen);
    const cambioOrOpt = orOptPasada(orden, tabla, ancho, pen);
    if (!cambio2opt && !cambioOrOpt) break;
  }
  return orden;
}
