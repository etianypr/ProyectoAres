"use client";

// Modo prueba (terreno 2026-10-28): probar la app con guías y etiquetas reales
// sin que nada llegue a la oficina ni a un cliente, y sin depender de tener el
// teléfono conectado a un PC que corte las escrituras.
//
//   · Encendido: no se manda la actividad ni el día a la base (enviar.ts) ni
//     sale ningún WhatsApp (la pantalla lo apaga). La cola se llena igual.
//   · Salir: borra del teléfono todo lo de la prueba —pedidos, rutas, fotos y
//     la cola—, sin enviarlo y sin dejarlo en "Tus días".
//
// Se guarda solo en el teléfono (localStorage): es un estado de ESTE teléfono.
//
// La APK de prueba (cl.dashund.ares.debug, versión «…-prueba», spec 028) entra
// siempre en modo prueba: el 2026-11-08 se usó con el modo apagado y los conteos
// del día de prueba subieron a la base. Ahí no se puede salir, porque salir borra
// (el dueño: «no elimines nada porque estamos en prueba»).

import { useSyncExternalStore } from "react";
import { olvidarConsultasGoogle } from "@/lib/geo/geocoding/google";
import { olvidarMatriz } from "@/lib/geo/matriz";
import { enFila } from "./almacen/fila";
import { STORES, STORES_DEL_DIA, escribir, leerTodos } from "./idb";

const CLAVE = "ares-modo-prueba";
const EVENTO = "ares-modo-prueba";

export function enModoPrueba(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

function fijar(si: boolean): void {
  if (si) globalThis.localStorage?.setItem(CLAVE, "1");
  else globalThis.localStorage?.removeItem(CLAVE);
  globalThis.dispatchEvent?.(new Event(EVENTO));
}

/** ¿Es la APK de prueba? La de depuración lleva «-prueba» en la versión. */
export function esApkDePrueba(version: string | null | undefined): boolean {
  return Boolean(version?.endsWith("-prueba"));
}

/** En la APK de prueba, prende el modo prueba. Solo prende la marca: no borra
 *  nada, aunque haya cola (en esa app no hay trabajo de verdad que cuidar). */
export async function asegurarModoPrueba(version: string | null): Promise<void> {
  if (esApkDePrueba(version) && !enModoPrueba()) fijar(true);
}

/** Solo con la cola vacía: lo que queda sin enviar es trabajo de verdad, y al
 *  salir del modo prueba se borra todo. */
export async function entrarAlModoPrueba(): Promise<void> {
  const cola = await leerTodos(STORES.cola);
  if (cola.length > 0) {
    throw new Error("Hay actividad sin enviar a la oficina. Espera a que se envíe (con señal) y vuelve a intentar.");
  }
  fijar(true);
}

export function salirDelModoPrueba(version: string | null = null): Promise<void> {
  return enFila(async () => {
    if (esApkDePrueba(version)) throw new Error("La app de prueba siempre está en modo prueba.");
    const stores = [...STORES_DEL_DIA, STORES.cola];
    await escribir(stores, ({ vaciar }) => {
      for (const store of stores) vaciar(store);
    });
    // Las distancias y las respuestas de Google guardan puntos y direcciones de
    // destinatarios (en memoria).
    olvidarMatriz();
    olvidarConsultasGoogle();
    fijar(false);
  });
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function useModoPrueba(): boolean {
  return useSyncExternalStore(suscribir, enModoPrueba, () => false);
}
