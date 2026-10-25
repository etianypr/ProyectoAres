// El texto de la etiqueta de Starken (spec 005) → los datos del pedido. Puro.
//
// El texto llega pegado desde Google Lens (sin IA) o ya separado por la IA. Se
// buscan las palabras clave de la etiqueta (research R1). No se extrae nada que
// no haga falta para repartir: ni RUT, ni remitente, ni correo, ni cuenta
// corriente (FR-017).

import { normalizarTelefono } from "@/lib/comun/telefono";
import { notaPaquete, ofValida, referenciaOVacia, type ReferenciaPaquete } from "../paquete";
import type { EtiquetaIA } from "./esquemas";

export type Pago = "POR_PAGAR" | "CONTADO" | "CTA_CTE" | "DESCONOCIDO";

export type LecturaEtiqueta = {
  /** OF impresa: solo sirve confirmada por el conductor (FR-008). La que manda
   *  es la del código de barras. */
  ofImpresa: string | null;
  bulto: number | null;
  bultosTotal: number | null;
  destinatario: string | null;
  /** Normalizado (+569…) si se pudo; si no, como vino. */
  telefono: string | null;
  direccion: string | null;
  /** true solo con POR PAGAR; CONTADO o CTA CTE → false; sin leer → null. */
  porPagar: boolean | null;
  /** De "Total Monto O.F."; nunca se supone 0 (FR-015). */
  montoPorPagar: number | null;
  /** Campos que hay que revisar a mano. */
  dudosos: string[];
};

function linea(texto: string, clave: RegExp): string | null {
  const m = texto.match(clave);
  const valor = m?.[1]?.trim().replace(/\s+/g, " ");
  return valor ? valor : null;
}

export function pagoDe(texto: string): Pago {
  if (/POR\s+PAGAR/i.test(texto)) return "POR_PAGAR";
  if (/\bCONTADO\b/i.test(texto)) return "CONTADO";
  if (/CTA\.?\s*CTE/i.test(texto)) return "CTA_CTE";
  return "DESCONOCIDO";
}

/** Lo que leyó la IA de la foto de la etiqueta → las mismas reglas que el texto
 *  pegado: teléfono +569, monto nunca supuesto, solo lo necesario. La descripción
 *  del paquete llena la referencia de la spec 003. */
export function etiquetaDesdeIA(ia: EtiquetaIA): LecturaEtiqueta & { referencia: ReferenciaPaquete | null } {
  const dudosos = new Set(ia.dudosos);
  let telefono: string | null = null;
  if (ia.telefono) {
    const n = normalizarTelefono(ia.telefono);
    telefono = n.ok ? n.telefono.e164 : ia.telefono;
    if (!n.ok) dudosos.add("telefono");
  }
  const porPagar = ia.pago === "POR_PAGAR" ? true : ia.pago === "DESCONOCIDO" ? null : false;
  const montoPorPagar = porPagar && ia.montoPorPagar != null && ia.montoPorPagar > 0 ? Math.round(ia.montoPorPagar) : null;
  if (porPagar === null) dudosos.add("pago");
  if (porPagar && montoPorPagar === null) dudosos.add("montoPorPagar");
  const entero = (n: number | null) => (n != null && n > 0 ? Math.round(n) : null);
  const destinatario = ia.destinatario?.trim() || null;
  const direccion = ia.direccion?.trim() || null;
  if (!destinatario) dudosos.add("destinatario");
  if (!telefono) dudosos.add("telefono");
  if (!direccion) dudosos.add("direccion");
  return {
    ofImpresa: ia.of ? ofValida(ia.of) : null,
    bulto: entero(ia.bulto),
    bultosTotal: entero(ia.bultosTotal),
    destinatario,
    telefono,
    direccion,
    porPagar,
    montoPorPagar,
    dudosos: [...dudosos],
    referencia: referenciaOVacia({ ...ia.descripcion, nota: notaPaquete(ia.descripcion.nota ?? "") }),
  };
}

/** ¿Alcanza lo leído para repartir sin volver a leer la foto? Hacen falta el
 *  nombre, un teléfono válido y el pago (con su monto si es POR PAGAR). La
 *  dirección no: la parada ya tiene la de la guía. */
export function etiquetaCompleta(e: LecturaEtiqueta): boolean {
  const imprescindibles = ["destinatario", "telefono", "pago", "montoPorPagar"];
  return Boolean(e.destinatario && e.telefono) && !e.dudosos.some((d) => imprescindibles.includes(d));
}

export function leerEtiqueta(texto: string): LecturaEtiqueta {
  const dudosos: string[] = [];

  const destinatario = linea(texto, /DESTINATARIO\s*:?\s*([^\r\n]+)/i);
  const direccion = linea(texto, /DIRECCI[OÓ]N\s*:?\s*([^\r\n]+)/i);

  const telCrudo = linea(texto, /\bTel(?:[eé]fono)?\.?\s*:?\s*(\+?[\d\s]{8,16})/i);
  let telefono: string | null = null;
  if (telCrudo) {
    const n = normalizarTelefono(telCrudo);
    telefono = n.ok ? n.telefono.e164 : telCrudo;
    if (!n.ok) dudosos.push("telefono");
  }

  const pago = pagoDe(texto);
  const porPagar = pago === "POR_PAGAR" ? true : pago === "DESCONOCIDO" ? null : false;
  // El lector del teléfono suele leer la O de "O.F." como cero: valen los dos.
  const montoTexto = texto.match(/Total\s+Monto\s+[O0]\.?\s*F\.?\s*\$?\s*([\d.]+)/i)?.[1];
  const monto = montoTexto ? Number(montoTexto.replace(/\./g, "")) : null;
  const montoPorPagar = porPagar && monto != null && monto > 0 ? monto : null;
  if (porPagar === null) dudosos.push("pago");
  if (porPagar && montoPorPagar === null) dudosos.push("montoPorPagar");

  const bultos = texto.match(/Bulto\s+N?[°º]?\s*(\d{1,3})\s*\/\s*(\d{1,3})/i);
  // "O.F. 123456789" impresa; "Total Monto O.F. $" no calza porque lleva el monto.
  // "0.F." también, por lo mismo; sin `\b` delante porque "0" pegado a otro
  // número no es la OF.
  const ofTexto = linea(texto, /(?:^|[^\w.])[O0]\.?\s*F\.?\s*:?\s*([\d\s]{9,13})/im);

  if (!destinatario) dudosos.push("destinatario");
  if (!telefono) dudosos.push("telefono");
  if (!direccion) dudosos.push("direccion");

  return {
    ofImpresa: ofTexto ? ofValida(ofTexto) : null,
    bulto: bultos ? Number(bultos[1]) : null,
    bultosTotal: bultos ? Number(bultos[2]) : null,
    destinatario,
    telefono,
    direccion,
    porPagar,
    montoPorPagar,
    dudosos: [...new Set(dudosos)],
  };
}
