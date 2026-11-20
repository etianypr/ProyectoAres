// Los votos de un barrido de la nómina, cuadro a cuadro (spec 036). Puro. Es lo que hace
// la pantalla con cada cuadro de la cámara (use-barrido-nomina.ts) y lo que repiten las
// pruebas: las dos formas de juntar los renglones (por filas y como los entrega ML Kit) y,
// al decidir, una sola de ellas.

import type { VotosBarrido } from "./barrido-a-guia";
import { resultadoNomina, sumarCuadroNomina, type ResultadoNomina, type VotosNomina } from "./barrido-nomina";
import { cajasDelCuadro, confianzasDelCuadro, filasDe, porPagarDelCuadro, type CajaEncargo, type RenglonCaja } from "./cajas-nomina";
import { sinFantasmas, sumarVecinos } from "./rumbo-nomina";

/** Lo más que suma un cuadro al reloj del barrido. Con el celular bloqueado o la cámara
 *  trabada no llegan cuadros, y ese tiempo no cuenta para vencer lo que falta confirmar. */
export const TOPE_PASO_RELOJ = 1000;

/** El reloj del barrido en este cuadro: el del anterior más lo que pasó desde él, con
 *  tope (spec 036). */
export function relojDelCuadro(anterior: number | undefined, msDesdeElAnterior: number): number {
  return (anterior ?? 0) + Math.min(Math.max(0, msDesdeElAnterior), TOPE_PASO_RELOJ);
}

/** Suma un cuadro a las dos formas de juntar sus renglones. Por filas: los renglones de
 *  arriba abajo y, en cada fila, de izquierda a derecha. Como llegan: en el orden de ML
 *  Kit, con el orden en la hoja sacado del de por filas (el texto no viene de arriba
 *  abajo). `filas` y `cajas`: las de `filasDe` y `cajasDelCuadro`, si ya se calcularon
 *  para marcar el cuadro. `reloj`: los ms de cámara leyendo hasta este cuadro (vencen las
 *  OF por confirmar). Con las cajas se anota qué fila de OF salió justo debajo de cuál
 *  (los huecos, rumbo-nomina.ts). `reglas`: anota lo que necesitan las reglas que
 *  Diagnóstico compara con la de siempre (reglas-nomina.ts). */
export function sumarCuadroAlBarrido(
  votos: VotosBarrido,
  renglones: RenglonCaja[],
  {
    filas = filasDe(renglones),
    cajas = cajasDelCuadro(renglones, filas),
    reloj,
    reglas = false,
  }: { filas?: ReturnType<typeof filasDe>; cajas?: CajaEncargo[]; reloj?: number; reglas?: boolean } = {},
): VotosBarrido {
  const confianzas = confianzasDelCuadro(renglones);
  // Las tarjetas de la lista de Starken con un ícono verde (spec 045): votan «por pagar».
  const porPagar = porPagarDelCuadro(renglones, filas);
  const porFilas = sumarCuadroNomina(votos.porFilas, filas.map((f) => f.texto).join("\n"), confianzas, { reloj, reglas, porPagar });
  const comoLlegan = sumarCuadroNomina(votos.comoLlegan, renglones.map((r) => r.texto).join("\n"), confianzas, {
    vertical: porFilas.delUltimo,
    reloj,
    reglas,
    porPagar,
  });
  return { porFilas: sumarVecinos(porFilas, cajas), comoLlegan: sumarVecinos(comoLlegan, cajas) };
}

/** La forma de juntar los renglones que armó más encargos enteros, elegida antes de
 *  decidir: así se decide una sola (antes se decidían las dos y `mejorResultado` comparaba
 *  solo esa cuenta). Empate: por filas. */
export function elegirVotosDelBarrido(b: VotosBarrido): VotosNomina {
  return (b.porFilas.conteo?.enteros ?? 0) >= (b.comoLlegan.conteo?.enteros ?? 0) ? b.porFilas : b.comoLlegan;
}

/** Lo decidido de un barrido, con la forma que armó más encargos enteros. `fantasmas`: sin
 *  las OF por confirmar que salieron solo en el lugar de otra firme (Diagnóstico → «Botar
 *  fantasmas», apagado hasta medirlo; rumbo-nomina.ts). */
export function resultadoDelBarrido(b: VotosBarrido, { cerca, fantasmas = false }: { cerca?: boolean; fantasmas?: boolean } = {}): ResultadoNomina {
  const votos = elegirVotosDelBarrido(b);
  const r = resultadoNomina(votos, { cerca });
  return fantasmas ? sinFantasmas(r, votos).resultado : r;
}
