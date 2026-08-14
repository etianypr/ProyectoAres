"use client";

// Lo que Starken liquidó DE VERDAD contra lo que el panel estimó.
//
// Vivía dentro del diálogo de reglas de pago, y son dos cosas distintas: la
// regla es cuánto se le paga al conductor, esto es cuánto entró. Se juntaban
// solo porque las dos se configuraban en la misma pantalla vieja.
//
// Sirven para lo mismo una sola vez: el número de abajo —a cuánto salió cada
// entrega según lo que llegó— es con el que se calibra el valor por entrega de
// la regla. Por eso ese dato se muestra acá y no allá: es la conclusión de esta
// comparación, no un ajuste.
//
// SE IMPUTA A UN PERIODO DE FACTURACIÓN, NO A UN MES (0035). La liquidación
// llega por corte y un corte puede cruzar dos meses: mientras esto iba por mes
// había que repartir a ojo una cifra que no se podía repartir, y el "por
// entrega" que salía de ahí —lo único que se usa para calibrar— venía torcido.
// Con el periodo elegido, el estimado y lo real hablan del mismo rango de días.

import { useActionState, useState, useTransition } from "react";
import { Scale, TrendingUp, Trash2 } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { formatCLP, formatNumber } from "@/lib/format";
import { nombrePeriodo, type ResumenPeriodo } from "@/lib/encomiendas/periodos";
import { eliminarIngresoReal, guardarIngresoReal, type FormState } from "./actions";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Una liquidación vieja, imputada a un mes antes de que existieran los
 *  periodos (0035). Se muestra de solo lectura: no se convierte a periodo
 *  porque no hay a cuál —un mes no es un corte— y adivinarle uno inventaría una
 *  correspondencia que nadie decidió. */
export type IngresoPorMes = {
  id: string;
  anio: number;
  mes: number;
  monto: number;
  nota: string | null;
};

export type IngresosDelPeriodo = {
  /** Todos los cortes definidos, con su estimado y lo real que tengan cargado. */
  periodos: ResumenPeriodo[];
  /** Cuál viene elegido al abrir: el último corte que toca el mes en pantalla. */
  periodoInicial: string;
  porMes: IngresoPorMes[];
  /** Si la tabla todavía no existe en la base (falta correr la 0029/0035). */
  error: string | null;
};

export function CompararIngresos({ ingresos }: { ingresos: IngresosDelPeriodo }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button onClick={() => setAbierto(true)} variant="secondary">
        <Scale className="h-4 w-4" />
        Comparar ingresos
      </Button>

      {abierto ? (
        <Dialogo
          titulo="Comparar ingresos"
          descripcion="Lo que estimó el panel contra lo que Starken liquidó de verdad, por periodo de facturación."
          ancho="2xl"
          onCerrar={() => setAbierto(false)}
        >
          <Comparacion ingresos={ingresos} />
        </Dialogo>
      ) : null}
    </>
  );
}

