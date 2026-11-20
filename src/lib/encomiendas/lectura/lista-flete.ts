// La lista de la app de Starken en el teléfono del conductor («Ruta» → «Lista de Ordenes de
// Flete»), barrida con la cámara en vivo como la boleta de papel (spec 045; dueño, 2026-11-19:
// «se deberían usar las dos»). Puro. Una tarjeta por encargo:
//
//   282000001                 ← la OF, sola en su renglón (igual que en la boleta)
//   PxP                       ← ícono; en verde (él o COD) es «por pagar» (esIconoVerde)
//   <nombre>                  ← el destinatario: NO se lee (sale de la etiqueta, spec 021)
//   CALLE 123 ARICA COD       ← la dirección (uno a tres renglones) con la comuna y el ícono COD
//   27000001                  ← el número del conductor, igual en todas: se ignora
//   Hoy
//
// Medido con la lista real (Diagnóstico, 2026-11-19 y 20): ML Kit entrega cada cosa en su
// renglón, pero el ícono se lee de muchas formas («(COD)», «C0D)», «PxP)», pegado a «ARICA»), la
// comuna a veces sale mal leída o tapada por el ícono y una dirección larga ocupa dos renglones.
// Por eso la dirección se cierra en «ARICA» o, si no se leyó, en el número del conductor o en
// «Hoy». Va aparte de nomina.ts para que las reglas de uno no lean el otro: un cuadro con algo de
// la boleta no se lee aquí.

import { LARGO_OF, ofValida } from "../paquete";
import { distancia } from "./etiqueta/votos";
import { limpiarDestino } from "./guia";

/** La OF sola en su renglón, a lo más con la casilla «-» antes y un ícono después. Con sus 9
 *  dígitos, como en la boleta (dueño, 2026-11-19): en la lista real una OF salió con 7 en un
 *  cuadro (la cámara se comió dos), y esa lectura armaba una OF fantasma. */
const RENGLON_OF = new RegExp(String.raw`^\s*[-–]?\s*(\d{${LARGO_OF}})(?:\s+\S{1,5})?\s*$`);
/** Un ícono o la casilla, como los lee ML Kit: «PxP», «PxP)», «(COD)», «C0D)», «-», «Hoy». */
const ICONO = /^[^\p{L}\p{N}]*[\p{L}\p{N}]{1,4}[^\p{L}\p{N}]*$/u;
/** El ícono COD o PxP al final del renglón de la dirección, también mal leído y pegado a la
 *  comuna («ARICAC0D)»). */
const ICONO_AL_FINAL = /(?:\s+|(?<=ARICA))[^\p{L}\p{N}\s]*(?:C[O0o]D|P[xX×]P)[^\p{L}\p{N}]*$/iu;
/** «Hoy» (o como lo lea ML Kit): va después de la tarjeta, la cierra. */
const HOY = /^[^\p{L}\p{N}]*H[O0o]y[^\p{L}\p{N}]*$/iu;
/** Lo que es de la boleta de papel (sus títulos y su pie): ese cuadro no se lee aquí. */
const DE_LA_BOLETA = /D[I1L]RECC[I1L][O0Ó]N|VAL[O0]R\s*\$|F[O0]RMA\s+PAG|ENCARG|D[O0]CT[O0]S|BULT[O0]S|DESTINATAR|C[O0]MUNA/i;
/** Renglones después de la OF: íconos, el nombre, su número, la dirección y el cierre. */
const MAX_DESPUES = 8;
/** Renglones de la dirección. */
const MAX_PARTES = 3;

/** Un ícono «PxP» o «COD» en verde: el encargo es por pagar (dueño, 2026-11-20). El color lo
 *  mide la APK (ColorIconos.java) como desvío del gris. Medido en la lista real, 116 y 108
 *  lecturas: el verde dio du −48 a −19 y dv −95 a −69; el gris, du +8 a +15 y dv −11 a −5. */
export const esIconoVerde = (icono: { du: number; dv: number }) => icono.du <= -10 && icono.dv <= -35;

/** En cuántos cuadros tiene que salir verde el ícono para que el encargo quede por pagar
 *  (bloques-nomina.ts, `decidir`). El verde se separa del gris con mucho margen; dos cuadros
 *  bastan para que un reflejo suelto no lo marque. */
export const VOTOS_POR_PAGAR = 2;

/** Un renglón que es casi solo un número (el del conductor, o el que trae el nombre), aunque
 *  ML Kit le cambie un par de caracteres («274973 18», «27500a»). */
