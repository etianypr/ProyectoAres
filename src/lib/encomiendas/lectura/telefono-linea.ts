// El teléfono del receptor anotado en una línea de la guía, antes de crear el
// pedido (dueño, 2026-11-13: llamarlo desde la guía para resolver un ⚠). Puro.
//
// La guía no trae nombre ni teléfono, y por eso va a la IA (AGENTS.md, «Datos de
// destinatarios»). Este número lo escribe el conductor después de leerla, vive
// solo en la línea en memoria y pasa al `telefono` del pedido al crearlo
// (IndexedDB, borrado con el día): nunca a la lectura, a los buscadores ni a la IA.

import { normalizarTelefono, telefonoParaGuardar } from "@/lib/comun/telefono";
import { ofValida } from "../paquete";
import { limpiarDestino, type LineaGuia } from "./guia";

/** El número para «Llamar» (E.164), o null si lo escrito no es un teléfono chileno. */
export function telefonoParaLlamar(texto: string | null | undefined): string | null {
  const r = normalizarTelefono(texto);
  return r.ok ? r.telefono.e164 : null;
}

/** Leer otra foto vuelve a armar las líneas (armarGuia): los teléfonos ya
 *  anotados se conservan por OF. */
export function conTelefonos(unidas: LineaGuia[], antes: LineaGuia[]): LineaGuia[] {
  const clave = (of: string) => ofValida(of) ?? of;
  const porOf = new Map(antes.filter((l) => l.telefono?.trim()).map((l) => [clave(l.of), l.telefono!] as const));
  if (porOf.size === 0) return unidas;
  return unidas.map((l) => {
    const telefono = l.telefono?.trim() ? l.telefono : porOf.get(clave(l.of));
    return telefono ? { ...l, telefono } : l;
  });
}

/** Las líneas revisadas → lo que se crea. El teléfono, igual que en el formulario
 *  del pedido: +569 si se pudo normalizar y, si no, tal como se escribió. Las
 *  líneas sin OF válida no llegan acá («Crear» está bloqueado). */
export function lineasParaCrear(lineas: LineaGuia[]): { of: string; destino: string; telefono?: string }[] {
  return lineas.map((l) => {
    const linea = { of: ofValida(l.of) ?? l.of, destino: limpiarDestino(l.destino) };
    return l.telefono?.trim() ? { ...linea, telefono: telefonoParaGuardar(l.telefono) } : linea;
  });
}
