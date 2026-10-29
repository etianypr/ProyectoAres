"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** Una función que es la MISMA entre dibujados pero llama siempre a la última
 *  versión. La pantalla se vuelve a dibujar con cada lectura del GPS; pasada a un
 *  componente memorizado (la lista de paradas), una función nueva en cada
 *  dibujado lo obligaba a redibujarse entero sin que nada hubiera cambiado. */
export function useEvento<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ultima = useRef(fn);
  useLayoutEffect(() => {
    ultima.current = fn;
  });
  return useCallback((...args: A) => ultima.current(...args), []);
}
