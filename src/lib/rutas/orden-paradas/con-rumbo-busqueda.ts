// La búsqueda del orden con rumbo (spec 031; el modelo está en con-rumbo.ts y las
// jugadas en con-rumbo-jugadas.ts).
//
// Hasta MAX_EXACTO_CON_RUMBO paradas, el óptimo exacto. Con más: varios arranques,
// cada uno mejorado con las jugadas, y después se sacude la mejor ruta (doble
// puente) miles de veces, reparando solo lo que la sacudida tocó y quedándose con
// lo que mejora. Nunca sale peor que sus arranques, y el mismo día da siempre la
// misma ruta. Va por partes para no congelar la pantalla (sin-congelar.ts). Puro.
import { EPSILON } from "./costo";
import { exactoConRumbo, mejoresEstados, tableroDe, type DiaConRumbo, type RutaConRumbo, type Tablero } from "./con-rumbo";
import { crearMesa } from "./con-rumbo-jugadas";

/** Lo que se ajusta de la búsqueda a fondo (afuera solo lo tocan las mediciones).
 *  Medido el 2026-11-12 con un día simulado de 80 paradas y una ruta real de 87:
 *  con estos valores la búsqueda llega, desde cualquier arranque, a la mejor ruta
 *  conocida o a 0,15 % de ella en ~1,5 s en el PC. Llegar siempre a la mejor
 *  (tramos de 20 a 30 paradas) cuesta cuatro veces más tiempo. */
export const AJUSTES = {
  /** Se sacude hasta que pasan estas sacudidas seguidas sin nada mejor… */
  sinMejora: 1500,
  /** …o hasta este tope. */
  tope: 60_000,
  /** Una ruta sacudida se acepta para seguir desde ella aunque cueste hasta esta
   *  parte más que la actual: sin eso la búsqueda se queda en el primer valle. */
  tolerancia: 0.002,
  /** Tras estas sacudidas sin nada mejor, se vuelve a la mejor ruta conocida. */
  volver: 500,
};
/** Sin «a fondo» (reordenar con la ruta en marcha): unas pocas. */
const SACUDIDAS_RAPIDAS = 300;
/** Cada cuántas sacudidas se cede el turno a la pantalla. */
const SACUDIDAS_POR_TURNO = 64;
/** Arranques del vecino más cercano. */
const MAX_ARRANQUES = 4;
/** Lo más lejos que quedan entre sí los cortes de una sacudida «de barrio». */
const VENTANA_DE_BARRIO = 30;

/** Números al azar reproducibles: el mismo día tiene que dar siempre la misma ruta. */
function alAzar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Vecino más cercano entre estados: de donde está, a la parada (y el sentido) que menos cuesta. */
function vecinoMasCercano(t: Tablero, primero?: number): number[] {
  const { estadosDe } = t.dia;
  const pendientes = new Set(t.paradas);
  const r: number[] = [];
  const tomar = (estado: number) => {
    r.push(estado);
    pendientes.delete(t.lugarDe[estado]);
  };
  if (primero != null) tomar(primero);
  while (pendientes.size > 0) {
    let mejor = -1;
    let menor = Infinity;
    for (const lugar of pendientes) {
      for (const e of estadosDe[lugar]) {
        const costo = r.length === 0 ? t.deInicio(e) : t.c(r[r.length - 1], e);
        if (costo < menor) {
          menor = costo;
          mejor = e;
        }
      }
    }
    tomar(mejor);
  }
  return r;
}

/**
 * La búsqueda, por partes. `arranques`: órdenes de lugares de los que partir —el
 * de ordenarParadas, sin rumbo, es el natural—: el resultado nunca cuesta más que
 * el mejor de ellos con sus mejores sentidos.
 */
export function* buscarConRumbo(dia: DiaConRumbo, arranques: number[][] = [], aFondo = true): Generator<void, RutaConRumbo> {
  const t = tableroDe(dia);
  const m = t.paradas.length;
  if (m <= 1) return mejoresEstados(t, t.paradas);
  const optimo = exactoConRumbo(t);
  if (optimo) return optimo;

  const candidatos = arranques.filter((o) => o.length === m).map((o) => mejoresEstados(t, o).estados);
  candidatos.push(vecinoMasCercano(t));
  // El vecino más cercano se casa con su primera decisión: se lo fuerza a empezar
  // por cada uno de los estados más baratos de alcanzar desde la partida.
  const primeros = t.paradas
    .flatMap((lugar) => dia.estadosDe[lugar])
    .sort((a, b) => t.deInicio(a) - t.deInicio(b) || a - b)
    .slice(0, MAX_ARRANQUES);
  for (const e of primeros) candidatos.push(vecinoMasCercano(t, e));

  const mesa = crearMesa(t);
  const mejor = new Int32Array(m);
  let mejorCosto = Infinity;
  for (const candidato of candidatos) {
    mesa.poner(candidato, true);
    mesa.mejorar();
    if (mesa.costo() < mejorCosto - EPSILON) {
      mejor.set(mesa.r);
      mejorCosto = mesa.costo();
    }
    yield;
  }

  // Sacudir y reparar. La mitad de las sacudidas son «de barrio» (los tres cortes
  // cerca uno de otro: reordenan una zona) y la otra mitad cortan en cualquier parte.
  const azar = alAzar(Math.round(mejorCosto) * 31 + m);
  const tope = aFondo ? AJUSTES.tope : SACUDIDAS_RAPIDAS;
  const actual = Int32Array.from(mejor);
  let costoActual = mejorCosto;
  mesa.poner(mejor, false);
  let sinMejora = 0;
  for (let i = 0; m >= 5 && i < tope && !(aFondo && sinMejora >= AJUSTES.sinMejora); i++) {
    const ventana = i % 2 === 0 ? Math.min(m - 1, VENTANA_DE_BARRIO) : m - 1;
    const p1 = 1 + Math.floor(azar() * (m - 3));
    const p2 = Math.min(m - 2, p1 + 1 + Math.floor(azar() * Math.max(1, ventana / 2)));
    const p3 = Math.min(m - 1, p2 + 1 + Math.floor(azar() * Math.max(1, ventana / 2)));
    if (p1 < p2 && p2 < p3) {
      mesa.doblePuente(p1, p2, p3);
      mesa.mejorar();
    }
    const costo = mesa.costo();
    if (costo < mejorCosto - EPSILON) {
      mejor.set(mesa.r);
      mejorCosto = costo;
      sinMejora = 0;
    } else {
      sinMejora++;
    }
    if (sinMejora > 0 && sinMejora % AJUSTES.volver === 0) {
      // Mucho rato sin nada mejor por este lado: de vuelta a la mejor conocida.
      actual.set(mejor);
      costoActual = mejorCosto;
      mesa.poner(actual, false);
    } else if (costo < costoActual * (1 + AJUSTES.tolerancia) - EPSILON) {
      actual.set(mesa.r);
      costoActual = costo;
    } else {
      mesa.poner(actual, false);
    }
    if (i % SACUDIDAS_POR_TURNO === SACUDIDAS_POR_TURNO - 1) yield;
  }
  const estados = Array.from(mejor);
  return { orden: estados.map((e) => t.lugarDe[e]), estados, costo: mejorCosto };
}

/** La búsqueda de un tirón (pruebas y mediciones). */
export function ordenarConRumbo(dia: DiaConRumbo, arranques: number[][] = [], aFondo = true): RutaConRumbo {
  const pasos = buscarConRumbo(dia, arranques, aFondo);
  let paso = pasos.next();
  while (!paso.done) paso = pasos.next();
  return paso.value;
}
