// La propuesta de ruta sin aceptar (store `propuestas`): una por día. Qué se guarda
// y cómo se rearma lo decide generar-ruta/propuesta-guardada.ts.

import { STORES, escribir, leerUno } from "../idb";
import { enFila } from "./fila";
import type { PropuestaGuardada } from "./tipos";

export function guardarPropuesta(propuesta: PropuestaGuardada): Promise<void> {
  return enFila(() => escribir([STORES.propuestas], ({ guardar }) => guardar(STORES.propuestas, propuesta)));
}

export function leerPropuestaGuardada(fecha: string): Promise<PropuestaGuardada | null> {
  return leerUno(STORES.propuestas, fecha);
}

export function borrarPropuestaGuardada(fecha: string): Promise<void> {
  return enFila(() => escribir([STORES.propuestas], ({ borrar }) => borrar(STORES.propuestas, fecha)));
}
