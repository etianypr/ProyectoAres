import { Card, CardBody } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

// Tarjeta KPI del sistema de diseño ("A · Minimalista"): monto protagonista,
// ícono sutil en círculo tintado, acento de color solo donde hay significado.
export function Kpi({
  label,
  value,
  valueClass = "",
  sub,
  subClass = "text-muted",
  icon: Icon,
  tint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub: string;
  subClass?: string;
  icon: LucideIcon;
  tint: string;
}) {
  return (
    <Card className="group transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-card">
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted">{label}</span>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 ${tint}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div
          className={`mt-1 text-[26px] font-semibold tracking-[-0.02em] tabular-nums ${valueClass}`}
        >
          {value}
        </div>
        <div className={`mt-1 text-xs font-medium ${subClass}`}>{sub}</div>
      </CardBody>
    </Card>
  );
}
