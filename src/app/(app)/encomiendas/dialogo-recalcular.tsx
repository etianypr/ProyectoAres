"use client";

// El diálogo para recalcular un día con otra tarifa (sale de actividad-dia.tsx, spec 002 T041).

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { formatCLP, formatNumber } from "@/lib/comun/format";
import { calcularPagoDia, ingresoEstimado, valorPedido, type ConteoDia, type Tarifa } from "@/lib/encomiendas/pago";
import { CamposTarifa, tarifaDeValores, valoresDeTarifa, type ValoresTarifa } from "./campos-tarifa";
import { repreciarDia, repreciarDiaConTarifa } from "./actions/dia-manual";
import type { ReglaDePago } from "@/types/db";

// ----------------------------------------------------------------------------
// Volver a valorar el día
//
// Dos caminos y un solo botón: la regla de pago de ahora, o una tarifa escrita
// a mano que vale solo para este día (0033). El segundo existe porque la regla
// rige hacia adelante — para un día viejo que se pagaba distinto no hay ninguna
// tabla de donde sacar su tarifa.
//
// Muestra en cuánto queda el día ANTES de confirmar, con las mismas funciones
// puras del panel (lib/encomiendas/pago.ts): volver a valorar algo que ya se
// contó como pagado no puede ser a ciegas.
// ----------------------------------------------------------------------------
export function DialogoRecalcular({
  conductorId,
  fecha,
  conteo,
  partida,
  regla,
  onCerrar,
}: {
  conductorId: string;
  fecha: string;
  conteo: ConteoDia;
  partida: Tarifa | null;
  regla: ReglaDePago | null;
  onCerrar: () => void;
}) {
  // Sin regla configurada, "la regla actual" no es una opción: no hay ninguna.
  // Queda la tarifa a mano, que además es la forma de rescatar un día que
  // aparece "Sin regla" en el panel.
  const [modo, setModo] = useState<"actual" | "editada">(regla ? "actual" : "editada");
  const [valores, setValores] = useState<ValoresTarifa>(() => valoresDeTarifa(partida));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tarifa = modo === "editada" ? tarifaDeValores(valores) : regla;
  const pago = calcularPagoDia(conteo, tarifa);
  const ingresos = ingresoEstimado(conteo.entregados, valorPedido(tarifa));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res =
        modo === "editada"
          ? await repreciarDiaConTarifa(conductorId, fecha, datos)
          : await repreciarDia(conductorId, fecha);
      if (res.error) setError(res.error);
      else onCerrar();
    });
  }

  return (
    <Dialogo
      titulo="Recalcular el día"
      descripcion={`${formatNumber(conteo.entregados)} entregado${conteo.entregados === 1 ? "" : "s"} · ${formatNumber(conteo.omitidos)} no entregado${conteo.omitidos === 1 ? "" : "s"}`}
      onCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Calcular con" htmlFor="modo" className="sm:col-span-2">
          <Select
            id="modo"
            value={modo}
            onChange={(e) => setModo(e.target.value as "actual" | "editada")}
          >
            {regla ? (
              <option value="actual">
                La regla de pago actual ({formatCLP(valorPedido(regla))} por entrega)
              </option>
            ) : null}
            <option value="editada">Otra tarifa, solo para este día</option>
          </Select>
        </Field>

        {modo === "editada" ? <CamposTarifa valores={valores} onChange={setValores} /> : null}

        <dl className="rounded-xl bg-white px-4 py-3 text-sm sm:col-span-2">
          <div className="flex items-center justify-between">
            <dt className="text-muted">Ingresos estimados</dt>
            <dd className="font-semibold tabular-nums text-ok">{formatCLP(ingresos)}</dd>
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-divider pt-1.5">
            <dt className="text-muted">A pagar al conductor</dt>
            <dd className="font-semibold tabular-nums">{formatCLP(pago.total)}</dd>
          </div>
          <p className="mt-2 text-xs text-muted">
            {formatCLP(pago.base)} por pedidos + {formatCLP(pago.dia)} por el día
            {pago.bono > 0 ? ` + ${formatCLP(pago.bono)} de bono` : ""}
          </p>
        </dl>

        <p className="text-xs text-muted sm:col-span-2">
          {modo === "editada"
            ? "La tarifa vale solo para este día: la regla de pago no se toca."
            : "Solo se mueve este día. Los demás conservan las cifras con las que se calcularon."}
        </p>

        {error ? (
          <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onCerrar} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Recalculando…" : "Recalcular"}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
