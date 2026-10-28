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

import { useSyncExternalStore } from "react";
import { olvidarMatriz } from "@/lib/geo/mapbox/matriz";
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

/** Solo con la cola vacía: lo que queda sin enviar es trabajo de verdad, y al
 *  salir del modo prueba se borra todo. */
export async function entrarAlModoPrueba(): Promise<void> {
  const cola = await leerTodos(STORES.cola);
  if (cola.length > 0) {
    throw new Error("Hay actividad sin enviar a la oficina. Espera a que se envíe (con señal) y vuelve a intentar.");
  }
  fijar(true);
}

export function salirDelModoPrueba(): Promise<void> {
  return enFila(async () => {
    const stores = [...STORES_DEL_DIA, STORES.cola];
    await escribir(stores, ({ vaciar }) => {
      for (const store of stores) vaciar(store);
    });
    // Las distancias del día guardan puntos de destinatarios (en memoria).
    olvidarMatriz();
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
