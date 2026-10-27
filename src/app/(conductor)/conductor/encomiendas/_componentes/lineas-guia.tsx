"use client";

// Las líneas leídas de la guía, para revisarlas antes de crear los pedidos: OF y
// destino editables, y las dudosas marcadas.

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import type { LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { formatoOf, ofValida } from "@/lib/encomiendas/paquete";

export function LineasGuia({
  lineas,
  avisos,
  folio,
  onCambiar,
  onQuitar,
  onAgregar,
  children,
}: {
  lineas: LineaGuia[];
  avisos: string[];
  folio: string | null;
  onCambiar: (i: number, cambio: Partial<LineaGuia>) => void;
  onQuitar: (i: number) => void;
  onAgregar: () => void;
  /** Lo que va entre la lista y "Agregar una línea" (los botones de foto). */
  children?: React.ReactNode;
}) {
  return (
    <>
      {avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {a}
        </p>
      ))}
      <p className="text-sm font-medium">
        {lineas.length} {lineas.length === 1 ? "línea" : "líneas"}
        {folio ? ` · guía N° ${folio}` : ""}
      </p>
      <ul className="divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-soft">
        {lineas.map((l, i) => {
          const of = ofValida(l.of);
          return (
            <li key={i} className={cn("flex items-start gap-2 px-3 py-2.5", (!of || !l.destino.trim()) && "bg-warn-bg")}>
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  aria-label="OF"
                  inputMode="numeric"
                  value={of ? formatoOf(of) : l.of}
                  onChange={(e) => onCambiar(i, { of: e.target.value })}
                  className="w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
                  placeholder="OF (9 dígitos)"
                />
                <input
                  aria-label="Destino"
                  value={l.destino}
                  onChange={(e) => onCambiar(i, { destino: e.target.value })}
                  className="w-full bg-transparent text-sm text-muted outline-none"
                  placeholder="Destino"
                />
              </div>
              <button
                type="button"
                onClick={() => onQuitar(i)}
                aria-label="Quitar la línea"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted active:bg-background"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {children}
      <button
        type="button"
        onClick={onAgregar}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-separator py-3 text-sm font-medium text-brand"
      >
        <Plus className="h-4 w-4" />
        Agregar una línea
      </button>
    </>
  );
}
