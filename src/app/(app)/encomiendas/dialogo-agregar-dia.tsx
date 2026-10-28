"use client";

// El diálogo para cargar a mano un día que el teléfono no registró (sale de agregar-dia.tsx, spec 002 T041).

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { formatCLP, formatNumber } from "@/lib/comun/format";
import { calcularPagoDia, ingresoEstimado, valorPedido, type Tarifa } from "@/lib/encomiendas/pago";
import type { ReglaDePago } from "@/types/db";
import { CamposTarifa, tarifaDeValores, type ValoresTarifa } from "./campos-tarifa";
import { agregarDiaManual } from "./actions/dia-manual";

import type { ConductorOpcion, DiaConocido, ModoTarifa } from "./agregar-dia";

export function DialogoAgregarDia({
  conductores,
  regla,
  diasConocidos,
  hoy,
  modo,
  onModo,
  tarifaEditada,
  onTarifaEditada,
  onCerrar,
  onGuardado,
}: {
  conductores: ConductorOpcion[];
  regla: ReglaDePago;
  diasConocidos: DiaConocido[];
  hoy: string;
  modo: ModoTarifa;
  onModo: (modo: ModoTarifa) => void;
  tarifaEditada: ValoresTarifa;
  onTarifaEditada: (valores: ValoresTarifa) => void;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [conductorId, setConductorId] = useState(conductores[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoy);
  const [entregados, setEntregados] = useState("");
  const [omitidos, setOmitidos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCerrar]);

  // Number("") es 0, que es justo lo que corresponde: un campo en blanco son
  // cero entregas. Un valor negativo se descarta acá y también en el servidor.
  const nEntregados = Math.max(0, Math.trunc(Number(entregados) || 0));
  const nOmitidos = Math.max(0, Math.trunc(Number(omitidos) || 0));

  // Lo que ya hay registrado de ese (conductor, día). Si viene del teléfono, lo
  // que se cargue acá se suma; si ya era carga manual, la reemplaza. Las dos
  // cosas hay que decirlas antes de apretar Guardar, no después.
  const yaHay = diasConocidos.find((d) => d.fecha === fecha && d.conductorId === conductorId);
  const delTelefono = yaHay ? yaHay.total - yaHay.manuales : 0;

  // "Mantener la del día" solo existe si el día YA tiene una: al cambiar la
  // fecha o el conductor a uno sin registrar, la opción desaparece y hay que
  // caer en la regla actual. Sin este ajuste el select mostraría una opción
  // elegida que no está en la lista, y se enviaría un modo imposible.
  const modoEfectivo: ModoTarifa = modo === "dia" && !yaHay?.tarifa ? "actual" : modo;

  // La vista previa tiene que calcular con la MISMA tarifa que va a usar la
  // base, o el número que se muestra antes de guardar no es el que se guarda.
  const conteo = { entregados: nEntregados, omitidos: nOmitidos };
  const tarifa: Tarifa =
    modoEfectivo === "editada"
      ? tarifaDeValores(tarifaEditada)
      : modoEfectivo === "dia" && yaHay?.tarifa
        ? yaHay.tarifa
        : regla;
  const pago = calcularPagoDia(conteo, tarifa);
  const ingresos = ingresoEstimado(nEntregados, valorPedido(tarifa));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await agregarDiaManual({}, datos);
      if (res.error) setError(res.error);
      else onGuardado();
    });
  }

  // Portal a document.body por el mismo motivo que ui/modal.tsx: un overlay
  // "fixed inset-0" dentro de un ancestro con transform/animación se confina al
  // área de ese ancestro y deja franjas de la pantalla sin cubrir.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Agregar día trabajado"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[18px] bg-white shadow-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-6">
          <h2 className="text-lg font-semibold">Agregar día trabajado</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
          <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Fecha" htmlFor="fecha">
              <Input
                id="fecha"
                name="fecha"
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </Field>
            <Field label="Conductor" htmlFor="conductor_id">
              <Select
                id="conductor_id"
                name="conductor_id"
                value={conductorId}
                onChange={(e) => setConductorId(e.target.value)}
                required
              >
                {conductores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Entregados" htmlFor="entregados">
              <Input
                id="entregados"
                name="entregados"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={entregados}
                onChange={(e) => setEntregados(e.target.value)}
              />
            </Field>
            <Field label="No entregados" htmlFor="omitidos" hint="Opcional">
              <Input
                id="omitidos"
                name="omitidos"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={omitidos}
                onChange={(e) => setOmitidos(e.target.value)}
              />
            </Field>

            {/* Con qué tarifa se calcula. Un select y nada más mientras no se
                elija editarla: el caso normal es cargar el día de ayer, y ahí
                esto tiene que estorbar lo menos posible. */}
            <Field label="Calcular con" htmlFor="modo_tarifa" className="sm:col-span-2">
              <Select
                id="modo_tarifa"
                name="modo_tarifa"
                value={modoEfectivo}
                onChange={(e) => onModo(e.target.value as ModoTarifa)}
              >
                {yaHay?.tarifa ? (
                  <option value="dia">
                    La tarifa con la que ya está este día ({formatCLP(yaHay.tarifa.valor_pedido)}{" "}
                    por entrega)
                  </option>
                ) : null}
                <option value="actual">
                  La regla de pago actual ({formatCLP(valorPedido(regla))} por entrega)
                </option>
                <option value="editada">Otra tarifa, solo para este día</option>
              </Select>
            </Field>

            {modoEfectivo === "editada" ? (
              <CamposTarifa valores={tarifaEditada} onChange={onTarifaEditada} />
            ) : null}

            <dl className="rounded-xl bg-background px-4 py-3 text-sm sm:col-span-2">
              <div className="flex items-center justify-between">
                <dt className="text-muted">Ingresos estimados</dt>
                <dd className="font-semibold tabular-nums text-ok">{formatCLP(ingresos)}</dd>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-divider pt-1.5">
                <dt className="text-muted">A pagar al conductor</dt>
                <dd className="font-semibold tabular-nums">{formatCLP(pago.total)}</dd>
              </div>
              <p className="mt-2 text-xs text-muted">
                Estimado a {formatCLP(valorPedido(tarifa))} por entrega · pago ={" "}
                {formatCLP(pago.base)} por pedidos + {formatCLP(pago.dia)} por el día
                {pago.bono > 0 ? ` + ${formatCLP(pago.bono)} de bono` : ""}
              </p>
            </dl>

            {/* Qué implica lo elegido. Lo que sorprende no es la cuenta, es el
                alcance: que una tarifa editada NO cambie la regla, y que elegir
                la regla actual sí mueva un día que ya estaba calculado con
                otra. */}
            {modoEfectivo === "editada" ? (
              <p className="rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info sm:col-span-2">
                Esta tarifa vale <strong>solo para este día</strong>: la regla de pago no se toca y
                los demás días siguen como están.
              </p>
            ) : modoEfectivo === "dia" && yaHay?.tarifa ? (
              <p className="rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info sm:col-span-2">
                El día se mantiene calculado a {formatCLP(yaHay.tarifa.valor_pedido)} por entrega,
                que es con lo que ya estaba.
              </p>
            ) : yaHay?.tarifa ? (
              <p className="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn sm:col-span-2">
                Este día estaba calculado a {formatCLP(yaHay.tarifa.valor_pedido)} por entrega: al
                guardar se recalcula <strong>entero</strong> con la regla actual.
              </p>
            ) : fecha < hoy ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted sm:col-span-2">
                Es un día pasado y todavía no está registrado: se va a calcular con la regla de
                pago que rige ahora. Si ese día se pagaba distinto, elige “Otra tarifa”.
              </p>
            ) : null}

            {nEntregados + nOmitidos === 0 ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted sm:col-span-2">
                Sin entregas ni omisiones, el día se registra como “salió a repartir”: cuenta como
                día trabajado y paga el fijo diario, sin sumar nada por pedido.
              </p>
            ) : null}

            {delTelefono > 0 ? (
              <p className="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn sm:col-span-2">
                Este día ya tiene {formatNumber(delTelefono)} registro
                {delTelefono === 1 ? "" : "s"} enviados desde el teléfono (
                {formatNumber(yaHay?.entregados ?? 0)} entregado
                {(yaHay?.entregados ?? 0) === 1 ? "" : "s"}). Lo que cargues acá se SUMA a eso.
              </p>
            ) : null}

            {yaHay && yaHay.manuales > 0 ? (
              <p className="rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info sm:col-span-2">
                Ya hay una carga manual de {formatNumber(yaHay.manuales)} registro
                {yaHay.manuales === 1 ? "" : "s"} para este día: al guardar se reemplaza por lo que
                pongas ahora.
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !conductorId}>
              <Save className="h-4 w-4" />
              {pending ? "Guardando…" : "Guardar día"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
