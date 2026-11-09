"use client";

// «◎ N cerca» (spec 023; dueño, 2026-11-08): las paradas a menos de 300 m de la
// activa, en la esquina de abajo a la izquierda del mapa, frente a «Centrar». Al
// tocarla se abre la lista, con 📞 y «Hacer ahora», que la deja como la próxima.
// Solo en ARES: la burbuja es nativa y sumarla obligaría a otra APK.

import { useState } from "react";
import { Phone, Radar } from "lucide-react";
import { formatDistancia } from "@/lib/comun/format";
import { cn } from "@/lib/comun/utils";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { Parada } from "../_hooks/dia-trabajo-tipos";
import { paradasCercanas, type Cercana } from "../_hooks/paradas-cercanas";

export function ParadasCercanas({
  paradas,
  activa,
  pedidos,
  guardando,
  onLlamar,
  onHacerAhora,
  avisar,
}: {
  paradas: Parada[];
  activa: Parada | null;
  pedidos: Pedido[];
  guardando: boolean;
  onLlamar: (c: Cercana) => void;
  /** null = no se pudo (el error ya está a la vista). */
  onHacerAhora: (pedidoId: string) => Promise<unknown>;
  avisar: (texto: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const cercanas = paradasCercanas(paradas, activa, pedidos);
  if (cercanas.length === 0) return null;

  async function hacerAhora(c: Cercana) {
    setAbierta(false);
    if ((await onHacerAhora(c.pedido.id)) === null) return;
    avisar(c.secuencia == null ? "Entró a la ruta como la próxima parada" : `La ${c.secuencia} queda como la próxima parada`);
  }

  return (
    <div className="pointer-events-auto relative">
      {abierta ? (
        <>
          {/* Tocar fuera de la lista la cierra. */}
          <button type="button" aria-label="Cerrar" onClick={() => setAbierta(false)} className="fixed inset-0 cursor-default" />
          <div className="absolute bottom-full left-0 mb-2 w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl bg-card p-2 shadow-md">
            <p className="px-2 pb-1 text-xs font-semibold text-muted">Cerca de aquí</p>
            <ul className="space-y-1">
              {cercanas.map((c) => (
                <li key={c.pedido.id} className="flex items-center gap-2 px-1 py-1">
                  <span
                    className={cn(
                      "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-background px-1.5 text-xs font-semibold",
                      c.secuencia != null && "font-mono",
                    )}
                  >
                    {c.secuencia ?? "+"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.pedido.direccion}</span>
                    <span className="block text-xs text-muted">
                      <span className="font-mono">{formatDistancia(c.metros)}</span>
                      {c.secuencia == null ? " · fuera de la ruta" : null}
                    </span>
                  </span>
                  {c.pedido.telefono ? (
                    <button
                      type="button"
                      onClick={() => onLlamar(c)}
                      aria-label="Llamar"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-separator bg-card text-brand active:scale-[0.97]"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => void hacerAhora(c)}
                    className="h-10 shrink-0 rounded-full bg-brand px-3 text-xs font-semibold text-brand-foreground active:scale-[0.97] disabled:opacity-50"
                  >
                    Hacer ahora
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="relative flex h-11 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-semibold shadow-md active:scale-[0.97]"
      >
        <Radar className="h-4 w-4 text-brand" aria-hidden />
        {cercanas.length} cerca
      </button>
    </div>
  );
}
