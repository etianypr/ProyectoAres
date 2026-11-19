"use client";

// El diálogo para eliminar un conductor (sale de conductor-panel.tsx, spec 002 T041).

import { useActionState, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { eliminarConductor, desactivarConductor, tieneHistorialConductor } from "./actions";
import type { FormState } from "@/lib/comun/forms";

import { type Conductor } from "@/types/db";

// Diálogo al eliminar un conductor: distingue "ya no trabaja aquí" (se
// desactiva, se conserva todo) de "eliminar todo el registro" (borrado real,
// avisando antes si tiene días de reparto registrados).
export function EliminarConductorDialog({
  conductor,
  onClose,
}: {
  conductor: Conductor;
  onClose: () => void;
}) {
  const [historial, setHistorial] = useState<boolean | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [desactivarState, desactivarAction, desactivarPending] = useActionState<
    FormState,
    FormData
  >(desactivarConductor, {});
  const [eliminarState, eliminarActionState, eliminarPending] = useActionState<
    FormState,
    FormData
  >(eliminarConductor, {});

  useEffect(() => {
    let vivo = true;
    tieneHistorialConductor(conductor.id).then((tiene) => {
      if (vivo) setHistorial(tiene);
    });
    return () => {
      vivo = false;
    };
  }, [conductor.id]);

  useEffect(() => {
    if (desactivarState.ok) onClose();
  }, [desactivarState.ok, onClose]);

  // El diálogo de siempre (spec 043): portal, Escape y la página de atrás quieta
  // los pone Dialogo.
  return (
    <Dialogo
      titulo={`¿Qué quieres hacer con ${conductor.nombre}?`}
      descripcion={historial ? "Este conductor tiene días de reparto registrados." : undefined}
      ancho="md"
      onCerrar={onClose}
    >
      <div className="flex flex-col gap-2">
        <form action={desactivarAction}>
          <input type="hidden" name="id" value={conductor.id} />
          <button
            type="submit"
            disabled={desactivarPending}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-background disabled:opacity-50"
          >
            Ya no trabaja aquí
            <span className="block text-xs font-normal text-muted">
              Se marca como inactivo. Se conserva junto con su historial.
            </span>
          </button>
        </form>

        {!confirmarBorrado ? (
          <button
            type="button"
            onClick={() => setConfirmarBorrado(true)}
            className="w-full rounded-xl border border-danger/20 bg-card px-4 py-3 text-left text-sm font-medium text-danger hover:bg-danger-bg"
          >
            Eliminar todo el registro
            <span className="block text-xs font-normal text-danger/80">
              Borra al conductor del sistema. No se puede deshacer.
            </span>
          </button>
        ) : (
          <div className="rounded-xl border border-danger/20 bg-danger-bg p-3">
            <p className="text-sm text-danger">
              ¿Confirmas eliminar a {conductor.nombre} y todo su registro
              {historial
                ? "? Sus días de reparto y sus liquidaciones quedarán sin conductor asignado."
                : "?"}
            </p>
            <form action={eliminarActionState} className="mt-2">
              <input type="hidden" name="id" value={conductor.id} />
              <button
                type="submit"
                disabled={eliminarPending}
                className={buttonClass({ variant: "danger", size: "sm" })}
              >
                Sí, eliminar definitivamente
              </button>
            </form>
          </div>
        )}
      </div>

      {desactivarState.error ? (
        <p className="mt-3 text-sm text-danger">{desactivarState.error}</p>
      ) : null}
      {eliminarState.error ? (
        <p className="mt-3 text-sm text-danger">{eliminarState.error}</p>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className={buttonClass({ variant: "ghost", size: "sm", className: "mt-4 text-muted" })}
      >
        Cancelar
      </button>
    </Dialogo>
  );
}