function Comparacion({ ingresos }: { ingresos: IngresosDelPeriodo }) {
  const [elegido, setElegido] = useState(
    ingresos.periodoInicial || ingresos.periodos.at(-1)?.id || "",
  );
  // A qué periodo corresponde el "Ingreso guardado" que se está mostrando. Sin
  // esto el aviso queda pegado al cambiar de corte y termina afirmando que se
  // guardó algo del periodo que se acaba de abrir, que puede estar vacío.
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev: FormState, datos: FormData) => {
      const res = await guardarIngresoReal(prev, datos);
      if (res.ok) setGuardadoEn(String(datos.get("periodo_id") ?? ""));
      return res;
    },
    {},
  );
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [borrando, startBorrado] = useTransition();

  const periodo = ingresos.periodos.find((p) => p.id === elegido) ?? null;
  const yaCargado = periodo?.real != null;

  const [monto, setMonto] = useState(periodo?.real != null ? String(periodo.real) : "");
  // Al cambiar de periodo hay que traer lo de ESE periodo, no dejar en el campo
  // lo que se estaba escribiendo para el anterior. Se ajusta durante el render y
  // no en un efecto: así el campo ya sale con el valor correcto en el mismo
  // dibujado en que cambia el periodo, sin un cuadro intermedio mostrando el
  // importe del que se acaba de dejar.
  const [enElCampo, setEnElCampo] = useState(elegido);
  if (enElCampo !== elegido) {
    setEnElCampo(elegido);
    setMonto(periodo?.real != null ? String(periodo.real) : "");
    setErrorBorrar(null);
  }

  const estimado = periodo?.ingresos ?? 0;
  const entregas = periodo?.entregados ?? 0;
  const real = periodo?.real ?? null;
  const diferencia = real != null ? real - estimado : 0;
  // Cuánto habría que poner en "valor por entrega" para que el estimado hubiera
  // dado justo. Es el número por el que se hace todo esto.
  const valorQueCuadraria = real != null && entregas > 0 ? Math.round(real / entregas) : null;

  function onBorrar() {
    if (!periodo) return;
    setErrorBorrar(null);
    startBorrado(async () => {
      const res = await eliminarIngresoReal(periodo.id);
      if (res.error) setErrorBorrar(res.error);
      else {
        setMonto("");
        setGuardadoEn(null);
      }
    });
  }

  // Sin ningún corte definido no hay a qué imputar la liquidación. Antes esto se
  // cargaba al mes en pantalla, así que siempre había un destino; ahora hay que
  // decir qué falta y dónde se hace.
  if (ingresos.periodos.length === 0) {
    return (
      <>
        <p className="rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-sm text-info">
          Todavía no hay ningún periodo de facturación definido, y lo que entra se imputa a un
          periodo. Define el primero con <strong>“Definir periodos”</strong>, en el gráfico de
          pedidos por día, y vuelve acá.
        </p>
        {ingresos.porMes.length > 0 ? <HistorialPorMes filas={ingresos.porMes} /> : null}
      </>
    );
  }

  return (
    <>
      {ingresos.error ? (
        <p className="mb-4 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn">
          Todavía no se puede guardar: falta correr la migración{" "}
          <code className="font-mono">0035</code> en Supabase. ({ingresos.error})
        </p>
      ) : null}

      <dl className="mb-4 grid gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-soft sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Estimado</dt>
          <dd className="font-semibold tabular-nums">{formatCLP(estimado)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Real</dt>
          <dd className="font-semibold tabular-nums text-ok">
            {real != null ? formatCLP(real) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Diferencia</dt>
          <dd
            className={`font-semibold tabular-nums ${
              real == null ? "text-muted" : diferencia >= 0 ? "text-ok" : "text-danger"
            }`}
          >
            {real != null
              ? `${diferencia >= 0 ? "+" : "−"}${formatCLP(Math.abs(diferencia))}`
              : "—"}
          </dd>
        </div>
      </dl>

      {valorQueCuadraria != null ? (
        <p className="mb-4 rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info">
          Con {formatNumber(entregas)} entrega{entregas === 1 ? "" : "s"} en el periodo, lo que
          entró da <strong>{formatCLP(valorQueCuadraria)} por entrega</strong>. Si la estimación te
          queda lejos seguido, ese es el número a poner en la regla de pago.
        </p>
      ) : null}

      {/* Un periodo sin días de reparto no tiene con qué comparar: el estimado
          es cero porque no hubo entregas, no porque la estimación falle. */}
      {periodo != null && periodo.dias === 0 ? (
        <p className="mb-4 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn">
          Este periodo no tiene ningún día con reparto registrado, así que el estimado es cero y no
          hay nada contra qué contrastar. Revisa las fechas del corte.
        </p>
      ) : null}

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="periodo_id" value={elegido} />

        <Field
          label="Periodo"
          htmlFor="periodo_elegido"
          hint={
            periodo
              ? `${formatNumber(periodo.dias)} día${periodo.dias === 1 ? "" : "s"} con reparto · ${formatNumber(periodo.entregados)} entregas`
              : undefined
          }
        >
          <Select
            id="periodo_elegido"
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
          >
            {ingresos.periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {nombrePeriodo(p)}
                {p.real != null ? " ✓" : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Lo que entró"
          htmlFor="monto"
          hint={yaCargado ? "Ya cargado: al guardar se reemplaza" : undefined}
        >
          <MoneyInput id="monto" name="monto" value={monto} onChange={setMonto} placeholder="0" />
        </Field>

        {/* A lo ancho de la caja: el periodo y el monto son dos campos cortos que
            entran uno al lado del otro, pero la nota es texto libre y quedaba
            embutida en media columna con un hueco vacío al lado. */}
        <Field
          label="Nota"
          htmlFor="nota"
          hint="Opcional — nº de liquidación, si es parcial…"
          className="sm:col-span-2"
        >
          <Textarea
            // Es un campo no controlado: sin la key se quedaría mostrando la
            // nota del periodo anterior al cambiar de periodo.
            key={elegido}
            id="nota"
            name="nota"
            rows={2}
            defaultValue={periodo?.notaReal ?? ""}
            placeholder="De dónde salió este número"
          />
        </Field>

        {/* Guardar contra el borde derecho, como en todos los formularios de
            encomiendas: es la esquina donde cae el pulgar y donde se lo busca.
            Los avisos se van al otro extremo con mr-auto para no correrlo. */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
          {state.error ? (
            <p className="mr-auto rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {errorBorrar ? (
            <p className="mr-auto rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
              {errorBorrar}
            </p>
          ) : null}
          {state.ok && guardadoEn === elegido && !errorBorrar ? (
            <p className="mr-auto text-sm text-ok">Ingreso guardado.</p>
          ) : null}

          {/* Borrar es lo que permite arreglar una liquidación cargada en el
              periodo equivocado, y es el paso previo obligado para poder borrar
              el periodo: la base no lo deja ir mientras tenga esto colgando. */}
          {yaCargado ? (
            <Button onClick={onBorrar} disabled={borrando} variant="dangerOutline">
              <Trash2 className="h-4 w-4" />
              {borrando ? "Borrando…" : "Borrar lo cargado"}
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            <TrendingUp className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar ingreso del periodo"}
          </Button>
        </div>
      </form>

      {ingresos.porMes.length > 0 ? <HistorialPorMes filas={ingresos.porMes} /> : null}
    </>
  );
}

/** Las liquidaciones que se cargaron por mes antes de que existieran los
 *  periodos. Van de solo lectura y aparte: siguen siendo plata que entró y
 *  esconderlas haría parecer que se perdieron, pero no se pueden contrastar con
 *  un corte porque no pertenecen a ninguno. */
function HistorialPorMes({ filas }: { filas: IngresoPorMes[] }) {
  return (
    <div className="mt-5 border-t border-divider pt-4">
      <p className="text-xs font-semibold text-muted">Cargados por mes, antes de los periodos</p>
      <ul className="mt-2 space-y-1">
        {filas.map((f) => (
          <li key={f.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="capitalize">
              {MESES[f.mes - 1]} {f.anio}
              {f.nota ? <span className="ml-2 text-xs text-muted">{f.nota}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums text-ok">{formatCLP(f.monto)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        No se contrastan con ningún corte: un mes no es un periodo de facturación. Quedan como
        historial.
      </p>
    </div>
  );
}
