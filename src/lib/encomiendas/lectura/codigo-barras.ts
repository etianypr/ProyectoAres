// Código de barras de la etiqueta de Starken (spec 005). Puro.
//
// Code 128 de 26 dígitos, visto en etiquetas reales (research R1):
//
//   92 0 0002256 · AAAA · OOOOOOOOO · BBB
//   prefijo        agencia OF (15–23) bulto (24–26)
//
// La OF sale del código, nunca del texto ni de la IA: es la llave que une la
// etiqueta con su parada y un dígito mal leído enlazaría el paquete equivocado.
// Una OF corta viene con ceros a la izquierda en sus 9 posiciones; sin ellos
// calza con la guía (ofValida).

import { LARGO_OF, ofValida } from "../paquete";

export type CodigoEtiqueta = {
  /** Sin ceros a la izquierda (ver ofValida). */
  of: string;
  /** Número de bulto (001 → 1); null si se escribió solo la OF. */
  bulto: number | null;
};

const LARGO_CODIGO = 26;
const PREFIJO = "92";

/** Lo que leyó el escáner (o escribió el conductor) → OF y bulto, o null si no
 *  es un código de etiqueta. Acepta también la OF escrita a mano. */
export function leerCodigoEtiqueta(texto: string): CodigoEtiqueta | null {
  const d = texto.replace(/\D/g, "");
  if (d.length <= LARGO_OF) {
    const of = ofValida(d);
    return of ? { of, bulto: null } : null;
  }
  if (d.length !== LARGO_CODIGO || !d.startsWith(PREFIJO)) return null;
  const of = ofValida(d.slice(14, 23));
  if (!of) return null;
  const bulto = Number(d.slice(23, 26));
  return { of, bulto: bulto > 0 ? bulto : null };
}
