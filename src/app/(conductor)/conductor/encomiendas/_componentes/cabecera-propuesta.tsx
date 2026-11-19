"use client";

// La cabecera del panel de la ruta propuesta, que además es su tirador (dueño,
// 2026-11-19, spec 041: «ruta propuesta debería poder deslizarse»). Abajo queda
// solo «Ruta propuesta · N paradas» y el mapa con la ruta a la vista; arriba, el
// detalle. Se desliza o se toca, como la hoja del día.

import { useRef } from "react";
import { ChevronUp, Route } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { TIRADOR } from "./superficies";

/** Lo que tiene que moverse el dedo para que cuente como deslizar y no como toque. */
const UMBRAL_PX = 24;

export function CabeceraPropuesta({
  paradas,
  plegada,
  onPlegada,
}: {
  paradas: number;
  plegada: boolean;
  onPlegada: (plegada: boolean) => void;
}) {
  const inicioY = useRef<number | null>(null);

  function soltar(y: number) {
    if (inicioY.current == null) return;
    const delta = y - inicioY.current;
    inicioY.current = null;
    if (delta > UMBRAL_PX) onPlegada(true);
    else if (delta < -UMBRAL_PX) onPlegada(false);
    else onPlegada(!plegada);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!plegada}
      aria-label={plegada ? "Abrir ruta propuesta" : "Cerrar ruta propuesta"}
      onPointerDown={(e) => {
        inicioY.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => soltar(e.clientY)}
      onPointerCancel={() => (inicioY.current = null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlegada(!plegada);
        }
      }}
      className="shrink-0 cursor-grab select-none pb-1 active:cursor-grabbing"
      style={{ touchAction: "none" }}
    >
      <div className={cn("mx-auto mb-2.5", TIRADOR)} />
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 shrink-0 text-brand" />
        <p className="flex-1 text-sm font-semibold">Ruta propuesta</p>
        <span className="text-xs font-medium tabular-nums text-muted">
          {paradas === 1 ? "1 parada" : `${paradas} paradas`}
        </span>
        <ChevronUp
          aria-hidden
          className={cn("h-4 w-4 shrink-0 text-muted transition-transform", !plegada && "rotate-180")}
        />
      </div>
    </div>
  );
}
