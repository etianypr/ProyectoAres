"use client";

// Si la navegación de Google está guiando ahora (spec 019): mientras tanto la de
// ARES se pausa (ver useGuiaNavegacion).
import { useSyncExternalStore } from "react";
import { alCambiarNavegacion, navegandoConGoogle } from "@/lib/nativo/navegacion";

export function useNavegandoConGoogle(): boolean {
  return useSyncExternalStore(alCambiarNavegacion, navegandoConGoogle, () => false);
}
