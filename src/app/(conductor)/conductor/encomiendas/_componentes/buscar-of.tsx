"use client";

// Buscar un paquete por su OF (spec 003, US3): con el paquete en la mano, se
// escriben los últimos dígitos de la etiqueta y aparece su parada.

import { useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { buscarPorOf, formatoOf, MIN_DIGITOS_BUSQUEDA, nombreVisible, textoReferencia } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";

export function BuscarOf({
  pedidos,
  secuenciaDe,
  onCerrar,
}: {
  pedidos: Pedido[];
  /** Número de parada de cada pedido en la ruta; los que no están, fuera de ella. */
  secuenciaDe: Map<string, number>;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const digitos = texto.replace(/\D/g, "");
  const resultados = buscarPorOf(pedidos, digitos);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar por OF"
    >
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Últimos dígitos de la OF"
            className="h-11 w-full rounded-full border border-separator bg-card pl-9 pr-3 text-base outline-none focus:border-brand"
          />
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la búsqueda"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted active:bg-card"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {digitos.length < MIN_DIGITOS_BUSQUEDA ? (
          <p className="px-1 text-sm text-muted">
            Al menos {MIN_DIGITOS_BUSQUEDA} dígitos.
          </p>
        ) : resultados.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted shadow-soft">
            Ningún pedido pendiente de hoy tiene una OF que termine en {digitos}.
          </p>
        ) : (
          <ul className="divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-soft">
            {resultados.map((p) => {
              const secuencia = secuenciaDe.get(p.id);
              const referencia = textoReferencia(p.referencia);
              return (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-brand px-2 text-sm font-semibold tabular-nums text-brand-foreground">
                    {secuencia ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold tabular-nums tracking-wide">OF {formatoOf(p.of ?? "")}</p>
                    {referencia ? <p className="text-sm font-semibold text-brand">{referencia}</p> : null}
                    <p className="truncate text-sm">{nombreVisible(p)}</p>
                    <p className="truncate text-xs text-muted">
                      {secuencia != null ? `Parada ${secuencia}` : "Fuera de la ruta"} · {p.direccion}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
