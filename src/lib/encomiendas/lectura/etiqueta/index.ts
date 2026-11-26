// El lector de la etiqueta de Starken (spec 021): el texto que lee ML Kit en el
// teléfono, o el que se pega desde Google Lens, → los datos del pedido. Puro: la
// etiqueta no pasa por la IA ni sale del teléfono. Es la única entrada; el
// diccionario está en formatos.ts, las zonas en zonas.ts y cada campo en
// campos.ts.
//
// No se extrae nada que no haga falta para repartir: ni RUT, ni remitente, ni
// correo, ni cuenta corriente (FR-017 de la spec 005).

import { bultos, destinatario, direccion, monto, montoNoImpreso, ofImpresa, ofsDelTexto, telefono, totalImpreso } from "./campos";
import { CLAVES, FORMATOS, esCtaCteConNumero, type FormatoEtiqueta } from "./formatos";
import { comparable, renglones } from "./normalizar";
import { zonas } from "./zonas";

export type { FormatoEtiqueta };

export type Pago = "POR_PAGAR" | "CONTADO" | "CTA_CTE" | "DESCONOCIDO";

export type LecturaEtiqueta = {
  /** OF impresa: solo sirve para rechazar la foto de otra etiqueta y para
   *  confirmar la lectura (FR-008). La que manda es la del código de barras. */
  ofImpresa: string | null;
  bulto: number | null;
  bultosTotal: number | null;
  destinatario: string | null;
  /** Normalizado (+569…): solo se toma un teléfono que lo sea. */
  telefono: string | null;
  /** Solo para compararla con la guía: nunca cambia la dirección sola. */
  direccion: string | null;
  /** true solo con POR PAGAR; CONTADO o CTA CTE → false; sin leer → null. */
  porPagar: boolean | null;
  /** De "Total Monto O.F."; nunca se supone 0 (FR-015). */
  montoPorPagar: number | null;
  /** POR PAGAR con «Total Monto O.F.» impreso sin ningún monto (la Starken temporal): el
   *  escáner en vivo deja de esperarlo y queda «monto por revisar». Solo viene si es true. */
  sinMontoImpreso?: true;
  /** Campos que hay que revisar a mano. */
  dudosos: string[];
};

/** POR PAGAR, CONTADO o CTA CTE (solo con su número: en la Starken normal es
 *  una casilla vacía). Dos distintos en la misma etiqueta no se adivinan:
 *  DESCONOCIDO, y el conductor revisa (es plata suya). */
export function pagoDe(texto: string): Pago {
  const todo = comparable(texto);
  const lista = renglones(texto);
  const vistos: Pago[] = [];
  if (CLAVES.porPagar.test(todo)) vistos.push("POR_PAGAR");
  if (CLAVES.contado.test(todo)) vistos.push("CONTADO");
  if (lista.some((r, i) => esCtaCteConNumero(r.comparable, lista[i + 1]?.comparable))) vistos.push("CTA_CTE");
  return vistos.length === 1 ? vistos[0] : "DESCONOCIDO";
}

/** Qué etiqueta es (Lion, EXPRES, Starken). No cambia cómo se lee: sirve para
 *  el diagnóstico y las pruebas. */
export function formatoEtiqueta(texto: string): FormatoEtiqueta {
  const todo = comparable(texto);
  return FORMATOS.find((f) => f.marca.test(todo))?.formato ?? "desconocido";
}

export function leerEtiqueta(texto: string): LecturaEtiqueta {
  const lista = renglones(texto);
  const zonasDe = zonas(lista);
  const dudosos = new Set<string>();

  const nombre = destinatario(lista, zonasDe);
  // Un nombre con dígitos o de menos de 3 letras es otra cosa mal leída.
  if (!nombre || /\d/.test(nombre) || (nombre.match(/\p{L}/gu)?.length ?? 0) < 3) dudosos.add("destinatario");

  const of = ofImpresa(lista);
  // Las OF impresas (la de «O.F.» y la del número bajo el código): ni teléfono ni monto.
  const ofs = ofsDelTexto(lista, of);
  const tel = telefono(lista, zonasDe, ofs);
  if (tel.dudoso) dudosos.add("telefono");

  const pago = pagoDe(texto);
  // «$0» impreso sin POR PAGAR es «no se cobra» (el dueño, 2026-11-08: la EXPRES
  // no trae CONTADO). Es un 0 que se lee, no uno que se supone.
  const ceroImpreso = !CLAVES.porPagar.test(comparable(texto)) && totalImpreso(lista, ofs) === 0;
  const porPagar = pago === "POR_PAGAR" ? true : pago === "DESCONOCIDO" && !ceroImpreso ? null : false;
  const montoPorPagar = porPagar ? monto(lista, ofs) : null;
  if (porPagar === null) dudosos.add("pago");
  if (porPagar && montoPorPagar === null) dudosos.add("montoPorPagar");

  const dir = direccion(lista, zonasDe);
  if (!dir) dudosos.add("direccion");

  const b = bultos(lista);
  const sinMonto = porPagar === true && montoPorPagar === null && montoNoImpreso(lista, ofs);
  return {
    ofImpresa: of,
    bulto: b?.[0] ?? null,
    bultosTotal: b?.[1] ?? null,
    destinatario: nombre,
    telefono: tel.telefono,
    direccion: dir,
    porPagar,
    montoPorPagar,
    ...(sinMonto ? { sinMontoImpreso: true as const } : {}),
    dudosos: [...dudosos],
  };
}
