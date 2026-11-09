"use client";

// Los controles del mapa, a la derecha y justo encima de la hoja cerrada (sale de
// pantalla.tsx, spec 002 T037): "Centrar" y, a su izquierda, las paradas cercanas
// (spec 023). El botón de voz se fue con la navegación de ARES (spec 020).

import type { ReactNode } from "react";
import { LocateFixed } from "lucide-react";

export function ControlesMapa({
  abajo,
  siguiendo,
  onCentrar,
  alLado = null,
}: {
  /** Distancia al borde de abajo (la hoja cerrada + margen). */
  abajo: number;
  /** El mapa sigue al conductor y hay ubicación: el botón se pinta activo. */
  siguiendo: boolean;
  onCentrar: () => void;
  /** Lo que va a la izquierda de "Centrar": las paradas cercanas (dueño,
   *  2026-11-09: abajo a la derecha, al lado de "Centrar"). Su lista se abre
   *  sobre esta fila entera, así que la fila es la que queda posicionada. */
  alLado?: ReactNode;
}) {
  return (
    <div className="absolute right-3 z-10 flex items-center gap-2" style={{ bottom: abajo }}>
      {alLado}
      <button
        onClick={onCentrar}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-md"
        aria-label="Centrar y seguir mi ubicación"
      >
        <LocateFixed className={`h-5 w-5 ${siguiendo ? "text-brand" : "text-muted"}`} />
      </button>
    </div>
  );
}
