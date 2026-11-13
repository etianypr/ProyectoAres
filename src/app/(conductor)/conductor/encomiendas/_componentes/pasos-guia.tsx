"use client";

// Los tres pasos de «Cargar la guía» bajo el título (dueño, 2026-11-13, maqueta A):
// Fotos · Revisar · Listo. La raya de color marca los hechos y el actual; además
// del color, el hecho lleva ✓ y el actual va en negrita (ningún estado solo por color).
// Versión simple (dueño, 2026-11-14): el paso se toca para volver a él, en vez de
// los enlaces «Más fotos» y «‹ n líneas».

import { Check } from "lucide-react";
import { cn } from "@/lib/comun/utils";

const PASOS = ["Fotos", "Revisar", "Listo"] as const;

export function PasosGuia({
  actual,
  puede,
  onIr,
}: {
  actual: 1 | 2 | 3;
  /** A qué pasos se puede ir tocándolos (al 3 se llega solo creando). */
  puede?: { 1: boolean; 2: boolean };
  onIr?: (paso: 1 | 2) => void;
}) {
  return (
    <ol className="flex gap-1.5 px-4 pb-2" aria-label="Pasos">
      {PASOS.map((nombre, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const hecho = n < actual;
        const esActual = n === actual;
        const tocable = n !== 3 && n !== actual && onIr != null && Boolean(puede?.[n]);
        const contenido = (
          <>
            {hecho ? <Check aria-label="hecho" className="h-3.5 w-3.5" /> : <span className="font-mono font-semibold">{n}</span>}
            {nombre}
          </>
        );
        return (
          <li
            key={nombre}
            aria-current={esActual ? "step" : undefined}
            className={cn(
              "flex-1 border-t-[3px] text-xs",
              hecho || esActual ? "border-brand text-brand" : "border-divider text-muted",
              esActual ? "font-bold" : "font-medium",
            )}
          >
            {tocable ? (
              <button
                type="button"
                onClick={() => onIr(n)}
                aria-label={`Ir a ${nombre}`}
                className="flex w-full items-center gap-1 pb-1.5 pt-1 text-left active:opacity-60"
              >
                {contenido}
              </button>
            ) : (
              <span className="flex items-center gap-1 pb-1.5 pt-1">{contenido}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
