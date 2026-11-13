"use client";

// Las paradas de la ruta propuesta, en orden (sale de vista-previa-ruta.tsx). Con
// 86 paradas la lista chica mostraba 2 (spec 033, nuevo-propuesta-lista-chica):
// «Ver las N» la sube a pantalla completa, y tocar una fila la achica y lleva el
// mapa a su pin.

import { Check, ChevronDown, ChevronUp, Clock, Phone, Trash2 } from "lucide-react";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { bloquePorId } from "@/lib/encomiendas/config";
import type { PedidoUbicado } from "@/lib/encomiendas/local/generar-ruta";
import { cn } from "@/lib/comun/utils";

export function ListaPropuesta({
  paradas,
  numero,
  entera,
  onEntera,
  onVer,
  onQuitar,
  ocupada,
}: {
  paradas: PedidoUbicado[];
  numero: (i: number) => number;
  entera: boolean;
  onEntera: (entera: boolean) => void;
  /** Lleva el mapa al pin de la parada. */
  onVer?: (p: PedidoUbicado) => void;
  onQuitar: (pedidoId: string) => void;
  ocupada: boolean;
}) {
  return (
    <>
      {paradas.length > 2 ? (
        <button
          type="button"
          onClick={() => onEntera(!entera)}
          className="mt-2 flex h-9 shrink-0 items-center justify-center gap-1 text-xs font-semibold text-brand"
        >
          {entera ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          {entera ? "Ver el mapa" : `Ver las ${paradas.length}`}
        </button>
      ) : null}
      {/* El orden es lo que el conductor viene a revisar: se puede desplazar, pero
          sin comerse la pantalla — el mapa de atrás también es parte de esto. */}
      <ol className={cn("min-h-0 flex-1 overflow-y-auto rounded-2xl bg-background", entera ? "mt-1" : "mt-1 max-h-[17vh]")}>
        {paradas.map((p, i) => (
          <li key={p.id} className={`flex items-center gap-2.5 text-sm ${i > 0 ? "border-t border-divider" : ""}`}>
            <button
              type="button"
              onClick={() => {
                onEntera(false);
                onVer?.(p);
              }}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left active:bg-card"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-[11px] font-semibold tabular-nums text-brand-foreground">
                {numero(i)}
              </span>
              <span className="min-w-0 flex-1">
                {/* La OF en monoespaciada, como en la guía; el nombre, en la letra de texto. */}
                <span className={`block truncate font-semibold leading-tight ${p.nombre ? "text-sm" : "font-mono text-[13px]"}`}>
                  {nombreVisible(p)}
                </span>
                <span className="block truncate text-xs text-muted">{p.direccion}</span>
              </span>
              {/* Qué contestó este receptor. Es la mitad del valor de haberle
                  avisado: sin esto, el conductor llega a la puerta sin saber si lo
                  están esperando. Cada estado lleva icono Y texto, no solo
                  color. */}
              {p.bloqueHorarioId ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brand">
                  <Clock className="h-3 w-3" />
                  {bloquePorId(p.bloqueHorarioId)?.etiqueta ?? p.bloqueHorarioId}
                </span>
              ) : p.disponibilidad === "confirmado" ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-ok-bg px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                  <Check className="h-3 w-3" />
                  confirmó
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted">
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
