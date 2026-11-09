"use client";

// Los controles del mapa, justo encima de la hoja cerrada (sale de pantalla.tsx,
// spec 002 T037): a la izquierda las paradas cercanas (spec 023) y a la derecha
// "Centrar". El botón de voz se fue con la navegación de ARES (spec 020).

import type { ReactNode } from "react";
import { LocateFixed } from "lucide-react";

export function ControlesMapa({
  abajo,
  siguiendo,
  onCentrar,
  izquierda = null,
}: {
  /** Distancia al borde de abajo (la hoja cerrada + margen). */
  abajo: number;
  /** El mapa sigue al conductor y hay ubicación: el botón se pinta activo. */
  siguiendo: boolean;
  onCentrar: () => void;
  /** Lo de la esquina izquierda: las paradas cercanas. */
  izquierda?: ReactNode;
}) {
  return (
    // Ancho completo para alinear las dos esquinas, sin tapar el mapa entre ellas.
    <div className="pointer-events-none absolute inset-x-3 z-10 flex items-end justify-between" style={{ bottom: abajo }}>
      {izquierda ?? <span />}
      <button
        onClick={onCentrar}
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-md"
        aria-label="Centrar y seguir mi ubicación"
      >
        <LocateFixed className={`h-5 w-5 ${siguiendo ? "text-brand" : "text-muted"}`} />
      </button>
    </div>
  );
}
