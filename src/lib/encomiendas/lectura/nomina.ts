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
  const bloques: BloqueNomina[] = [];
  let of: { valor: string | null; fila: number } | null = null;
  for (let i = 0; i < renglones.length; i++) {
    const renglon = renglones[i];
    if (FILA_OF.test(renglon)) {
      of = { valor: ofDeRenglon(renglon), fila: i };
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
    }
    of = null;
    i = j - 1;
  }
  return bloques;
}

/** Las OF y sus destinos de un texto de la nómina. */
export function leerNomina(texto: string): { of: string; destino: string }[] {
  return bloquesNomina(texto.split(/\r?\n/)).map(({ of, destino }) => ({ of, destino }));
}
