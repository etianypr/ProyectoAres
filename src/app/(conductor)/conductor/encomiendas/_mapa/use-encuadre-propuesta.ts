"use client";

// El encuadre de una ruta propuesta (sale de ruta-mapa.tsx al pasar las 400 líneas).

import { useEffect, useRef, type RefObject } from "react";
import { LngLatBounds, type Map as MapaGL } from "maplibre-gl";
import type { PreviaRuta } from "./tipos";

/** Margen del encuadre de la propuesta: arriba, el botón del menú y la cinta del
 *  modo prueba; abajo, lo que tapa el panel de la propuesta. */
const RELLENO_ARRIBA = 76;
const RELLENO = 28;
/** Alto mínimo que queda para dibujar la ruta, aunque el panel sea alto. */
const ALTO_MINIMO_RUTA = 160;

function rellenoConPanel(contenedor: HTMLElement) {
  const panel = document.querySelector<HTMLElement>("[data-propuesta-ruta]");
  // offsetHeight y no el rectángulo: el panel entra deslizándose (transform).
  const tapa = panel ? contenedor.getBoundingClientRect().bottom - (window.innerHeight - panel.offsetHeight) : 0;
  const tope = contenedor.clientHeight - RELLENO_ARRIBA - ALTO_MINIMO_RUTA;
  return { top: RELLENO_ARRIBA, left: RELLENO, right: RELLENO, bottom: Math.max(RELLENO, Math.min(tapa + RELLENO, tope)) };
}

// Al aparecer una ruta propuesta se encuadra COMPLETA, de norte y sin
// inclinación: es el momento de mirarla entera, no de manejar.
//
// El panel de la propuesta va encima del mapa, abajo, y le tapa casi la mitad:
// se mide cuánto tapa y la ruta se encuadra en lo que queda visible arriba
// (dueño, 2026-11-07: «tiene que verse toda la ruta»; antes el sur de la ruta
// quedaba debajo del panel). Se mide y no se supone: el panel cambia de alto
// con la comparación y los avisos.
//
// Una vez por juego de paradas: invertir el orden o elegir otra alternativa no
// mueve la cámara, para que se vea cambiar la ruta donde se estaba mirando
// (dueño, 2026-11-07, spec 024). Eliminar o devolver una parada sí encuadra.
export function useEncuadrePropuesta({
  mapaRef,
  mapaListo,
  previa,
  encuadreInicialRef,
}: {
  mapaRef: RefObject<MapaGL | null>;
  mapaListo: boolean;
  previa?: PreviaRuta | null;
  encuadreInicialRef: RefObject<boolean>;
}) {
  /** Las paradas de la propuesta ya encuadrada. */
  const previaEncuadradaRef = useRef<string | null>(null);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!previa) previaEncuadradaRef.current = null;
    if (!mapa || !mapaListo || !previa) return;
    const paradas = previa.puntos.map((p) => `${p.lat},${p.lng}`).sort().join("|");
    if (paradas === previaEncuadradaRef.current) return;
    previaEncuadradaRef.current = paradas;

    const limites = new LngLatBounds();
    for (const c of previa.trazado ?? []) limites.extend(c);
    for (const p of previa.puntos) limites.extend([p.lng, p.lat]);
    if (limites.isEmpty()) return;

    // Este encuadre ya deja el mapa donde tiene que estar: el de "una sola vez"
    // de ruta-mapa.tsx no tiene que volver a moverlo al aceptar la ruta.
    encuadreInicialRef.current = true;

    mapa.fitBounds(limites, {
      padding: rellenoConPanel(mapa.getContainer()),
      bearing: 0,
      pitch: 0,
      duration: 700,
      // Con UNA sola parada pendiente el recuadro no tiene tamaño y el encuadre
      // se iría al zoom máximo, dejando la pantalla en media cuadra sin ninguna
      // referencia de dónde queda eso.
      maxZoom: 16,
    });
  }, [previa, mapaListo, mapaRef, encuadreInicialRef]);
}
