"use client";

// Voz y "centrar", a la derecha del mapa y justo encima de la hoja cerrada (sale
// de pantalla.tsx, spec 002 T037).

import { LocateFixed, Volume2, VolumeX } from "lucide-react";
import type { Voz } from "../_hooks/use-voz";

export function ControlesMapa({
  abajo,
  voz,
  siguiendo,
  onCentrar,
}: {
  /** Distancia al borde de abajo (la hoja cerrada + margen). */
  abajo: number;
  voz: Voz;
  /** El mapa sigue al conductor y hay ubicación: el botón se pinta activo. */
  siguiendo: boolean;
  onCentrar: () => void;
}) {
  return (
    <div
          className="absolute right-3 z-10 flex flex-col gap-2"
          style={{ bottom: abajo }}
        >
          {voz.disponible ? (
            <button
              onClick={voz.alternar}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-md"
              aria-label={voz.activa ? "Silenciar indicaciones" : "Activar indicaciones por voz"}
            >
              {voz.activa ? (
                <Volume2 className="h-5 w-5 text-brand" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted" />
              )}
            </button>
          ) : null}
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
