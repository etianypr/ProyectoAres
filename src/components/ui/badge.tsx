import * as React from "react";
import { cn } from "@/lib/utils";
import { evaluarVenc } from "@/lib/vencimientos";
import { formatDate } from "@/lib/format";

// Quedan dos: el Badge genérico y el de vencimiento (la licencia del conductor).
// Los de cotización, viaje, factura y estado de pedido se fueron con los negocios
// que no son parte de esta empresa. El de pedido, además, valoraba un estado que
// ya no existe: los pedidos viven en el teléfono del conductor, no en la base.

export const tones = {
  gray: { wrap: "bg-[#ececef] text-[#6e6e73]", dot: "#86868b" },
  blue: { wrap: "bg-info-bg text-info", dot: "var(--info)" },
  green: { wrap: "bg-ok-bg text-ok", dot: "var(--ok)" },
  amber: { wrap: "bg-warn-bg text-warn", dot: "var(--warn)" },
  red: { wrap: "bg-danger-bg text-danger", dot: "var(--danger)" },
  violet: { wrap: "bg-[#ece8f8] text-[#5b3aa8]", dot: "#5b3aa8" },
} as const;

export type Tone = keyof typeof tones;

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
        t.wrap,
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: t.dot }}
        aria-hidden
      />
      {children}
    </span>
  );
}

export function VencimientoBadge({ fecha }: { fecha: string | null }) {
  if (!fecha) return <span className="text-xs text-muted">Sin dato</span>;
  const ev = evaluarVenc(fecha);
  if (!ev) return <span className="text-xs text-muted">Sin dato</span>;
  if (ev.estado === "vencido")
    return <Badge tone="red">Vencido · {formatDate(fecha)}</Badge>;
  if (ev.estado === "por_vencer")
    return (
      <Badge tone="amber">
        Vence en {ev.dias} día{ev.dias === 1 ? "" : "s"}
      </Badge>
    );
  return <Badge tone="green">Vigente · {formatDate(fecha)}</Badge>;
}
