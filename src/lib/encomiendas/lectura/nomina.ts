// La nómina de reparto de Starken (el rollo impreso de la sucursal) → OF + destino.
// Puro. Formato visto en terreno (dueño, 2026-11-11), un bloque por encargo:
//
//   NUMERO           ENCARGOS
//   OF     TOTAL DOCTOS BULTOS  DESTINATARIO   COMUNA
//   200000001 1  0  1   <nombre>       ARICA
//   DIRECCION
//   21 DE MAYO 123 .
//   VALOR $   FORMA PAGO   DD
//   0         CTAC         0
//   ==========================
//
// A diferencia de la guía, la nómina trae el NOMBRE del destinatario: aquí no se
// lee (sale de la etiqueta, spec 021) y la nómina no puede ir a la IA ni a Cloud
// Vision. Se toma solo la OF y la dirección, sin contar con el orden de las
// columnas: con el papel curvo ML Kit puede entregar el nombre antes que la OF.

import { LARGO_OF, ofValida } from "../paquete";
import { limpiarDestino } from "./guia";

/** La fila de datos empieza con la OF: 7 a 10 dígitos al comienzo del renglón
 *  (el RUT del encabezado lleva guion y el furgón tiene 5). */
const FILA_OF = /^\s*(\d{7,10})(?=\s|$)/;
/** «DIRECCION», también como la lee ML Kit («D1RECCION», «DIRECCI0N»), con la
 *  dirección en el mismo renglón o en el siguiente. */
const DIRECCION = /^\s*D[I1L]RECC[I1L][O0Ó]N\b\s*:?\s*(.*)$/i;
/** Lo que viene después de la dirección: el pie del bloque o el encabezado del
 *  siguiente. Un renglón vacío o de signos («=====») también la cierra. */
const FIN_DIRECCION = /VAL[O0]R|F[O0]RMA|PAG[O0]|NUMER[O0]|ENCARG|DESTINATAR|C[O0]MUNA|^[\s=_.-]*$/i;
/** El encabezado de un bloque: la OF que venía antes ya no es de este bloque. */
const ENCABEZADO = /NUMER[O0]|ENCARG|D[O0]CT[O0]S|BULT[O0]S|^[\s=_-]{4,}$/i;
/** Una dirección más larga que esto (en renglones) es que se mezcló otra cosa. */
const MAX_RENGLONES = 3;

/** Un bloque entero de la nómina y en qué renglones del texto estaba (para marcarlo
 *  sobre la cámara): `hasta` es su último renglón, el pie «VALOR $ …» con sus valores
 *  si se leyeron. */
export type BloqueNomina = { of: string; destino: string; filaOf: number; filasDireccion: number[]; hasta: number };

/** El pie del bloque, después de la dirección: «VALOR $ FORMA PAGO DD» y sus valores. */
const PIE = /VAL[O0]R|F[O0]RMA|PAG[O0]/i;

/** La OF de una fila de datos, o null si el renglón no empieza con una. ML Kit a
 *  veces pega el TOTAL a la OF («2000000011»): la OF tiene a lo más 9 dígitos, los
 *  que le da el código de barras. */
export function ofDeRenglon(renglon: string): string | null {
  const fila = renglon.match(FILA_OF);
  return fila ? ofValida(fila[1].slice(0, LARGO_OF)) : null;
}

/** Los bloques enteros de los renglones de la nómina (un cuadro de la cámara o una
 *  foto). Un bloque cortado en el borde (sin su OF o sin el renglón que cierra la
 *  dirección) no se toma: otro cuadro lo trae entero. */
export function bloquesNomina(renglones: string[]): BloqueNomina[] {
  return piezasNomina(renglones).bloques;
}

/** Un encargo que no entró entero al cuadro (spec 034: el celular y la boleta se mueven,
 *  y exigir el encargo entero botaba casi todos los cuadros). `destino`: la dirección
 *  llegó al borde del cuadro sin el renglón que la cierra, así que puede venir cortada;
 *  null si solo se vio la fila de la OF. */
export type PiezaNomina = { of: string; destino: string | null; filaOf: number };

