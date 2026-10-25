// Indicadores del negocio (spec 006): cómo se trabajó en el período y cuánto
// cambió contra el anterior. La diferencia va con signo y en palabras, no solo
// con color. Se calculan en lib/encomiendas/indicadores.ts.

import { Clock, Gauge, PhoneCall, PiggyBank, Target, Timer } from "lucide-react";
import { Kpi } from "@/components/ui/kpi";
import { formatCLP, formatDate, formatNumber } from "@/lib/comun/format";
import { diferencia, type Indicadores } from "@/lib/encomiendas/indicadores";

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const horas = (min: number | null) =>
  min == null ? "—" : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;

/** "+3 pts vs período anterior", o por qué no hay comparación. */
function contra(d: number | null, formato: (n: number) => string): string {
  if (d == null) return "sin dato del período anterior";
  if (Math.abs(d) < 1e-9) return "igual que el período anterior";
  return `${d > 0 ? "+" : "−"}${formato(Math.abs(d))} vs período anterior`;
}
const tono = (d: number | null, mejorSiSube = true) =>
  d == null || Math.abs(d) < 1e-9 ? "text-muted" : d > 0 === mejorSiSube ? "text-ok" : "text-danger";

export function IndicadoresPeriodo({ actual, anterior }: { actual: Indicadores; anterior: Indicadores }) {
  if (actual.diasTrabajados === 0) {
    return (
      <p className="rounded-[14px] border border-separator bg-card px-4 py-3 text-sm text-muted">
        Sin días trabajados en el período: no hay indicadores que mostrar.
      </p>
    );
  }

  const puntos = (n: number) => `${Math.round(n * 100)} pts`;
  const dTasa = diferencia(actual.tasaEntrega, anterior.tasaEntrega);
  const dAsig = diferencia(actual.tasaSobreAsignados, anterior.tasaSobreAsignados);
  const dCont = diferencia(actual.tasaContactados, anterior.tasaContactados);
  const dDur = diferencia(actual.duracionMediaMin, anterior.duracionMediaMin);
  const dHora = diferencia(actual.entregasPorHora, anterior.entregasPorHora);
  const dMargen = diferencia(actual.margen, anterior.margen);

  return (
    <div className="space-y-2">
      <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Tasa de entrega"
          value={pct(actual.tasaEntrega)}
          sub={`${formatNumber(actual.entregas)} de ${formatNumber(actual.intentos)} visitas · ${contra(dTasa, puntos)}`}
          subClass={tono(dTasa)}
          icon={Gauge}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Entregados sobre lo asignado"
          value={pct(actual.tasaSobreAsignados)}
          sub={
            actual.asignados == null
              ? "El teléfono empieza a informarlo con esta versión"
              : `${formatNumber(actual.entregasConAsignados)} de ${formatNumber(actual.asignados)} · ${contra(dAsig, puntos)}`
          }
          subClass={actual.asignados == null ? "text-muted" : tono(dAsig)}
          icon={Target}
          tint="bg-brand-soft text-brand"
        />
        <Kpi
          label="Contactados antes de llegar"
          value={pct(actual.tasaContactados)}
          sub={
            actual.contactados == null
              ? "Contestó la llamada o respondió el aviso"
              : `${formatNumber(actual.contactados)} contestaron · ${contra(dCont, puntos)}`
          }
          subClass={actual.contactados == null ? "text-muted" : tono(dCont)}
          icon={PhoneCall}
          tint="bg-info-bg text-info"
        />
        <Kpi
          label="Duración media del día"
          value={horas(actual.duracionMediaMin)}
          sub={contra(dDur, (n) => `${Math.round(n)} min`)}
          // Menos tiempo por día es mejor.
          subClass={tono(dDur, false)}
          icon={Clock}
          tint="bg-warn-bg text-warn"
        />
        <Kpi
          label="Entregas por hora"
          value={actual.entregasPorHora == null ? "—" : actual.entregasPorHora.toFixed(1).replace(".", ",")}
          sub={contra(dHora, (n) => n.toFixed(1).replace(".", ","))}
          subClass={tono(dHora)}
          icon={Timer}
          tint="bg-brand-soft text-brand"
        />
        <Kpi
          label="Margen (ingreso − pago)"
          value={formatCLP(actual.margen)}
          valueClass={actual.margen >= 0 ? "text-ok" : "text-danger"}
          sub={`${formatCLP(actual.ingreso)} − ${formatCLP(actual.pago)} · ${contra(dMargen, formatCLP)}`}
          subClass={tono(dMargen)}
          icon={PiggyBank}
          tint="bg-ok-bg text-ok"
        />
      </div>
      <p className="text-xs text-muted">
        {actual.diasAbiertos > 0
          ? `${actual.diasAbiertos} día(s) en curso quedan fuera de duración y entregas por hora. `
          : ""}
        {actual.desdeAsignados ? `Asignados y contactados con datos desde el ${formatDate(actual.desdeAsignados)}. ` : ""}
        Los días cargados desde la oficina cuentan en entregas y margen, no en duración.
      </p>
    </div>
  );
}