function numeroSuelto(renglon: string): boolean {
  const digitos = renglon.match(/\d/g)?.length ?? 0;
  const letras = renglon.match(/\p{L}/gu)?.length ?? 0;
  return digitos >= 5 && letras <= 2 && renglon.trim().length <= 14;
}

/** El renglón sin la comuna del final («ARICA», también mal leída a una letra: «ARlCA»), o null
 *  si no termina en ella. */
function sinLaComuna(renglon: string): string | null {
  const m = renglon.match(/^(.*?)\s*\b(\S{4,6})\s*$/u);
  if (!m) return null;
  const palabra = m[2].toUpperCase().replace(/0/g, "O").replace(/1/g, "I");
  // «Pasaje África» es una calle, no la comuna mal leída.
  return palabra !== "AFRICA" && distancia(palabra, "ARICA") <= 1 ? m[1] : null;
}

/** Una tarjeta entera: de la fila de su OF (`filaOf`) a la del final de su dirección (`hasta`). */
export type BloqueLista = { of: string; destino: string; filaOf: number; hasta: number };

/** Las tarjetas enteras de un cuadro de la lista. Una tarjeta cortada en el borde (sin su OF, sin
 *  su nombre o sin el final de su dirección) no se toma: otro cuadro la trae entera. */
export function bloquesListaFlete(renglones: string[]): BloqueLista[] {
  if (renglones.some((r) => DE_LA_BOLETA.test(r))) return [];
  // Un número que sale dos veces en el cuadro no es una OF: es el del conductor, que va en cada
  // tarjeta (dueño, 2026-11-19: «si es el de conductor se ignora»).
  const vecesEnElCuadro = new Map<string, number>();
  for (const r of renglones) {
    const n = r.match(RENGLON_OF)?.[1];
    if (n) vecesEnElCuadro.set(n, (vecesEnElCuadro.get(n) ?? 0) + 1);
  }
  const bloques: BloqueLista[] = [];
  for (let i = 0; i < renglones.length; i++) {
    const numero = renglones[i].match(RENGLON_OF)?.[1];
    if (!numero || (vecesEnElCuadro.get(numero) ?? 0) > 1) continue;
    const tarjeta = leerTarjeta(renglones, i);
    if (!tarjeta) continue;
    const of = ofValida(numero);
    const destino = limpiarDestino(tarjeta.partes.join(" "));
    if (of && destino) bloques.push({ of, destino, filaOf: i, hasta: tarjeta.hasta });
    i = tarjeta.hasta;
  }
  return bloques;
}

/** Lo que sigue a la OF del renglón `i`: el nombre (que se salta, con su número si lo trae) y los
 *  renglones de la dirección hasta su cierre. Null si la tarjeta no está entera en el cuadro. */
function leerTarjeta(renglones: string[], i: number): { partes: string[]; hasta: number } | null {
  let nombre = false;
  /** Lo último que se leyó fue el nombre: solo ahí puede venir su número (el RUT, 2026-11-20). */
  let trasElNombre = false;
  const partes: string[] = [];
  for (let j = i + 1; j < renglones.length && j <= i + MAX_DESPUES; j++) {
    const r = renglones[j];
    // La OF de la tarjeta siguiente: esta no cerró.
    if (RENGLON_OF.test(r)) return null;
    if (!nombre) {
      if (ICONO.test(r)) continue;
      // Sin el nombre antes no es una tarjeta (el número del conductor, una dirección suelta).
      if (!/^\s*\p{L}/u.test(r) || sinLaComuna(r.replace(ICONO_AL_FINAL, "")) != null) return null;
      nombre = true;
      trasElNombre = true;
      continue;
    }
    if (partes.length === 0 && trasElNombre && numeroSuelto(r)) {
      trasElNombre = false;
      continue;
    }
    // El número del conductor o «Hoy»: la dirección terminó en el renglón anterior.
    if (HOY.test(r) || numeroSuelto(r)) return partes.length > 0 ? { partes, hasta: j - 1 } : null;
    trasElNombre = false;
    if (ICONO.test(r)) continue;
    const sinIcono = r.replace(ICONO_AL_FINAL, "");
    const sinComuna = sinLaComuna(sinIcono);
    partes.push(sinComuna ?? sinIcono);
    if (sinComuna != null) return { partes, hasta: j };
    if (partes.length >= MAX_PARTES) return null;
  }
  return null;
}
