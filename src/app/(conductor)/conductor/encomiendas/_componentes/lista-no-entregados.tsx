"use client";

// Lo que no se entregó en el día: hay que devolverlo a Starken (spec 007). La
// OF va primero en cada fila: es lo que se busca en el galpón (spec 003).

import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { formatoOf, nombreVisible } from "@/lib/encomiendas/paquete";

export function ListaNoEntregados({ pedidos }: { pedidos: Pedido[] }) {
  if (pedidos.length === 0) {
    return (
      <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted shadow-soft">
        Se entregó todo. No hay nada que devolver.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-soft">
      {pedidos.map((p) => (
        <li key={p.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {p.of ? <p className="text-sm font-bold tabular-nums">OF {formatoOf(p.of)}</p> : null}
            <p className={p.of ? "truncate text-xs" : "truncate text-sm font-medium"}>
              {p.of && !p.nombre ? p.direccion : nombreVisible(p)}
            </p>
            {p.of && !p.nombre ? null : <p className="truncate text-xs text-muted">{p.direccion}</p>}
          </div>
          <span
            className={
              p.resultado === "no_entregado"
                ? "shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger"
                : "shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-muted"
            }
          >
            {p.resultado === "no_entregado" ? "No entregado" : "Sin visitar"}
          </span>
        </li>
      ))}
    </ul>
  );
}
