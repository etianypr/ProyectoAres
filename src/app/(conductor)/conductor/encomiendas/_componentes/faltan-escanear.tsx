"use client";

// Los paquetes de la guía que faltan por escanear, con su número de parada: el
// mismo «PARADA n» que dice el escaneo, para ubicarlos en el auto (spec 027,
// paso 4). Reemplaza a la tarjeta "Cargar el auto", que mostraba solo las OF.
// Tocar uno abre su pedido (spec 033, filas-muertas).

import { useState } from "react";
import { formatoOf } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { FaltaEscanear } from "../_hooks/use-carga-auto";

const A_LA_VISTA = 5;

export function FaltanEscanear({ faltan, onAbrir }: { faltan: FaltaEscanear[]; onAbrir: (pedido: Pedido) => void }) {
  const [todos, setTodos] = useState(false);
  const vista = todos ? faltan : faltan.slice(0, A_LA_VISTA);
  return (
    <div className="space-y-2">
      <ol className="divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-soft">
        {vista.map(({ pedido, secuencia, bultos }) => (
          <li key={pedido.id}>
            <button
              type="button"
              onClick={() => onAbrir(pedido)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-background"
            >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-separator text-[11px] font-semibold tabular-nums">
              {secuencia ?? "–"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold tabular-nums">
                {pedido.of ? `OF ${formatoOf(pedido.of)}` : "Sin OF"}
              </p>
              <p className="truncate text-xs text-muted">{pedido.direccion}</p>
            </div>
            {/* Un envío de varios bultos al que le falta alguno (spec 022). */}
            {bultos ? (
              <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warn">
                Bultos {bultos.escaneados} de {bultos.total}
              </span>
            ) : null}
            </button>
          </li>
        ))}
      </ol>
      {faltan.length > A_LA_VISTA ? (
        <button type="button" onClick={() => setTodos((v) => !v)} className="w-full py-1 text-xs font-semibold text-muted">
          {todos ? "Ver menos" : `+${faltan.length - A_LA_VISTA} más`}
        </button>
      ) : null}
    </div>
  );
}
