"use client";

// El diálogo para eliminar un conductor (sale de conductor-panel.tsx, spec 002 T041).

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Eliminar ${conductor.nombre}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-md rounded-[18px] bg-white p-5 shadow-card"
      >
        <p className="text-base font-semibold">¿Qué quieres hacer con {conductor.nombre}?</p>
        {historial ? (
          <p className="mt-1.5 text-sm text-warn">
            Este conductor tiene días de reparto registrados.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <form action={desactivarAction}>
            <input type="hidden" name="id" value={conductor.id} />
            <button
              type="submit"
              disabled={desactivarPending}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-background disabled:opacity-50"
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
              className="w-full rounded-xl border border-danger/20 bg-white px-4 py-3 text-left text-sm font-medium text-danger hover:bg-danger-bg"
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
                  className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-[#a32a21] disabled:opacity-50"
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
          className="mt-4 text-sm text-muted hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}
