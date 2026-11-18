// Comparar en Diagnóstico otras reglas para que la OF quede firme, sobre el mismo barrido
// (spec 036; dueño, 2026-11-16: «no es lo suficientemente rápido»). Puro. En vivo sigue la
// de siempre («dosDeTres»: cada dígito 3 veces y en 2 de cada 3); esto solo mide:
//   · cuántas quedan firmes y por confirmar con cada una;
//   · cuántos segundos de cámara pasan desde que se ve una OF hasta que queda verde;
//   · cuántas quedarían firmes con otro número que la de siempre (tiene que ser 0: una OF
//     mal leída enlaza otro paquete).
// La OF con dos «8» de la spec 034 no confirmaba nunca con la de siempre.

import { resultadoNomina } from "./barrido-nomina";
import type { ReglaFirme, VotosNomina } from "./tipos-nomina";

const REGLAS: ReglaFirme[] = ["dosDeTres", "confianza06", "ponderada"];

/** Por regla: cuándo apareció cada OF en la lista y cuándo quedó firme (ms del reloj del
 *  barrido). */
export type MedidaReglas = Record<ReglaFirme, { vista: Record<string, number>; firme: Record<string, number> }>;

export const medidaReglasVacia = (): MedidaReglas =>
  Object.fromEntries(REGLAS.map((r) => [r, { vista: {}, firme: {} }])) as MedidaReglas;

/** Anota, en una decisión, lo que decide cada regla. Los votos tienen que traer los pesos
 *  (`sumarCuadroNomina(…, { reglas: true })`). */
export function anotarReglas(medida: MedidaReglas, votos: VotosNomina): void {
  const ahora = votos.reloj ?? 0;
  for (const regla of REGLAS) {
    const { vista, firme } = medida[regla];
    for (const l of resultadoNomina(votos, { regla }).lista) {
      vista[l.of] ??= ahora;
      if (l.estado === "firme") firme[l.of] ??= ahora;
    }
  }
}

export type ComparacionRegla = {
  regla: ReglaFirme;
  firmes: number;
  porConfirmar: number;
  /** Segundos de cámara desde que se vio hasta que quedó verde: mediana y p90. */
  hastaVerde: { p50: number; p90: number } | null;
  /** Firmes con un número que la de siempre no tiene en su lista. */
  conOtroNumero: number;
};

const percentil = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];

/** Las cifras de cada regla al terminar, sin ninguna OF (Diagnóstico → «Copiar anonimizado»). */
export function compararReglas(medida: MedidaReglas, votos: VotosNomina): ComparacionRegla[] {
  const deSiempre = new Set(resultadoNomina(votos).lista.map((l) => l.of));
  return REGLAS.map((regla) => {
    const r = resultadoNomina(votos, { regla });
    const { vista, firme } = medida[regla];
    const segundos = Object.entries(firme).map(([of, ms]) => (ms - (vista[of] ?? ms)) / 1000);
    return {
      regla,
      firmes: r.firmes,
      porConfirmar: r.porConfirmar,
      hastaVerde: segundos.length ? { p50: percentil(segundos, 0.5), p90: percentil(segundos, 0.9) } : null,
      conOtroNumero: r.lista.filter((l) => l.estado === "firme" && !deSiempre.has(l.of)).length,
    };
  });
}
