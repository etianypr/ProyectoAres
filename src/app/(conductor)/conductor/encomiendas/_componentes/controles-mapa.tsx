"use client";

// "Centrar", a la derecha del mapa y justo encima de la hoja cerrada (sale de
// pantalla.tsx, spec 002 T037). El botón de voz se fue con la navegación de ARES
// (spec 020).

import { LocateFixed } from "lucide-react";

export function ControlesMapa({
  abajo,
  siguiendo,
  onCentrar,
}: {
  /** Distancia al borde de abajo (la hoja cerrada + margen). */
  abajo: number;
  /** El mapa sigue al conductor y hay ubicación: el botón se pinta activo. */
  siguiendo: boolean;
  onCentrar: () => void;
}) {
  return (
    <div
          className="absolute right-3 z-10 flex flex-col gap-2"
          style={{ bottom: abajo }}
        >
          <button
            onClick={onCentrar}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-md"
            aria-label="Centrar y seguir mi ubicación"
          >
            <LocateFixed
              className={`h-5 w-5 ${siguiendo ? "text-brand" : "text-muted"}`}
            />
          </button>
        </div>
  );
}
