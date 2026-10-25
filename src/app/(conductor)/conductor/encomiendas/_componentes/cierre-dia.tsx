"use client";

// Cierre del día (spec 007): lo que no se entregó y la confirmación que borra del
// teléfono los datos de los destinatarios. Pantalla completa: hasta confirmar,
// esto es lo único que importa. Un día anterior no se puede dejar para después.

import { createPortal } from "react-dom";
import { PackageX } from "lucide-react";
import { formatCLP, formatDateLong } from "@/lib/comun/format";
import type { CierrePendiente } from "../_hooks/use-cierre-dia";
import { ListaNoEntregados } from "./lista-no-entregados";

export function CierreDia({
  cierre,
  borrando,
  error,
  onConfirmar,
  onAplazar,
}: {
  cierre: CierrePendiente;
  borrando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onAplazar: () => void;
}) {
  if (typeof document === "undefined") return null;
  const n = cierre.noEntregados.length;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-background pt-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Cierre del día"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div>
          <p className="text-xs font-medium text-muted">{formatDateLong(cierre.fecha)}</p>
          <h2 className="text-xl font-semibold leading-tight">
            {cierre.esHoy ? "Día terminado" : "Este día quedó sin cerrar"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Entregaste {cierre.entregadas} de {cierre.asignados}.
          </p>
          {cierre.porPagar > 0 ? (
            <p className="mt-1 text-sm font-medium tabular-nums">
              Cobraste {formatCLP(cierre.cobrado)} de {formatCLP(cierre.aCobrar)} ({cierre.porPagar} por pagar).
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <PackageX className="h-4 w-4 text-danger" />
            No entregados ({n})
          </p>
          {n > 0 ? (
            <p className="text-xs text-muted">Devuélvelos a Starken. Revisa la lista antes de confirmar.</p>
          ) : null}
          <ListaNoEntregados pedidos={cierre.noEntregados} />
        </div>

        <p className="text-xs text-muted">
          Al confirmar se borran de este teléfono los nombres, teléfonos y direcciones de ese día.
          Quedan solo las cifras. Las entregas sin enviar salen igual cuando haya señal.
        </p>
        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      </div>

      <div className="space-y-2 border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          disabled={borrando}
          onClick={onConfirmar}
          className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground transition-transform active:scale-[0.97] disabled:opacity-50"
        >
          {borrando ? "Borrando…" : "Listo, borrar del teléfono"}
        </button>
        {cierre.esHoy ? (
          <button
            type="button"
            disabled={borrando}
            onClick={onAplazar}
            className="flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-muted active:bg-card"
          >
            Ahora no
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
