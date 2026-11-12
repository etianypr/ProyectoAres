// «Invertir orden de ruta» (spec 024; dueño, 2026-11-07): la misma ruta cerrada al
// revés, la última parada primero. Una calle estrecha se sigue pasando de frente
// (sus vecinos son los mismos), pero con
// los sentidos únicos puede medir distinto: en el día real de 53 paradas, +3,4 km
// (+9,9 %). Por eso la propuesta guarda la de ARES (`deAres`): la pantalla muestra
// cuánto cuesta. Y guarda las dos ya dibujadas: ir y volver pide un solo trazado.

import { distanciaMetros } from "@/lib/geo/coordenada";
import { metrosEnMemoria } from "@/lib/geo/matriz";
import { FACTOR_CALLES, metrosEstimados, minutoDelDia, type MetrosEntre } from "../planificar";
import { avisoDeHorario } from "./avisos";
import { medir, MINUTO_SALIDA_MAS_TEMPRANA } from "./estrategias";
import type { PedidoUbicado, PropuestaRuta } from "./tipos";

/** La propuesta con el orden al revés, o la de ARES si ya estaba invertida. Solo
 *  la primera vez queda `esperaTrazado` (lo pide retrazar): una propuesta paga una
 *  sola inversión (dueño, 2026-11-07). */
export function invertirOrden(propuesta: PropuestaRuta): PropuestaRuta {
  // Mientras llega el trazado del invertido no se hace nada: volver y otra vez
  // invertir pediría otro.
  if (propuesta.esperaTrazado) return propuesta;
  if (propuesta.deAres) {
    // La invertida se guarda ya dibujada (o con su trazado fallido: no se vuelve a pedir).
    return { ...propuesta.deAres, alReves: propuesta };
  }
  if (propuesta.alReves) return propuesta.alReves;

  const paradas = [...propuesta.paradas].reverse();
  // Los horarios se vuelven a medir con las distancias por calle que ya están en
  // memoria: al revés se puede llegar tarde a quien antes se llegaba a tiempo.
  const base = propuesta.partida;
  const llegada = propuesta.llegada ?? base;
  const estimado = metrosEstimados(base);
  const metros: MetrosEntre = (a, b) => metrosEnMemoria(a ?? base, b) ?? estimado(a, b);
  const vuelta = (p: PedidoUbicado) => metrosEnMemoria(p, llegada) ?? distanciaMetros(p, llegada) * FACTOR_CALLES;
  const inicio = Math.max(minutoDelDia(), MINUTO_SALIDA_MAS_TEMPRANA);

  const actual = propuesta.alternativas.find((a) => a.estrategia === propuesta.elegida);
  const invertida = actual ? { ...actual, paradas, ...medir(paradas, metros, vuelta, inicio) } : null;
  const avisoAntes = actual ? avisoDeHorario(actual) : null;
  const avisoAhora = invertida ? avisoDeHorario(invertida) : null;

  return {
    ...propuesta,
    paradas,
    alternativas: propuesta.alternativas.map((a) => (a === actual && invertida ? invertida : a)),
    advertencias: [...propuesta.advertencias.filter((t) => t !== avisoAntes), ...(avisoAhora ? [avisoAhora] : [])],
    deAres: propuesta,
    esperaTrazado: true,
  };
}
