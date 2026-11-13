"use client";

// Ver guarda-toque.ts: la hora en que cambió la parada activa (o su paso), y si un
// toque llega muy pegado a ese cambio.

import { useCallback, useLayoutEffect, useRef } from "react";
import type { IdBoton } from "./botones-parada";
import { toqueValido } from "./guarda-toque";

/** `clave` cambia cuando cambia lo que está a la vista (pedido y paso). */
export function useGuardaToque(clave: string): (id: IdBoton) => boolean {
  const cambioEn = useRef(0);
  // Antes de pintar: el toque que llega con la tarjeta nueva ya dibujada tiene que
  // encontrar la hora puesta.
  useLayoutEffect(() => {
    cambioEn.current = Date.now();
  }, [clave]);
  return useCallback((id: IdBoton) => toqueValido(id, cambioEn.current, Date.now()), []);
}
