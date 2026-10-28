"use client";

// Cargar el auto: la unión entre la guía y el escaneo de cada paquete (spec 005,
// US5; terreno 2026-10-27: "falta una conexión entre la guía y escanear los
// paquetes"). Con la ruta armada y hasta la primera parada cerrada, muestra
// cuántos paquetes de la guía se escanearon, el botón para seguir y las OF que
// faltan. No bloquea: si un paquete no viene, queda en "No entregados" al cerrar
// el día y vuelve a Starken.

import { AlertTriangle, CheckCircle2, ScanLine } from "lucide-react";
import { avanceCarga, sinEtiquetaEscaneada, type Pedido } from "@/lib/encomiendas/local/almacen";
import { formatoOf } from "@/lib/encomiendas/paquete";

const MAX_OF_A_LA_VISTA = 12;

export function ProgresoCarga({ pedidos, onEscanear }: { pedidos: Pedido[]; onEscanear: () => void }) {
  const empezo = pedidos.some((p) => p.resultado !== "pendiente");
  const { escaneados, total } = avanceCarga(pedidos);
  if (empezo || total === 0) return null;
  const faltan = sinEtiquetaEscaneada(pedidos);
  const completo = faltan.length === 0;

  return (
    <div className="mb-4 space-y-2 rounded-2xl bg-card p-3.5 shadow-soft">
      <div className="flex items-center gap-2">
        {completo ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
        ) : (
          <ScanLine className="h-5 w-5 shrink-0 text-brand" />
        )}
        <p className="min-w-0 flex-1 text-sm font-semibold">
          {completo ? "Todos los paquetes escaneados" : "Cargar el auto: escanea cada paquete"}
        </p>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {escaneados}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#ececef]">
        <div
          className="h-full rounded-full bg-ok transition-[width] duration-500"
          style={{ width: `${(escaneados / total) * 100}%` }}
        />
      </div>
      {completo ? null : (
        <>
          <button
            type="button"
            onClick={onEscanear}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-brand-foreground active:scale-[0.97]"
          >
            <ScanLine className="h-4 w-4" />
            {escaneados === 0 ? "Escanear los paquetes" : "Seguir escaneando"}
          </button>
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            Faltan:
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {faltan.slice(0, MAX_OF_A_LA_VISTA).map((p) => (
              <li key={p.id} className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold tabular-nums">
                {p.of ? formatoOf(p.of) : "sin OF"}
              </li>
            ))}
            {faltan.length > MAX_OF_A_LA_VISTA ? (
              <li className="px-1 py-1 text-xs text-muted">+{faltan.length - MAX_OF_A_LA_VISTA} más</li>
            ) : null}
          </ul>
        </>
      )}
    </div>
  );
}
