"use client";

// Las paradas de la ruta propuesta, en orden (sale de vista-previa-ruta.tsx). Tocar
// una fila lleva el mapa a su pin. «Ver las N» (la lista a pantalla completa, spec
// 033) salió (dueño, 2026-11-19: «es inútil»): la lista ocupa lo que deja el panel
// y se desplaza, y para mirar el mapa el panel se desliza hacia abajo (spec 041).

import { Check, Clock, Phone, Trash2 } from "lucide-react";
import { nombreVisible, subtituloPedido } from "@/lib/encomiendas/paquete";
import { bloquePorId } from "@/lib/encomiendas/config";
import type { PedidoUbicado } from "@/lib/encomiendas/local/generar-ruta";

export function ListaPropuesta({
  paradas,
  numero,
  onVer,
  onQuitar,
  ocupada,
}: {
  paradas: PedidoUbicado[];
  numero: (i: number) => number;
  /** Lleva el mapa al pin de la parada. */
  onVer?: (p: PedidoUbicado) => void;
  onQuitar: (pedidoId: string) => void;
  ocupada: boolean;
}) {
  return (
    <>
      <ol className="mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-2xl bg-background">
        {paradas.map((p, i) => (
          <li key={p.id} className={`flex items-center gap-2.5 text-sm ${i > 0 ? "border-t border-divider" : ""}`}>
            <button
              type="button"
              onClick={() => onVer?.(p)}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left active:bg-card"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold tabular-nums text-brand-foreground">
                {numero(i)}
              </span>
              <span className="min-w-0 flex-1">
                {/* Lo principal es la dirección; la OF es el id (dueño, 2026-11-16). */}
                <span className="block truncate text-sm font-semibold leading-tight">{p.direccion || "Sin dirección"}</span>
                <span className="block truncate text-xs text-muted">{subtituloPedido(p)}</span>
              </span>
              {/* Qué contestó este receptor. Es la mitad del valor de haberle
                  avisado: sin esto, el conductor llega a la puerta sin saber si lo
                  están esperando. Cada estado lleva icono Y texto, no solo
                  color. */}
              {p.bloqueHorarioId ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-xs font-semibold tabular-nums text-brand">
                  <Clock className="h-3 w-3" />
                  {bloquePorId(p.bloqueHorarioId)?.etiqueta ?? p.bloqueHorarioId}
                </span>
              ) : p.disponibilidad === "confirmado" ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-ok-bg px-1.5 py-0.5 text-xs font-semibold text-ok">
                  <Check className="h-3 w-3" />
                  confirmó
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-xs font-semibold text-muted">
                  <Phone className="h-3 w-3" />
                  por llamar
                </span>
              )}
            </button>
            {/* Un pedido que no va (terreno 2026-10-28) se elimina acá mismo. */}
            <button
              type="button"
              onClick={() => onQuitar(p.id)}
              disabled={ocupada}
              aria-label={`Eliminar ${nombreVisible(p)}`}
              className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted active:bg-card disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
