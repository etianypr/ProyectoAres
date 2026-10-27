"use client";

// Lo que se dibuja en el mapa: las paradas de la ruta y, si hay una propuesta a la
// vista, las suyas con su trazado (sale de pantalla.tsx, spec 002 T036).

import { useMemo } from "react";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import type { PreviaRuta, PuntoMapa } from "../_mapa/ruta-mapa";
import type { Parada } from "./use-dia-trabajo";

export function usePuntosMapa(
  paradas: Parada[],
  activa: Parada | null,
  propuesta: PropuestaRuta | null,
): { puntos: PuntoMapa[]; previa: PreviaRuta | null } {
  // Memorizado a propósito: el mapa usa esta lista como dependencia de sus
  // efectos, y si se recreara en cada dibujado (la ubicación GPS re-dibuja
  // seguido) volvería a re-encuadrar el mapa una y otra vez.
  const puntos: PuntoMapa[] = useMemo(
    () =>
      paradas
        .filter((p) => p.pedido.lat != null && p.pedido.lng != null)
        .map((p) => ({
          id: p.pedido.id,
          lat: p.pedido.lat!,
          lng: p.pedido.lng!,
          label: String(p.secuencia),
          activa: p.pedido.id === activa?.pedido.id,
          completada: p.pedido.resultado === "entregado",
        })),
    [paradas, activa],
  );

  const previa = useMemo<PreviaRuta | null>(
    () =>
      propuesta
        ? {
            puntos: propuesta.paradas.map((p, i) => ({
              id: p.id,
              lat: p.lat,
              lng: p.lng,
              label: String(propuesta.cerradas + i + 1),
              activa: false,
              completada: false,
            })),
            trazado: propuesta.trazado,
          }
        : null,
    [propuesta],
  );

  return { puntos, previa };
}
