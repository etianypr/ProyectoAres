"use client";

// Accesibilidad (dueño, 2026-11-14): lo que el conductor deja a su gusto, por
// categoría. Por ahora una sola: las llamadas en altavoz. Se guarda en el
// teléfono y no es un dato del día (lib/nativo/telefono.ts).

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Volume2, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { altavozAlLlamar, elegirAltavozAlLlamar } from "@/lib/nativo/telefono";

/** Un interruptor con su nombre. El estado va escrito («Activado» /
 *  «Desactivado»): no depende solo del color. */
function Interruptor({
  icono,
  nombre,
  activado,
  onCambiar,
}: {
  icono: ReactNode;
  nombre: string;
  activado: boolean;
  onCambiar: (activado: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activado}
      onClick={() => onCambiar(!activado)}
      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-background"
    >
      {icono}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight">{nombre}</span>
        <span className={cn("block text-xs", activado ? "font-semibold text-brand" : "text-muted")}>{activado ? "Activado" : "Desactivado"}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "flex h-[30px] w-[52px] shrink-0 items-center rounded-full border p-[2px] transition-colors duration-150",
          activado ? "border-brand bg-brand" : "border-separator bg-background",
        )}
      >
        <span className={cn("h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-150", activado && "translate-x-[22px]")} />
      </span>
    </button>
  );
}

export function Accesibilidad({ onCerrar }: { onCerrar: () => void }) {
  const [altavoz, setAltavoz] = useState(altavozAlLlamar);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Accesibilidad"
    >
      <div className="flex items-center gap-2 px-4 pb-3">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Accesibilidad</h2>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h3 className="px-1 pb-2 text-xs font-medium text-muted">Llamadas</h3>
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Interruptor
            icono={<Volume2 className="h-5 w-5 shrink-0 text-brand" />}
            nombre="Altavoz"
            activado={altavoz}
            onCambiar={(activado) => {
              elegirAltavozAlLlamar(activado);
              setAltavoz(activado);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
