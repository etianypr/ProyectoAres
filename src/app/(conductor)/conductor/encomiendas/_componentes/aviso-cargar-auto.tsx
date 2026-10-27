"use client";

// Recién armada la ruta: "ahora escanea los N paquetes" (terreno 2026-10-27:
// "cuando se arma la ruta no da la ventana de escanear los N pedidos"). La
// tarjeta "Cargar el auto" de la lista queda igual para seguir después.

import { createPortal } from "react-dom";
import { ScanLine } from "lucide-react";

export function AvisoCargarAuto({
  faltan,
  onEscanear,
  onDespues,
}: {
  /** Paquetes de la guía sin escanear. */
  faltan: number;
  onEscanear: () => void;
  onDespues: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="Cargar el auto"
    >
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-background p-5 text-center shadow-card">
        <ScanLine className="mx-auto h-10 w-10 text-brand" />
        <div className="space-y-1">
          <p className="text-lg font-semibold">Ruta lista. Ahora carga el auto</p>
          <p className="text-sm text-muted">
            Escanea {faltan === 1 ? "el paquete" : `los ${faltan} paquetes`} de la guía: cada etiqueta te dice en qué
            parada va.
          </p>
        </div>
        <button
          type="button"
          onClick={onEscanear}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground active:scale-[0.97]"
        >
          <ScanLine className="h-4 w-4" />
          {faltan === 1 ? "Escanear el paquete" : `Escanear los ${faltan} paquetes`}
        </button>
        <button type="button" onClick={onDespues} className="h-10 w-full text-sm font-medium text-muted">
          Más tarde
        </button>
      </div>
    </div>,
    document.body,
  );
}
