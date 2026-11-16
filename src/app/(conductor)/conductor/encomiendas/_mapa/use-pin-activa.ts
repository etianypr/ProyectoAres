"use client";

// La pastilla de la parada activa por encima del punto del auto (dueño,
// 2026-11-16: «el punto de navegación aparece sobre la ubicación y la tapa»). Ver
// elementoPinActiva en capa-paradas.ts. Es UN elemento: el rendimiento de las
// paradas como capa del mapa no cambia.

import { useEffect, type RefObject } from "react";
import { Marker, type Map as MapaGL } from "maplibre-gl";
import { MARGEN_PIN, cifraDelLugar, elementoPinActiva } from "./capa-paradas";
import type { LugarMapa } from "./marcadores-dom";

export function usePinActiva({
  mapaRef,
  mapaListo,
  lugar,
}: {
  mapaRef: RefObject<MapaGL | null>;
  mapaListo: boolean;
  /** El lugar de la parada activa, o null (sin ruta, o mirando una propuesta). */
  lugar: LugarMapa | null;
}) {
  const lng = lugar?.lng ?? null;
  const lat = lugar?.lat ?? null;
  const cifra = lugar ? cifraDelLugar(lugar.puntos.map((p) => p.label)) : null;

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || lng == null || lat == null || cifra == null) return;
    // Después del punto del auto en el DOM, y con z-index por si acaso.
    const marcador = new Marker({ element: elementoPinActiva(cifra), anchor: "bottom", offset: [0, MARGEN_PIN] })
      .setLngLat([lng, lat])
      .addTo(mapa);
    return () => {
      marcador.remove();
    };
  }, [mapaRef, mapaListo, lng, lat, cifra]);
}
