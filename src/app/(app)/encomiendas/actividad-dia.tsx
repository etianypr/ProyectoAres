"use client";

// Lo que hizo un conductor en un día, visto desde la oficina. Reemplaza a
// RutaResumen: la ruta y las direcciones ya no existen en el servidor (viven en
// el teléfono, ver 0026), así que lo que se puede mostrar acá es la actividad
// registrada — cuántas entregas, a qué hora, y la liquidación del día.
//
// Tampoco hay botón de generar ruta: eso lo hace el conductor en su teléfono.
// Desde la oficina no había forma de que una ruta generada acá le llegara.

import { useState, useTransition } from "react";
import { Clock, Wallet, Truck, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { formatCLP, formatNumber, formatTime } from "@/lib/format";
import {
  calcularPagoDia,
  ingresoEstimado,
  tarifaDelDia,
  valorPedido,
  type ConteoDia,
  type TarifaPago,
} from "@/lib/encomiendas/pago";
import {
  CamposTarifa,
  tarifaDeValores,
  valoresDeTarifa,
  type ValoresTarifa,
} from "./campos-tarifa";
import { eliminarDiaManual, repreciarDia, repreciarDiaConTarifa } from "./actions";
import type {
  EncomiendaActividadOrigen,
  EncomiendaActividadTipo,
  EncomiendaJornada,
  EncomiendaPago,
  EncomiendaReglaPago,
} from "@/types/db";

export type EventoDia = {
  id: string;
  tipo: EncomiendaActividadTipo;
  /** 'app' = lo mandó el teléfono · 'manual' = lo cargó la oficina (0028). */
  origen: EncomiendaActividadOrigen;
};

// Acá vivían PRESENTACION (el ícono y la etiqueta de cada tipo de evento) y
// MINUTOS_RETRASO_NOTABLE, que marcaba las entregas cuya hora del teléfono
// quedaba muy atrás de la de llegada al servidor — la señal de que el conductor
// había trabajado sin cobertura.
//
// Se fueron con la bitácora por evento (0032). Con la ruta hecha de corrido, la
// hora de cada entrega no dice nada que no diga el par (empezó, terminó), y el
// indicador de "sin señal" perdió sentido: ahora el cierre de la jornada puede
// llegar mucho después de la última entrega sin que eso signifique nada raro.

export function ActividadDia({
  choferId,
  choferNombre,
  fecha,
  eventos,
  pago,
  jornada,
  regla,
}: {
  /** null si el conductor fue eliminado: el día se ve, pero no se liquida. */
  choferId: string | null;
  choferNombre: string;
  fecha: string;
  eventos: EventoDia[];
  /** Las cifras que la base congeló para este día (0031). null si no se pudo
   *  calcular: la ruta sigue en curso, no hay regla, o no hay conductor. */
  pago: EncomiendaPago | null;
  /** El sobre del día (0032): de cuándo a cuándo salió la ruta. */
  jornada: EncomiendaJornada | null;
  /** La regla de pago de ahora, para el diálogo de recalcular: es una de las
   *  dos tarifas con las que se puede volver a valorar el día, y el punto de
   *  partida cuando se va a escribir otra. */
  regla: EncomiendaReglaPago | null;
}) {
  const [pendingBorrar, startTransitionBorrar] = useTransition();
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  function onBorrarManual() {
    if (!choferId) return;
    setErrorBorrar(null);
    startTransitionBorrar(async () => {
      const res = await eliminarDiaManual(choferId, fecha);
      if (res.error) setErrorBorrar(res.error);
      setConfirmandoBorrado(false);
    });
  }

  const entregados = eventos.filter((e) => e.tipo === "entrega").length;
  const omitidos = eventos.filter((e) => e.tipo === "omision").length;

  const delTelefono = eventos.filter((e) => e.origen === "app");
  const enCursoJornada = jornada != null && jornada.cerrada_en == null;
  const manuales = eventos.filter((e) => e.origen === "manual");
  const manualEntregados = manuales.filter((e) => e.tipo === "entrega").length;
  const manualOmitidos = manuales.filter((e) => e.tipo === "omision").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{choferNombre}</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Truck className="h-3.5 w-3.5" />
          {formatNumber(eventos.length)} registro{eventos.length === 1 ? "" : "s"}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold tabular-nums">{entregados}</p>
            <p className="text-xs text-muted">Entregados</p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums">{omitidos}</p>
            <p className="text-xs text-muted">No entregados</p>
          </div>
          <div>
            {/* Un guion y no un $0: sin cifras el día no vale cero, es que no
                se pudo calcular (sin regla de pago, o conductor eliminado). */}
            <p className="text-lg font-semibold tabular-nums">
              {pago ? formatCLP(pago.ingresos_totales) : "—"}
            </p>
            <p className="text-xs text-muted">Ingresos del día</p>
          </div>
        </div>

        {manuales.length > 0 ? (
          <div className="rounded-xl border border-[#ece8f8] bg-[#faf9fe] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="violet">Carga manual</Badge>
              <span className="text-xs text-muted">
                Cargado desde la oficina, sin registro de horas
              </span>
            </div>
            <p className="mt-2 text-sm">
              {formatNumber(manualEntregados)} entregado
              {manualEntregados === 1 ? "" : "s"} · {formatNumber(manualOmitidos)} no entregado
              {manualOmitidos === 1 ? "" : "s"}
              {manualEntregados + manualOmitidos === 0 ? " (solo día trabajado)" : ""}
            </p>
            {choferId ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {confirmandoBorrado ? (
                  <>
                    <span className="text-xs text-danger">
                      ¿Borrar esta carga manual?
                      {delTelefono.length === 0
                        ? " El día completo desaparece del panel, junto con su liquidación si estaba confirmada."
                        : " Lo que mandó el teléfono se conserva."}
                    </span>
                    <Button
                      onClick={onBorrarManual}
                      disabled={pendingBorrar}
                      size="sm"
                      variant="danger"
                    >
                      {pendingBorrar ? "Borrando…" : "Sí, borrar"}
                    </Button>
                    <Button
                      onClick={() => setConfirmandoBorrado(false)}
                      disabled={pendingBorrar}
                      size="sm"
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setConfirmandoBorrado(true)}
                    size="sm"
                    variant="dangerOutline"
                  >
                    <Trash2 className="h-4 w-4" />
                    Borrar carga manual
                  </Button>
                )}
              </div>
            ) : null}
            {errorBorrar ? (
              <p className="mt-2 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
                {errorBorrar}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* De cuándo a cuándo salió la ruta. Reemplaza a la lista de las
            treinta entregas con su hora: con la ruta hecha de corrido, ese par
            es lo único que informa, y era la lista lo que hacía difícil ver el
            día de un vistazo.

            Un día cargado desde la oficina no tiene inicio —nadie sabe a qué
            hora empezó— y el bloque de arriba ya cuenta lo que se sabe de él. */}
        {jornada ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <Clock className="h-4 w-4 shrink-0" />
              Jornada
            </span>
            {jornada.cerrada_en == null ? (
              <span className="flex items-center gap-2">
                <Badge tone="amber">En curso</Badge>
                {jornada.inicio ? (
                  <span className="text-xs text-muted">
                    salió a las {formatTime(jornada.inicio)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="tabular-nums">
                {jornada.inicio ? formatTime(jornada.inicio) : "—"} a{" "}
                {formatTime(jornada.cerrada_en)}
              </span>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="h-4 w-4 shrink-0 text-muted" />
            {pago ? (
              <span>
                Pago del conductor:{" "}
                <span className="font-semibold tabular-nums">{formatCLP(pago.pago_total)}</span>
                <span className="block text-xs text-muted">
                  {formatCLP(pago.pago_dia)} por el día · {formatCLP(pago.pago_base)} por{" "}
                  {formatNumber(pago.pedidos_entregados)} pedido
                  {pago.pedidos_entregados === 1 ? "" : "s"}
                  {pago.pago_bono > 0 ? ` · ${formatCLP(pago.pago_bono)} de bono` : ""}
                </span>
                {/* Con qué tarifa se calculó ESTE día, que no tiene por qué ser
                    la que rige hoy: la regla se puede haber cambiado después y
                    los días ya registrados conservan la suya (0031). Sin esto,
                    el botón de al lado no se entiende. */}
                {pago.regla_valor_pedido != null ? (
                  <span className="block text-xs text-muted">
                    Calculado a {formatCLP(pago.regla_valor_pedido)} por entrega ·{" "}
                    {pago.regla_tipo_pago === "porcentaje"
                      ? `${pago.regla_valor_pago}% por pedido`
                      : `${formatCLP(Number(pago.regla_valor_pago ?? 0))} por pedido`}
                  </span>
                ) : null}
              </span>
            ) : (
              // Acá había un botón "Confirmar pago". No queda nada que
              // confirmar: la base escribe las cifras del día apenas se
              // registra (0031). Si igual no hay, es por una de dos razones
              // concretas, y conviene decir cuál.
              // Tres razones distintas para no tener cifras, y conviene decir
              // cuál: una ruta en curso no es un problema, las otras dos sí.
              <span className={enCursoJornada ? "text-muted" : "text-danger"}>
                {!choferId
                  ? "El conductor fue eliminado: este día no se puede liquidar."
                  : enCursoJornada
                    ? "La ruta sigue en curso. El pago se calcula cuando termine."
                    : "Sin regla de pago configurada: este día no se pudo calcular."}
              </span>
            )}
          </div>
          {/* Un día conserva su tarifa para siempre, así que corregir la regla
              no arregla un día que se calculó con una regla mal escrita. Esta
              es la única forma de moverlo, y es de a un día a propósito. */}
          {choferId && !enCursoJornada ? (
            <Button
              onClick={() => setRecalculando(true)}
              size="sm"
              variant="secondary"
              title="Vuelve a calcular este día con la regla actual o con otra tarifa."
            >
              Recalcular
            </Button>
          ) : null}
        </div>
      </CardBody>

      {recalculando && choferId ? (
        <DialogoRecalcular
          choferId={choferId}
          fecha={fecha}
          conteo={{ entregados, omitidos }}
          // Se edita a partir de la tarifa del propio día: se está corrigiendo
          // ESE día, no escribiendo uno nuevo. Sin cifras todavía, el punto de
          // partida es la regla.
          partida={tarifaDelDia(pago) ?? regla}
          regla={regla}
          onCerrar={() => setRecalculando(false)}
        />
      ) : null}
    </Card>
  );
}

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
function DialogoRecalcular({
  choferId,
  fecha,
  conteo,
  partida,
  regla,
  onCerrar,
}: {
  choferId: string;
  fecha: string;
  conteo: ConteoDia;
  partida: TarifaPago | null;
  regla: EncomiendaReglaPago | null;
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
          ? await repreciarDiaConTarifa(choferId, fecha, datos)
          : await repreciarDia(choferId, fecha);
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
