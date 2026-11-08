// El diccionario de la etiqueta de Starken (spec 021): las palabras clave de cada
// campo y las marcas de cada formato. Para sumar un formato o una variante se toca
// SOLO este archivo, con su caso en pruebas/lectura-etiqueta.test.mjs (el texto,
// con «Copiar anonimizado» de Diagnóstico → «Probar etiqueta»).

import { clave, palabra } from "./normalizar";

export type FormatoEtiqueta = "lion" | "expres" | "starken" | "desconocido";

/** En orden: manda la primera marca que aparece (una Lion también dice STARKEN).
 *  El formato no cambia cómo se lee: sirve para el diagnóstico y las pruebas. */
export const FORMATOS: { formato: Exclude<FormatoEtiqueta, "desconocido">; marca: RegExp }[] = [
  { formato: "lion", marca: palabra("LION") },
  { formato: "expres", marca: palabra("EXPRES", "EXPRESS") },
  { formato: "starken", marca: palabra("STARKEN") },
];

export const CLAVES = {
  /** «DESTIN» y de 3 a 8 letras más, aunque vengan mal leídas: en la Lion real la
   *  palabra está gastada y ML Kit no la leyó entera (terreno 2026-11-08). No
   *  calza con «DESTINO» (la agencia), que tiene una sola letra después. Se come
   *  el resto de la palabra mal leída («DESTINATAR?O»), para que no quede pegado
   *  al nombre. */
  destinatario: /(?<![A-Z0-9])[DO0]E[S5]T[I1L]N[A-Z0-9|]{3,8}[^\s:]*/,
  /** «REMIT» y de 2 a 6 letras más: en la Starken normal ML Kit tampoco la leyó
   *  entera (terreno 2026-11-08). */
  remitente: /(?<![A-Z0-9])R[E3][MN][I1L]T[A-Z0-9|]{2,6}[^\s:]*/,
  /** En cualquier parte del renglón: corta un valor que sigue abajo. Para abrir
   *  una dirección vale solo al comienzo (`DIRECCION_AL_INICIO`): «R15 ARICA
   *  DOMICILIO» es el tipo de entrega, no una dirección. */
  direccion: palabra("DIRECCION", "DOMICILIO", "DIR"),
  telefono: palabra("TELEFONO", "TEL", "FONO", "CELULAR", "CEL", "MOVIL"),
  porPagar: palabra("POR PAGAR", "PAGO EN DESTINO"),
  contado: palabra("CONTADO"),
  ctaCte: palabra("CTA CTE", "CUENTA CORRIENTE"),
  /** «Total Monto O.F.»: el monto del POR PAGAR. */
  totalMonto: palabra("TOTAL MONTO O.F", "TOTAL MONTO OF"),
  bulto: palabra("BULTO", "BULTOS"),
  /** «O.F.», «0.F.» u «OF» sola (la Lion la imprime de costado). */
  of: palabra("O.F", "OF"),
};

/** Renglones de la etiqueta que no son datos de nadie: cortan un nombre o una
 *  dirección que sigue en el renglón de abajo. */
export const OTRAS = palabra(
  "R.U.T", "RUT", "CORREO", "EMAIL", "FECHA", "EMISION", "DOCUMENTO", "RESPALDO", "CANTIDAD", "REF",
  "PESO", "VOL", "RAMO", "IVA", "OBSERVACION", "OBSERVACIONES", "REGION", "COMUNA", "AGENCIA",
  "MINI TKT", "TOTAL", "MONTO", "STARKEN", "LION", "EXPRES", "E-MAIL", "NORMAL", "ENTREGA", "RAMPA",
  "LARGO", "ANCHO", "ALTO", "LAYOUT",
);

export const DIRECCION_AL_INICIO = new RegExp(`^(?:${["DIRECCION", "DOMICILIO", "DIR"].map(clave).join("|")})(?![A-Z0-9])`);

/** «CTA CTE» con su número es el pago (la Lion: «CTA CTE: 123456-7»). En la
 *  Starken normal es una casilla vacía, y junto a CONTADO no debe dejar el pago
 *  en duda (terreno 2026-11-08). El número puede venir en el renglón de abajo. */
export function esCtaCteConNumero(comparable: string, siguiente: string | undefined): boolean {
  const m = CLAVES.ctaCte.exec(comparable);
  if (!m) return false;
  return /\d{3,}/.test(comparable.slice(m.index + m[0].length)) || /^[\d.-]{4,}$/.test((siguiente ?? "").trim());
}

/** Lo que cierra la zona del remitente: el pago, los bultos, la OF o el código
 *  (más «CTA CTE» con número, ver zonas.ts). NO la dirección ni el teléfono: en
 *  la Starken normal el remitente trae los suyos, y si su DIRECCIÓN cerrara la
 *  zona su teléfono quedaría suelto (terreno 2026-11-08). */
export const CIERRAN_REMITENTE = [CLAVES.destinatario, CLAVES.porPagar, CLAVES.contado, CLAVES.bulto, CLAVES.of];

/** El código de barras de Starken impreso como texto: 26 dígitos con 92. */
export const CODIGO_IMPRESO = /(?<!\d)92\d{24}(?!\d)/;
