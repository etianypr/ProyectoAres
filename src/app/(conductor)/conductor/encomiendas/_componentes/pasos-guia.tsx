"use client";

// Los tres pasos de «Cargar guía» bajo el título (dueño, 2026-11-13, maqueta A):
// Fotos · Revisar · Listo. La raya de color marca los hechos y el actual; además
// del color, el hecho lleva ✓ y el actual va en negrita (ningún estado solo por color).
// Versión simple (dueño, 2026-11-14): el paso se toca para volver a él, en vez de
// los enlaces «Más fotos» y «‹ n líneas».

import { Check, CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { BOTON_ICONO } from "./botones";

const PASOS = ["Fotos", "Revisar", "Listo"] as const;

function PasosGuia({
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
            {hecho ? <Check aria-label="hecho" className="h-3.5 w-3.5" /> : <span className="font-bold tabular-nums">{n}</span>}
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

/** La cabecera de «Cargar guía»: el título, la Ayuda, cerrar y los pasos. Pinta su
 *  fondo: con la cámara en vivo la ventana es transparente (spec 034). */
export function CabeceraGuia({
  onAyuda,
  onCerrar,
  ocupado,
  ...pasos
}: {
  onAyuda: () => void;
  onCerrar: () => void;
  /** Ubicando direcciones: no se puede cerrar. */
  ocupado: boolean;
} & React.ComponentProps<typeof PasosGuia>) {
  return (
    <div className="bg-background pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 px-4 pb-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Cargar guía</h2>
        <button
          type="button"
          onClick={onAyuda}
          aria-label="Ayuda"
          className={BOTON_ICONO}
        >
          <CircleHelp className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onCerrar}
          disabled={ocupado}
          aria-label="Cerrar"
          className={BOTON_ICONO}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <PasosGuia {...pasos} />
    </div>
  );
}
