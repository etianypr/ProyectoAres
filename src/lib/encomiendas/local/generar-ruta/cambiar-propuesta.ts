// Cambiar una propuesta ya calculada, antes de usarla: otra alternativa, una
// parada menos o de vuelta, y su trazado nuevo (sale de index.ts, spec 024, que
// lo dejó en más de 400 líneas).

import { rutaPorCalles } from "@/lib/geo/ruta-por-calles";
import { ultimaFallaOrs } from "@/lib/geo/ors/cliente";
import { tramosConPedidos } from "../almacen";
import { coord } from "./estrategias";
import { pesosDeManejar } from "./pesos";
import type { EstrategiaRuta, PedidoUbicado, PropuestaRuta } from "./tipos";

/** Cambia la alternativa puesta y le pide SU trazado.
 *
 *  El trazado se pide acá y no al calcular las tres porque es la consulta que
 *  cuesta: mostrar una comparación de tres órdenes no puede valer tres veces más
 *  que mostrar uno (Decisión 5). El conductor paga la consulta de la que de verdad
 *  quiere mirar.
 *
 *  Si la estrategia pedida no está entre las útiles, devuelve la propuesta tal
 *  cual: no es un error, es que esa alternativa no aportaba nada. */
export async function elegirAlternativa(
  propuesta: PropuestaRuta,
  estrategia: EstrategiaRuta,
): Promise<PropuestaRuta> {
  if (estrategia === propuesta.elegida) return propuesta;

  const alternativa = propuesta.alternativas.find((a) => a.estrategia === estrategia);
  if (!alternativa) return propuesta;

  const calles = await rutaPorCalles(
    [propuesta.partida, ...alternativa.paradas.map(coord), propuesta.llegada ?? propuesta.partida],
    pesosDeManejar,
  );

  return {
    ...propuesta,
    paradas: alternativa.paradas,
    elegida: estrategia,
    deAres: undefined,
    alReves: undefined,
    trazado: calles?.trazado ?? null,
    tramos: tramosConPedidos(calles?.tramos, [null, ...alternativa.paradas.map((p) => p.id), null]),
    distanciaM: calles?.distanciaM ?? null,
    duracionS: calles?.duracionS ?? null,
    sinTrazado: calles == null,
    motivoSinTrazado: calles == null ? (ultimaFallaOrs() ?? "sin_senal") : null,
  };
}

/** La propuesta con otras paradas: sin una que el conductor eliminó al revisarla
 *  (terreno 2026-10-28) o con ella de vuelta. El orden de las demás no cambia:
 *  sacar una parada de una ruta buena deja una ruta buena. La comparación se va
 *  (sus cifras eran de la otra lista) y el trazado queda el de antes hasta que
 *  llegue el nuevo (ver retrazar). */
function conParadas(propuesta: PropuestaRuta, paradas: PedidoUbicado[]): PropuestaRuta {
  const actual = propuesta.alternativas.find((a) => a.estrategia === propuesta.elegida) ?? propuesta.alternativas[0];
  return { ...propuesta, paradas, alternativas: actual ? [{ ...actual, paradas }] : [], deAres: undefined, alReves: undefined };
}

export function quitarParada(propuesta: PropuestaRuta, pedidoId: string): PropuestaRuta {
  return conParadas(
    propuesta,
    propuesta.paradas.filter((p) => p.id !== pedidoId),
  );
}

/** Deshacer quitarParada: vuelve a su lugar. */
export function devolverParada(propuesta: PropuestaRuta, parada: PedidoUbicado, indice: number): PropuestaRuta {
  const paradas = propuesta.paradas.filter((p) => p.id !== parada.id);
  paradas.splice(Math.min(indice, paradas.length), 0, parada);
  return conParadas(propuesta, paradas);
}

/** El trazado por calles de las paradas que tiene ahora la propuesta. */
export async function retrazar(propuesta: PropuestaRuta): Promise<PropuestaRuta> {
  const calles =
    propuesta.paradas.length > 0
      ? await rutaPorCalles([propuesta.partida, ...propuesta.paradas.map(coord), propuesta.llegada ?? propuesta.partida], pesosDeManejar)
      : null;
  return {
    ...propuesta,
    trazado: calles?.trazado ?? null,
    tramos: tramosConPedidos(calles?.tramos, [null, ...propuesta.paradas.map((p) => p.id), null]),
    distanciaM: calles?.distanciaM ?? null,
    duracionS: calles?.duracionS ?? null,
    sinTrazado: calles == null && propuesta.paradas.length > 0,
    motivoSinTrazado: calles == null && propuesta.paradas.length > 0 ? (ultimaFallaOrs() ?? "sin_senal") : null,
    esperaTrazado: undefined,
  };
}
