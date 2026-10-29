import { EPSILON, distanciaOrden, type Costo } from "./costo";
import { mejorarLocal } from "./mejora";

// ----------------------------------------------------------------------------
// Sacudir y volver a mejorar
// ----------------------------------------------------------------------------
//
// La mejora local termina en un mínimo LOCAL: un orden donde ninguna de las
// jugadas que sabe hacer mejora nada, aunque exista un orden bastante mejor un
// poco más allá. En cuál de esos mínimos cae depende del arranque, así que
// tocando un poco el algoritmo se puede salir MEJOR en promedio y PEOR en
// algunos casos sueltos — medido contra la versión anterior, hasta 5,7% peor en
// una de cada treinta días. Que la ruta de un día concreto empeore no es un
// costo aceptable, aunque el promedio mejore.
//
// El "double bridge" es la sacudida clásica para esto: corta la ruta en cuatro
// e intercambia los dos trozos del medio. Se elige justamente porque el 2-opt
// NO puede deshacerla en un solo paso —así que no vuelve caminando al mismo
// mínimo— pero conserva el sentido de recorrido de cada trozo, que con costos
// asimétricos es lo que evita arruinar la ruta de entrada.
//
// Se sacude, se vuelve a mejorar, y el resultado se acepta SOLO si es mejor.
// Por eso esto no puede empeorar nada: en el peor caso se queda con lo que ya
// tenía y se gastaron unos milisegundos.

/** Cuántas sacudidas, según el tamaño. Una mejora local cuesta del orden de n²,
 *  así que el número se escala al revés para que el trabajo total quede parejo
 *  —unas décimas de segundo— en vez de dispararse en los días grandes, que
 *  son justo las que corren en el teléfono del conductor. */
function sacudidasPara(n: number): number {
  return Math.max(20, Math.min(200, Math.round(60_000 / (n * n))));
}

/** Números al azar reproducibles: el mismo día tiene que dar siempre la
 *  misma ruta, o el conductor regenera y le cambia el orden sin motivo. */
function alAzar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function doblePuente(orden: number[], azar: () => number): number[] {
  const n = orden.length;
  // Hacen falta al menos tres cortes después de la base.
  if (n < 8) return orden;

  const cortes = [
    1 + Math.floor(azar() * (n - 3)),
    1 + Math.floor(azar() * (n - 3)),
    1 + Math.floor(azar() * (n - 3)),
  ].sort((a, b) => a - b);
  const [p1, p2, p3] = cortes;
  if (p1 === p2 || p2 === p3) return orden;

  return [
    ...orden.slice(0, p1),
    ...orden.slice(p2, p3),
    ...orden.slice(p1, p2),
    ...orden.slice(p3),
  ];
}

/** A fondo (terreno 2026-10-29: "que sea la ruta con menos kilómetros, aunque se
 *  demore"): se sigue sacudiendo hasta que pasan estas sacudidas SEGUIDAS sin
 *  encontrar nada mejor. Medido en una ruta real de 67 puntos y en días al azar
 *  de 41 a 81: la mejor ruta conocida aparece antes de las 200 sacudidas, y
 *  8.000 no bajaron ni un metro más. */
const SACUDIDAS_SIN_MEJORA = 300;
/** Tope, por si un día raro sigue mejorando de a centímetros. */
const TOPE_SACUDIDAS = 5000;

/** Mejora todos los arranques, se queda con el mejor y después lo sacude por si
 *  hay algo mejor a la vuelta de la esquina: unas cuantas veces, o a fondo. */
export function mejorDeVariosArranques(arranques: number[][], costo: Costo, aFondo = false): number[] {
  let mejor = arranques[0];
  let mejorCosto = Infinity;

  for (const arranque of arranques) {
    const candidato = mejorarLocal(arranque, costo);
    const total = distanciaOrden(candidato, costo);
    if (total < mejorCosto) {
      mejorCosto = total;
      mejor = candidato;
    }
  }

  // La semilla sale del COSTO del mejor orden, no del tamaño: sembrarla solo
  // con n le daba a todos los días de 20 paradas exactamente la misma
  // secuencia de sacudidas, y con una mala racha fija había días que se
  // quedaban clavadas en un valle malo. Sigue siendo reproducible —el mismo
  // día da siempre la misma ruta— pero cada día explora distinto.
  const azar = alAzar(Math.round(mejorCosto) * 31 + mejor.length);
  const tope = aFondo ? TOPE_SACUDIDAS : sacudidasPara(mejor.length);
  let sinMejora = 0;
  for (let i = 0; i < tope && !(aFondo && sinMejora >= SACUDIDAS_SIN_MEJORA); i++) {
    const candidato = mejorarLocal(doblePuente(mejor, azar), costo);
    const total = distanciaOrden(candidato, costo);
    if (total < mejorCosto - EPSILON) {
      mejorCosto = total;
      mejor = candidato;
      sinMejora = 0;
    } else {
      sinMejora++;
    }
  }
  return mejor;
}
