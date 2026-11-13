"use client";

// Cerrar la sesión del conductor y borrar los datos de destinatarios del teléfono
// (spec 007), en ESTE orden (spec 033, logout-sin-senal; dueño 2026-11-13):
//
//   1. Cerrar la sesión en el servidor. Sin señal no se cierra, y entonces
//      tampoco se borra nada: el conductor sigue con su día y la sesión abierta.
//      Antes se borraba primero (spec 017, E12) y, sin señal, quedaba sin pedidos
//      y con la sesión abierta.
//   2. Con la sesión cerrada, borrar. Si el borrado falla (IndexedDB trabada), queda
//      una marca en localStorage —sin datos de nadie— y /login lo termina al abrir
//      (BorradoPendiente): la sesión ya no existe, así que no hay vuelta atrás.
//
// La cola no se toca: lo sin enviar sale cuando se vuelva a entrar con esta cuenta.

import { borrarDatosDestinatarios } from "./almacen";

const CLAVE_BORRADO_PENDIENTE = "ares.borrado-pendiente";

export type RespuestaCierre = { ok: true } | { error: "sin-senal" | "no-cerro" };

export type ResultadoSalida =
  | { estado: "listo"; borrado: boolean }
  | { estado: "sin-senal" }
  | { estado: "no-cerro" };

export type DependenciasSalida = {
  /** La server action `cerrarSesion` (no redirige). Lanza si la llamada no llegó. */
  cerrarSesion: () => Promise<RespuestaCierre>;
  borrar?: () => Promise<void>;
  marca?: { poner: () => void; quitar: () => void };
};

export const marcaBorradoPendiente = {
  poner(): void {
    try {
      globalThis.localStorage?.setItem(CLAVE_BORRADO_PENDIENTE, "si");
    } catch {
      // Sin localStorage no hay marca; el borrado ya se intentó.
    }
  },
  quitar(): void {
    try {
      globalThis.localStorage?.removeItem(CLAVE_BORRADO_PENDIENTE);
    } catch {
      // Nada que quitar.
    }
  },
  hay(): boolean {
    try {
      return globalThis.localStorage?.getItem(CLAVE_BORRADO_PENDIENTE) === "si";
    } catch {
      return false;
    }
  },
};

export async function salirYBorrar({
  cerrarSesion,
  borrar = borrarDatosDestinatarios,
  marca = marcaBorradoPendiente,
}: DependenciasSalida): Promise<ResultadoSalida> {
  let respuesta: RespuestaCierre;
  try {
    respuesta = await cerrarSesion();
  } catch {
    // La server action ni llegó: sin señal.
    return { estado: "sin-senal" };
  }
  if ("error" in respuesta) return { estado: respuesta.error };

  marca.poner();
  try {
    await borrar();
    marca.quitar();
    return { estado: "listo", borrado: true };
  } catch {
    return { estado: "listo", borrado: false };
  }
}

/** En /login: termina un borrado que quedó a medias al cerrar la sesión. Solo con
 *  la marca: /login también lo abre quien tiene la sesión vencida en plena ruta, y
 *  a ese no se le borra nada. */
export async function terminarBorradoPendiente(
  borrar: () => Promise<void> = borrarDatosDestinatarios,
  marca: { hay: () => boolean; quitar: () => void } = marcaBorradoPendiente,
): Promise<boolean> {
  if (!marca.hay()) return false;
  try {
    await borrar();
    marca.quitar();
    return true;
  } catch {
    return false;
  }
}
