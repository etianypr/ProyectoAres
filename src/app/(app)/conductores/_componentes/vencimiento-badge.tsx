import { Badge } from "@/components/ui/badge";
import { evaluarVenc } from "@/lib/conductores/vencimientos";
import { formatDate } from "@/lib/comun/format";

/** Estado de la licencia del conductor: vencida, por vencer o vigente. */
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
