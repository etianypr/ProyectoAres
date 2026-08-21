"use client";

// Qué bloques horarios se le ofrecen al receptor por WhatsApp (FR-010).
//
// Lo que el jefe elige acá es CUÁLES OFRECER, no cuáles inventar. Los seis
// tramos son constantes del código (BLOQUES_HORARIOS) por un motivo que conviene
// tener a mano antes de querer agregar un séptimo: los ids viajan dentro del
// payload de los botones de una plantilla aprobada por Meta, y esa plantilla
// tiene una cantidad fija de opciones. Un tramo nuevo inventado desde el panel
// llegaría a un receptor con un id que el webhook no reconoce, y su respuesta se
// perdería en silencio.
//
// Desactivar todos está permitido, y a propósito: es una decisión operativa
// válida ("esta semana no ofrecemos horario"). Lo que la app hace en ese caso es
// decírselo al conductor —el receptor solo puede confirmar o rechazar— en vez de
// mandarle a Meta una lista vacía que rechazaría con un error confuso.

import { useActionState } from "react";
import { Clock, Save } from "lucide-react";
import { BLOQUES_HORARIOS } from "@/lib/encomiendas/config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { guardarBloquesHorarios, type FormState } from "./actions";

export function BloquesHorariosForm({
  empresaId,
  activos,
}: {
  empresaId: string | null;
  /** Lo guardado. null = nunca se configuró, así que van los seis. */
  activos: string[] | null;
}) {
  const [estado, accion, enviando] = useActionState<FormState, FormData>(
    guardarBloquesHorarios,
    {},
  );

  // null significa "los seis" y no "ninguno": una empresa que nunca abrió esta
  // pantalla tiene que ofrecer los bloques del documento principal.
  const marcados = new Set(activos ?? BLOQUES_HORARIOS.map((b) => b.id));

  return (
    <form action={accion} className="mt-6 rounded-2xl bg-card p-5 shadow-soft">
      <input type="hidden" name="empresa_id" value={empresaId ?? ""} />

      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div>
          <h2 className="font-semibold leading-tight">Horarios que se le ofrecen al cliente</h2>
          <p className="mt-1 text-sm text-muted">
            Cuando el conductor incorpora una encomienda a su ruta, el cliente recibe un
            WhatsApp y puede elegir uno de estos bloques. Los que dejes sin marcar no se le
            ofrecen.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-1 sm:grid-cols-2">
        {BLOQUES_HORARIOS.map((bloque) => (
          <label
            key={bloque.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-background"
          >
            <Checkbox
              name="bloques"
              value={bloque.id}
              defaultChecked={marcados.has(bloque.id)}
            />
            <span className="text-sm font-medium tabular-nums">{bloque.etiqueta}</span>
          </label>
        ))}
      </div>

      {/* El caso de "ninguno" se explica acá y no se bloquea: es una decisión
          operativa válida, pero el jefe tiene que saber qué implica. */}
      <p className="mt-3 text-xs text-muted">
        Si no marcas ninguno, el cliente solo podrá responder si puede o no puede recibir la
        encomienda, sin indicar horario.
      </p>

      {estado.error ? (
        <p className="mt-3 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? (
        <p className="mt-3 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          Horarios guardados.
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={enviando}>
          <Save className="h-4 w-4" />
          {enviando ? "Guardando…" : "Guardar horarios"}
        </Button>
      </div>
    </form>
  );
}
