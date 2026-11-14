// «Cargar la guía» a medio hacer (store `borradoresGuia`, v7): uno por día. Lo
// guarda y lo vuelve a abrir _hooks/use-borrador-guia.ts (dueño, 2026-11-13).

import { STORES, escribir, leerUno } from "../idb";
import { enFila } from "./fila";
import type { BorradorGuia } from "./tipos";

export function guardarBorradorGuia(borrador: BorradorGuia): Promise<void> {
  return enFila(() => escribir([STORES.borradoresGuia], ({ guardar }) => guardar(STORES.borradoresGuia, borrador)));
}

export function leerBorradorGuia(fecha: string): Promise<BorradorGuia | null> {
  return leerUno(STORES.borradoresGuia, fecha);
}

export function borrarBorradorGuia(fecha: string): Promise<void> {
  return enFila(() => escribir([STORES.borradoresGuia], ({ borrar }) => borrar(STORES.borradoresGuia, fecha)));
}
