// Cola de envío: eventos esperando salir a encomienda_actividad. El vaciado
// vive en ../enviar.ts.

import { uuidv7 } from "@/lib/comun/uuid";
import { STORES, escribir, leerTodos } from "../idb";
import type { ActividadPorEnviar } from "./tipos";

/** Arma un evento nuevo para la cola. */
export function nuevoEvento(
  conductorId: string,
  fecha: string,
  tipo: ActividadPorEnviar["tipo"],
  hora: string,
): ActividadPorEnviar {
  return { id: uuidv7(), conductorId, fecha, tipo, hora };
}

/** Un evento guardado antes del renombrado (spec 002, migración 0006) trae
 *  `choferId`: se lee igual, para que lo que quedó sin enviar salga una vez. */
type EventoGuardado = ActividadPorEnviar & { choferId?: string };

/** Corre la retención de un evento que todavía está en la cola (no hace nada si
 *  ya salió). La usa el aviso de deshacer: con la app en segundo plano el evento
 *  se retiene sin plazo y al volver se le da lo que le quedaba (spec 017, E2). */
export function retenerEvento(id: string, hasta: string): Promise<void> {
  return escribir([STORES.cola], ({ actualizar }) => {
    actualizar(STORES.cola, id, (evento) => ({ ...evento, retenidoHasta: hasta }));
  });
}

/** Los eventos que el servidor rechazó (ver ActividadPorEnviar.rechazado). */
export async function leerRechazados(): Promise<ActividadPorEnviar[]> {
  return (await leerTodos(STORES.cola)).filter((e) => e.rechazado);
}

/** Aparta un evento que el servidor rechazó, con el motivo. */
export function apartarRechazado(id: string, motivo: string): Promise<void> {
  return escribir([STORES.cola], ({ actualizar }) => {
    actualizar(STORES.cola, id, (evento) => ({ ...evento, rechazado: motivo }));
  });
}

export async function leerCola(): Promise<ActividadPorEnviar[]> {
  const eventos = (await leerTodos(STORES.cola)).map((e: EventoGuardado) => {
    if (e.conductorId || !e.choferId) return e;
    const { choferId, ...resto } = e;
    return { ...resto, conductorId: choferId };
  });
  const ahora = new Date().toISOString();
  return (
    eventos
      // Lo retenido no está listo para salir: es lo que el conductor todavía puede
      // deshacer. Se filtra acá, en la única puerta de la cola, para que ni el
      // envío ni el contador de "sin enviar" tengan que saber que existe una
      // ventana de arrepentimiento.
      .filter((e) => !e.rechazado && (!e.retenidoHasta || e.retenidoHasta <= ahora))
      // Más viejos primero: si algo se cae a mitad de un envío grande, lo que se
      // fue es lo más antiguo y la cola queda coherente.
      .sort((a, b) => a.hora.localeCompare(b.hora))
  );
}

/** Se llama SOLO después de que el servidor confirmó el insert. */
export function quitarDeCola(ids: string[]): Promise<void> {
  return escribir([STORES.cola], ({ borrar }) => {
    for (const id of ids) borrar(STORES.cola, id);
  });
}
