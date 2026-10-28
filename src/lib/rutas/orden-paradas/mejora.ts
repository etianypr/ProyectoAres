// Mejora local: 2-opt y Or-opt hasta que ninguna encuentra nada.
import { EPSILON, FIN, type Costo } from "./costo";

/** Cuántas paradas seguidas prueba mover el Or-opt. Más de 3 casi no encuentra
 *  nada nuevo y multiplica el trabajo. */
const MAX_SEGMENTO_OROPT = 3;

/** Tope de vueltas de mejora local. Cada vuelta mejora de verdad (el EPSILON lo
 *  garantiza), así que el bucle termina solo; esto es un cinturón por si un
 *  costo raro —NaN de una matriz mal formada— rompiera esa garantía. */
const MAX_VUELTAS = 400;

function costoSegmento(seg: number[], costo: Costo): number {
  let total = 0;
  for (let i = 0; i < seg.length - 1; i++) total += costo(seg[i], seg[i + 1]);
  return total;
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
function dosOptPasada(orden: number[], costo: Costo): boolean {
  const n = orden.length;
  let mejoro = false;

  for (let i = 1; i < n - 1; i++) {
    let derecho = 0; // suma del tramo [i..j] tal como está
    let invertido = 0; // el mismo tramo recorrido al revés (¡no es lo mismo!)

    for (let j = i + 1; j < n; j++) {
      derecho += costo(orden[j - 1], orden[j]);
      invertido += costo(orden[j], orden[j - 1]);

      // El último punto NO está fijo: la parada final también puede moverse.
      // Después de ella viene FIN, que en una ruta cerrada es volver a la base.
      const siguiente = j + 1 < n ? orden[j + 1] : FIN;
      const antes = costo(orden[i - 1], orden[i]) + derecho + costo(orden[j], siguiente);
      const despues = costo(orden[i - 1], orden[j]) + invertido + costo(orden[i], siguiente);

      if (despues < antes - EPSILON) {
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
function orOptPasada(orden: number[], costo: Costo): boolean {
  const n = orden.length;

  for (let largo = 1; largo <= MAX_SEGMENTO_OROPT && largo < n - 1; largo++) {
    for (let i = 1; i + largo <= n; i++) {
      const seg = orden.slice(i, i + largo);
      const previo = orden[i - 1];
      const siguiente = i + largo < n ? orden[i + largo] : FIN;

      // Lo que se ahorra al sacarlo de donde está.
      const saca = costo(previo, seg[0]) + costo(seg[largo - 1], siguiente) - costo(previo, siguiente);
      if (!Number.isFinite(saca)) continue;

      const resto = [...orden.slice(0, i), ...orden.slice(i + largo)];
      const segInvertido = [...seg].reverse();
      const internoDerecho = costoSegmento(seg, costo);
      const internoInvertido = costoSegmento(segInvertido, costo);

      for (let p = 1; p <= resto.length; p++) {
        if (p === i) continue; // volver a ponerlo donde estaba no es una mejora
        const a = resto[p - 1];
        const b = p < resto.length ? resto[p] : FIN;

        for (const invertir of [false, true]) {
          const s = invertir ? segInvertido : seg;
          const interno = invertir ? internoInvertido : internoDerecho;
          const pone = costo(a, s[0]) + costo(s[largo - 1], b) - costo(a, b) + (interno - internoDerecho);

          if (pone < saca - EPSILON) {
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

/** Aplica las dos mejoras hasta que ninguna encuentra nada. */
export function mejorarLocal(inicial: number[], costo: Costo): number[] {
  const orden = [...inicial];
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const cambio2opt = dosOptPasada(orden, costo);
    const cambioOrOpt = orOptPasada(orden, costo);
    if (!cambio2opt && !cambioOrOpt) break;
  }
  return orden;
}
