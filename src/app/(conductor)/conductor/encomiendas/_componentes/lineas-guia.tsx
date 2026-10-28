"use client";

// Las líneas leídas de la guía, para revisarlas antes de crear los pedidos. Cada
// línea se lee como texto, con un lápiz para editarla al lado del basurero
// (terreno 2026-10-27); las que tienen un problema se abren ya editables.

import { useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import type { LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { formatoOf, ofDistinta, ofValida } from "@/lib/encomiendas/paquete";

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
  /** Las líneas abiertas con el lápiz. */
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const alternar = (i: number) =>
    setAbiertas((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(i)) nuevo.delete(i);
      else nuevo.add(i);
      return nuevo;
    });

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
          const mala = !of || !l.destino.trim();
          const editando = mala || abiertas.has(i);
          return (
            <li key={i} className={cn("flex items-start gap-1 px-3 py-2.5", mala && "bg-warn-bg")}>
              {editando ? (
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    aria-label="OF"
                    inputMode="numeric"
                    value={of ? formatoOf(of) : l.of}
                    onChange={(e) => onCambiar(i, { of: e.target.value })}
                    className="w-full rounded-lg border border-separator bg-background px-2 py-1.5 text-sm font-semibold tabular-nums outline-none focus:border-brand"
                    placeholder="OF"
                  />
                  <input
                    aria-label="Destino"
                    value={l.destino}
                    onChange={(e) => onCambiar(i, { destino: e.target.value })}
                    className="w-full rounded-lg border border-separator bg-background px-2 py-1.5 text-sm outline-none focus:border-brand"
                    placeholder="Destino"
                  />
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">
                    {of ? formatoOf(of) : l.of}
                    {/* Una OF de otro largo vale igual; el ⚠ dice que es distinta (terreno 2026-10-28). */}
                    {of && ofDistinta(of) ? (
                      <AlertTriangle aria-label="OF distinta" className="ml-1.5 inline h-4 w-4 align-[-2px] text-warn" />
                    ) : null}
                  </p>
                  <p className="text-sm text-muted">{l.destino}</p>
                </div>
              )}
              {/* El lápiz al lado del basurero; abierta, se cierra con el visto. */}
              {!mala ? (
                <button
                  type="button"
                  onClick={() => alternar(i)}
                  aria-label={editando ? "Listo" : "Editar la línea"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand active:bg-background"
                >
                  {editando ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setAbiertas(new Set());
                  onQuitar(i);
                }}
                aria-label="Quitar la línea"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-background"
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