/** Los encargos enteros de un cuadro y, aparte, las piezas: las OF que se leyeron sin su
 *  dirección entera. Las piezas votan los dígitos de la OF (barrido-nomina.ts). */
export function piezasNomina(renglones: string[]): { bloques: BloqueNomina[]; piezas: PiezaNomina[] } {
  const bloques: BloqueNomina[] = [];
  const abiertas = new Map<number, string>();
  const filasOf: { valor: string; fila: number }[] = [];
  let of: { valor: string | null; fila: number } | null = null;
  for (let i = 0; i < renglones.length; i++) {
    const renglon = renglones[i];
    if (FILA_OF.test(renglon)) {
      of = { valor: ofDeRenglon(renglon), fila: i };
      if (of.valor) filasOf.push({ valor: of.valor, fila: i });
      continue;
    }
    const direccion = renglon.match(DIRECCION);
    if (!direccion) {
      if (ENCABEZADO.test(renglon)) of = null;
      continue;
    }
    const partes = direccion[1].trim() ? [direccion[1]] : [];
    let j = i + 1;
    for (; j < renglones.length && partes.length <= MAX_RENGLONES; j++) {
      const s = renglones[j];
      if (FILA_OF.test(s) || DIRECCION.test(s) || FIN_DIRECCION.test(s)) break;
      partes.push(s);
    }
    const cerrada = j < renglones.length && partes.length <= MAX_RENGLONES;
    const destino = limpiarDestino(partes.join(" "));
    if (of?.valor && destino && cerrada) {
      // El pie es del bloque, y el renglón que le sigue (sus valores) también, si no
      // empieza el bloque siguiente.
      let hasta = j - 1;
      if (PIE.test(renglones[j])) {
        hasta = j;
        const valores = renglones[j + 1];
        if (valores != null && !FILA_OF.test(valores) && !DIRECCION.test(valores) && !ENCABEZADO.test(valores)) hasta = j + 1;
      }
      bloques.push({ of: of.valor, destino, filaOf: of.fila, filasDireccion: Array.from({ length: j - i }, (_, k) => i + k), hasta });
    } else if (of?.valor && destino && j >= renglones.length && partes.length <= MAX_RENGLONES) {
      // La dirección llegó al final del cuadro: no se sabe si sigue en otro renglón.
      abiertas.set(of.fila, destino);
    }
    of = null;
    i = j - 1;
  }
  const enBloque = new Set(bloques.map((b) => b.filaOf));
  const piezas = filasOf
    .filter((f) => !enBloque.has(f.fila) && (abiertas.has(f.fila) || esFilaDeEncargo(renglones, f.fila)))
    .map((f): PiezaNomina => ({ of: f.valor, destino: abiertas.get(f.fila) ?? null, filaOf: f.fila }));
  return { bloques, piezas };
}

/** La fila de un encargo: la OF y después TOTAL, DOCTOS y BULTOS («200000001 1 0 1 …»). */
const FILA_DE_DATOS = /^\s*\d{7,10}(\s+\d{1,2}){2,3}(?=\s|$)/;
/** El renglón de los títulos de las columnas, justo antes de la fila del encargo. */
const COLUMNAS = /T[O0]TAL|D[O0]CT[O0]S|BULT[O0]S|DESTINATAR|C[O0]MUNA/i;

/** ¿Este renglón que empieza con un número largo, y que no trae su dirección en el cuadro,
 *  es la fila de un encargo? Solo si tiene la forma de la fila de datos o viene justo
 *  después de los títulos de las columnas. El encabezado de la nómina (el RUT, el número
 *  de la nómina) y su pie también traen números largos, y sin esto quedaban como una OF
 *  «a medias» que nunca se confirmaba (terreno 2026-11-15). */
function esFilaDeEncargo(renglones: string[], fila: number): boolean {
  if (FILA_DE_DATOS.test(renglones[fila])) return true;
  return [renglones[fila - 1], renglones[fila - 2]].some((r) => r != null && COLUMNAS.test(r));
}

/** Las OF y sus destinos de un texto de la nómina. */
export function leerNomina(texto: string): { of: string; destino: string }[] {
  return bloquesNomina(texto.split(/\r?\n/)).map(({ of, destino }) => ({ of, destino }));
}
