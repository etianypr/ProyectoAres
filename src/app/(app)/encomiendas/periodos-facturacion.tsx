"use client";

// Definir los cortes de facturación, en un diálogo sobre el propio gráfico: son
// fechas que se eligen MIRANDO los días que hubo reparto, y mandar a otra
// pantalla obligaría a memorizar dónde caía el corte.
//
// Un periodo es dos fechas y nada más (0034). No hay campo de nombre a
// propósito: el nombre son las fechas, y uno escrito a mano solo puede terminar
// diciendo algo distinto de ellas. Acá se muestra armado, debajo de los campos,
// para que se vea cómo va a quedar antes de guardar.
//
// El desplegable es lo que decide si se está creando o editando: "Nuevo
// periodo" inserta, cualquier otra opción mueve las fechas de ese.

import { useActionState, useState, useTransition } from "react";
import { CalendarRange, Save, Trash2 } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import {
  COLOR_PERIODO,
  nombrePeriodo,
  type PeriodoFacturacion,
} from "@/lib/encomiendas/periodos";
import {
  eliminarPeriodoFacturacion,
  guardarPeriodoFacturacion,
  type FormState,
} from "./actions";

const NUEVO = "";

export function PeriodosFacturacion({
  periodos,
  sugerenciaInicio,
}: {
  /** Todos los de la empresa, ordenados por fecha de inicio: el orden es el que
   *  fija el color de cada uno, así que tiene que ser el mismo que usa el
   *  panel para pintar las barras. */
  periodos: PeriodoFacturacion[];
  /** Con qué fecha arranca un periodo nuevo: el día siguiente al último corte,
   *  para que no queden huecos sin querer. */
  sugerenciaInicio: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button onClick={() => setAbierto(true)} variant="secondary" size="sm">
        <CalendarRange className="h-4 w-4" />
        Definir periodos
      </Button>

      {abierto ? (
        <Dialogo
          titulo="Periodos de facturación"
          descripcion="De qué fecha a qué fecha va cada corte. Los días de cada periodo quedan marcados con su color en el gráfico."
          ancho="xl"
          onCerrar={() => setAbierto(false)}
        >
          <Formulario
            periodos={periodos}
            sugerenciaInicio={sugerenciaInicio}
            onCerrar={() => setAbierto(false)}
          />
        </Dialogo>
      ) : null}
    </>
  );
}

function Formulario({
  periodos,
  sugerenciaInicio,
  onCerrar,
}: {
  periodos: PeriodoFacturacion[];
  sugerenciaInicio: string;
  onCerrar: () => void;
}) {
  const [seleccionado, setSeleccionado] = useState<string>(NUEVO);
  const [inicio, setInicio] = useState(sugerenciaInicio);
  const [fin, setFin] = useState("");
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [borrando, startBorrado] = useTransition();

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev: FormState, datos: FormData) => {
      const res = await guardarPeriodoFacturacion(prev, datos);
      if (res.ok) onCerrar();
      return res;
    },
    {},
  );

  const indice = periodos.findIndex((p) => p.id === seleccionado);
  const editando = indice >= 0;

  // Al cambiar de periodo, los campos pasan a mostrar SUS fechas. Sin esto se
  // seleccionaría un corte y se guardarían encima las fechas del anterior, que
  // es la forma más silenciosa de correr un periodo que ya estaba bien.
  function onSeleccionar(id: string) {
    setSeleccionado(id);
    setConfirmandoBorrado(false);
    setErrorBorrar(null);
    const p = periodos.find((x) => x.id === id);
    setInicio(p ? p.fecha_inicio : sugerenciaInicio);
    setFin(p ? p.fecha_fin : "");
  }

  function onBorrar() {
    if (!editando) return;
    setErrorBorrar(null);
    startBorrado(async () => {
      const res = await eliminarPeriodoFacturacion(seleccionado);
      if (res.error) setErrorBorrar(res.error);
      else onCerrar();
    });
  }

  // El nombre se arma solo, y solo cuando las dos fechas están puestas y en
  // orden: mostrar "31 al 1 de mayo" mientras se teclea confunde más de lo que
  // ayuda.
  const nombre =
    inicio && fin && fin >= inicio ? nombrePeriodo({ fecha_inicio: inicio, fecha_fin: fin }) : null;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {/* El id viaja escondido: es lo único que distingue crear de editar. */}
      <input type="hidden" name="id" value={editando ? seleccionado : ""} />

      <Field
        label="Periodo"
        htmlFor="periodo"
        className="sm:col-span-2"
        hint={
          periodos.length === 0
            ? "Todavía no hay ninguno definido."
            : "Elige uno para cambiarle las fechas, o deja “Nuevo periodo” para agregar otro."
        }
      >
        <Select
          id="periodo"
          value={seleccionado}
          onChange={(e) => onSeleccionar(e.target.value)}
        >
          <option value={NUEVO}>Nuevo periodo</option>
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>
              {nombrePeriodo(p)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Desde" htmlFor="fecha_inicio">
        <Input
          id="fecha_inicio"
          name="fecha_inicio"
          type="date"
          required
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
      </Field>

      <Field label="Hasta" htmlFor="fecha_fin" hint="Este día también entra en el periodo.">
        <Input
          id="fecha_fin"
          name="fecha_fin"
          type="date"
          required
          value={fin}
          min={inicio || undefined}
          onChange={(e) => setFin(e.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 text-sm sm:col-span-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          // Todos los periodos son de este color, se esté creando uno o editando
          // el del medio: es el mismo que tiene pintado el gráfico detrás.
          style={{ background: COLOR_PERIODO }}
          aria-hidden
        />
        {nombre ? (
          <span className="font-medium">{nombre}</span>
        ) : (
          <span className="text-muted">
            Pon las dos fechas y el periodo se llama solo, por su rango.
          </span>
        )}
      </div>

      {state.error ? (
        <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {errorBorrar ? (
        <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
          {errorBorrar}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        {/* Borrar solo tiene sentido sobre un periodo que existe, y va a la
            izquierda del todo para no quedar pegado a "Guardar". */}
        {editando ? (
          confirmandoBorrado ? (
            <div className="mr-auto flex flex-wrap items-center gap-2">
              <span className="text-xs text-danger">
                ¿Borrar este periodo? Los días no se tocan, solo dejan de estar agrupados.
              </span>
              <Button onClick={onBorrar} disabled={borrando} size="sm" variant="danger">
                {borrando ? "Borrando…" : "Sí, borrar"}
              </Button>
              <Button
                onClick={() => setConfirmandoBorrado(false)}
                disabled={borrando}
                size="sm"
                variant="outline"
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setConfirmandoBorrado(true)}
              className="mr-auto"
              size="sm"
              variant="dangerOutline"
            >
              <Trash2 className="h-4 w-4" />
              Borrar periodo
            </Button>
          )
        ) : null}

        <Button type="button" variant="outline" onClick={onCerrar} disabled={pending}>
          Cerrar
        </Button>
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : editando ? "Guardar cambios" : "Crear periodo"}
        </Button>
      </div>
    </form>
  );
}
