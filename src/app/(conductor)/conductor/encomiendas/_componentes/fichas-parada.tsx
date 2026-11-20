// La foto del paquete y las fichas de la OF y del pago, en la tarjeta de la parada (spec 046;
// dueño, 2026-11-20). Las mismas medidas que la burbuja (BurbujaVista.java): la foto ocupa lo
// que queda a la izquierda, con alto fijo, y las fichas miden 96 × 36 a la derecha, con el
// ancho de «$100.000», el mayor POR PAGAR posible. Lo que se cobra va en palabras, no solo en
// color (spec 005): POR PAGAR amarillo, PAGADO verde y, sin leer, nunca «pagado».

import { Check, Package } from "lucide-react";
import { formatCLP } from "@/lib/comun/format";
import { cn } from "@/lib/comun/utils";
import { formatoOf } from "@/lib/encomiendas/paquete";
import type { PagoDelPedido } from "../_hooks/por-pagar";

const FICHA = "flex h-9 w-24 flex-col items-center justify-center rounded-ficha border leading-tight";

/** La foto del paquete, o su lugar con un ícono si todavía no hay (se saca al escanear). */
export function FotoPaquete({ url, onAmpliar }: { url: string | null; onAmpliar: () => void }) {
  if (!url) {
    return (
      <div className="flex h-[76px] min-w-0 flex-1 items-center justify-center rounded-xl border border-separator bg-background text-muted">
        <Package className="h-6 w-6" aria-label="Sin foto del paquete" />
      </div>
    );
  }
  return (
    <button type="button" onClick={onAmpliar} aria-label="Ver foto del paquete" className="h-[76px] min-w-0 flex-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL local del teléfono */}
      <img src={url} alt="" className="h-full w-full rounded-xl border border-separator object-cover" />
    </button>
  );
}

/** «OF» y su número; sin OF, «OF» sola (dueño, 2026-11-16). */
export function FichaOf({ of }: { of: string | null }) {
  return (
    <div className={cn(FICHA, "border-separator bg-background")}>
      <span className="text-xs font-extrabold text-muted">OF</span>
      {of ? <span className="font-mono text-xs font-semibold tabular-nums">{formatoOf(of)}</span> : null}
    </div>
  );
}

export function FichaPago({ pago }: { pago: PagoDelPedido | null }) {
  if (!pago) return null;
  if (pago.tipo === "pagado") {
    return (
      <div className={cn(FICHA, "flex-row gap-1 border-ok-borde bg-ok-bg text-ok")}>
        <Check className="h-4 w-4" strokeWidth={3} />
        <span className="text-sm font-extrabold">PAGADO</span>
      </div>
    );
  }
  if (pago.tipo === "sin_leer") {
    return (
      <div className={cn(FICHA, "border-dashed border-border-strong bg-card text-muted")}>
        <span className="text-xs font-extrabold">PAGO</span>
        <span className="text-xs font-bold">Sin leer</span>
      </div>
    );
  }
  return (
    <div className={cn(FICHA, "border-cobro-borde bg-cobro-bg text-cobro")}>
      <span className="text-xs font-extrabold">POR PAGAR</span>
      {pago.monto != null ? (
        <span className="text-sm font-extrabold tabular-nums">{formatCLP(pago.monto)}</span>
      ) : (
        <span className="text-xs font-bold">Por revisar</span>
      )}
    </div>
  );
}
