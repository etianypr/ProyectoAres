// Orden de paradas SIN VROOM: con ~30 paradas/día, vecino-más-cercano + mejora
// 2-opt corre en milisegundos y da un resultado MUY cercano al óptimo — no
// es una garantía matemática de óptimo exacto (eso requeriría resolver TSP
// exacto, inviable en tiempo razonable ya pasando ~15-20 paradas), pero es el
// estándar de la industria para este tamaño de problema sin pagar un solver.
import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { conFinal, distanciaOrden, type Costo } from "./costo";
import { exacto } from "./exacto";
import { insercionMasBarata, vecinoMasCercano } from "./construccion";
import { mejorarLocal } from "./mejora";
import { mejorDeVariosArranques } from "./perturbacion";

// ----------------------------------------------------------------------------
// Lo que hace difícil este problema, y por qué se resuelve así
// ----------------------------------------------------------------------------
//
// Ordenar 30 paradas es el problema del viajante: no hay forma conocida de
// resolverlo exacto en tiempo razonable pasando de ~20 paradas. Así que hay dos
// regímenes:
//
//   · Día chico (hasta MAX_EXACTO puntos): se resuelve EXACTO. El orden que
//     sale es el mejor que existe, no "uno bueno".
//   · Día grande: construcción + mejora local. Se apunta a quedar a un puñado
//     de por ciento del óptimo, que es lo que se puede prometer.
//
// Y hay un detalle que cambia qué jugadas sirven: la matriz de calles es
// ASIMÉTRICA. Ir de A a B no cuesta lo mismo que de B a A —sentidos únicos, la
// costanera, la quebrada— y eso rompe la simplificación clásica del 2-opt, que
// da vuelta un tramo suponiendo que recorrerlo al revés cuesta igual. Por eso
// acá el 2-opt suma explícitamente el tramo invertido, y por eso se agrega el
// Or-opt, que MUEVE un grupo de paradas sin darlo vuelta y es la jugada que de
// verdad rinde cuando los costos son asimétricos.

/** Hasta este tamaño se resuelve exacto. El límite lo pone la memoria: la tabla
 *  es 2^(n-1) × (n-1) números, o sea ~850 KB con 14 puntos y 4 MB con 16. En el
 *  teléfono de un conductor no conviene pedir más, y 14 puntos son 13 paradas: la
 *  día corto real. */
const MAX_EXACTO = 14;

/** Arranques distintos del vecino más cercano. Esa heurística se casa con su
 *  primera decisión —y es la que más pesa—, así que se la fuerza a empezar por
 *  cada una de las paradas más cercanas a la base y se corre la mejora local
 *  sobre todas. */
const MAX_ARRANQUES = 4;

// Recibe puntos donde puntos[0] es la base (depósito/oficina) y el resto son
// las paradas a visitar. Devuelve los ÍNDICES en el orden de visita óptimo
// (el índice 0 siempre queda primero).
//
// Con "matriz" (distancias REALES por calles, ver matrizDistancias) el orden
// deja de ser el que parece bueno mirando el mapa en línea recta y pasa a ser
// el que de verdad se maneja menos. Es una diferencia grande: dos paradas a
// tres cuadras en línea recta pueden estar a quince por calle si en el medio
// hay sentidos únicos, una quebrada o la costanera. Medido sobre días de 9
// paradas en Arica, ordenar por calle ahorra del orden de un kilómetro por día.
//
// Sin matriz (más de 25 puntos, o la API no respondió) se cae a la línea recta,
// que es lo que se hacía siempre.
//
// Con `vuelta` la ruta es CERRADA: termina volviendo, y vuelta(i) es lo que
// cuesta volver desde el punto i (terreno 2026-10-28: la ruta terminaba en la
// otra punta de la ciudad, con las paradas de al lado de la central al
// principio). Sin ella, abierta: la última parada es donde se termina.
export function ordenarParadas(
  puntos: Coordenada[],
  matriz?: number[][] | null,
  vuelta?: (i: number) => number,
  /** Buscar a fondo: hasta que no aparece nada mejor (ver perturbacion.ts). Es
   *  lo que usa la propuesta de ruta, con pantalla de carga; sin esto, unas
   *  décimas de segundo. */
  aFondo = false,
): number[] {
  const n = puntos.length;
  if (n <= 2) return puntos.map((_, i) => i);

  const enLineaRecta: Costo = conFinal((a, b) => distanciaMetros(puntos[a], puntos[b]), vuelta);
  // Un tramo sin dato (dos puntos sin camino entre ellos) no puede valer 0 o la
  // mejora local lo elegiría siempre; se lo trata como imposible.
  const costo: Costo = matriz ? conFinal((a, b) => matriz[a]?.[b] ?? Infinity, vuelta) : enLineaRecta;

  // Día chico: el óptimo exacto sale en milisegundos, así que no hay razón para
  // conformarse con una aproximación.
  if (n <= MAX_EXACTO) {
    const optimo = exacto(n, costo);
    if (optimo) return desempatarSentido(optimo, costo, vuelta != null);
  }

  const arranques = [vecinoMasCercano(n, costo), insercionMasBarata(n, costo)];

  // El vecino más cercano se casa con su primera decisión, que es la que más
  // pesa en cómo queda el resto. Se lo vuelve a correr empezando por cada una
  // de las paradas más cercanas a la base.
  const masCercanas = Array.from({ length: n - 1 }, (_, i) => i + 1)
    .sort((a, b) => costo(0, a) - costo(0, b))
    .slice(0, MAX_ARRANQUES);
  for (const primero of masCercanas) arranques.push(vecinoMasCercano(n, costo, primero));

  // Con matriz se agrega además el mejor orden EN LÍNEA RECTA como arranque:
  // son dos paisajes distintos y a veces el de línea recta cae en un valle que
  // el de calles no encuentra. Se mide con el costo real, así que no puede
  // salir peor — es el mismo criterio que ya tenía esta función, ahora como un
  // arranque más en vez de una comparación aparte.
  if (matriz) arranques.push(mejorarLocal(vecinoMasCercano(n, enLineaRecta), enLineaRecta));

  return desempatarSentido(mejorDeVariosArranques(arranques, costo, aFondo), costo, vuelta != null);
}

/** Una ruta cerrada se puede recorrer en los dos sentidos. Si al revés mide lo
 *  mismo (calles de doble sentido), se arranca por la parada más cercana, como
 *  la ruta abierta de siempre. */
function desempatarSentido(orden: number[], costo: Costo, cerrada: boolean): number[] {
  if (!cerrada || orden.length < 3) return orden;
  const alReves = [orden[0], ...orden.slice(1).reverse()];
  const diferencia = distanciaOrden(alReves, costo) - distanciaOrden(orden, costo);
  return Math.abs(diferencia) <= EPSILON_SENTIDO && costo(0, alReves[1]) < costo(0, orden[1]) ? alReves : orden;
}

/** Metros: dos sentidos que difieren en menos que esto son el mismo largo. */
const EPSILON_SENTIDO = 1;
