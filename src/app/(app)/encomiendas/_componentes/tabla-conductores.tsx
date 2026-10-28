// "Por conductor" del panel de encomiendas (sale de page.tsx, spec 002 T039).

import { Truck } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Vacio } from "@/components/ui/vacio";
import { formatCLP, formatNumber } from "@/lib/comun/format";
import type { resumenPorConductor } from "../_resumen";

export function TablaConductores({ porConductor }: { porConductor: ReturnType<typeof resumenPorConductor> }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Por conductor</CardTitle>
      </CardHeader>
      {porConductor.length === 0 ? (
        <CardBody>
          <Vacio titulo="Sin actividad en el periodo." icono={<Truck className="h-7 w-7" />} />
        </CardBody>
      ) : (
        <div className="divide-y divide-border">
          {porConductor.map((c) => (
            <div key={c.nombre} className="px-5 py-4">
              <p className="font-medium">{c.nombre}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Días trabajados</dt>
                  <dd className="tabular-nums">{formatNumber(c.diasTrabajados)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Pedidos entregados</dt>
                  <dd className="tabular-nums">{formatNumber(c.entregados)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Ingresos generados</dt>
                  <dd className="tabular-nums text-ok">{formatCLP(c.ingresos)}</dd>
                </div>
                <div className="flex justify-between border-t border-divider pt-1.5">
                  <dt className="font-medium">Total a pagar</dt>
                  <dd className="font-semibold tabular-nums">{formatCLP(c.pago)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
