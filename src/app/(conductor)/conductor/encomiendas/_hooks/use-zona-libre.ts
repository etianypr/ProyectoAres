"use client";

// La parte del recuadro por la que se ve la cámara sin que la tape la pantalla (spec 036):
// el hueco, menos lo que va encima arriba («Falta confirmar») y abajo (el resumen). Ahí
// dibuja Android las flechas, y lo que se ve ahí dice dónde está la cámara en la nómina.
// Se mide al pedirla (los paneles aparecen y desaparecen), a lo más cada CADA_MS, y sin
// redibujar la pantalla: con la cámara encendida, cada redibujo cuesta (spec 028).

import { useCallback, useRef, type RefObject } from "react";
import type { ZonaViva } from "@/lib/nativo/escaner-vivo";

const CADA_MS = 250;

/** `hueco`: el recuadro transparente; `arriba` y `abajo`: lo que lo tapa en sus bordes. */
export function useZonaLibre(
  hueco: RefObject<HTMLElement | null>,
  arriba: RefObject<HTMLElement | null>,
  abajo: RefObject<HTMLElement | null>,
): () => ZonaViva | null {
  const medida = useRef<{ en: number; zona: ZonaViva | null }>({ en: -Infinity, zona: null });
  return useCallback(() => {
    const ahora = performance.now();
    if (ahora - medida.current.en < CADA_MS) return medida.current.zona;
    const h = hueco.current?.getBoundingClientRect();
    let zona: ZonaViva | null = null;
    if (h && h.width > 0 && h.height > 0 && window.innerWidth > 0 && window.innerHeight > 0) {
      const techo = Math.max(h.top, arriba.current?.getBoundingClientRect().bottom ?? h.top);
      const piso = Math.min(h.bottom, abajo.current?.getBoundingClientRect().top ?? h.bottom);
      if (piso > techo) {
        zona = {
          x: h.left / window.innerWidth,
          y: techo / window.innerHeight,
          ancho: h.width / window.innerWidth,
          alto: (piso - techo) / window.innerHeight,
        };
      }
    }
    medida.current = { en: ahora, zona };
    return zona;
  }, [hueco, arriba, abajo]);
}
