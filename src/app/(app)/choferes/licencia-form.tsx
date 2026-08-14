"use client";

import { useActionState, useRef } from "react";
import { actualizarLicencia, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Check, Loader2 } from "lucide-react";
import { toInputDate } from "@/lib/format";
import type { Chofer } from "@/types/db";

export function LicenciaForm({ chofer }: { chofer: Chofer }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    actualizarLicencia,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onBlur={onBlurForm}
      className="flex h-full flex-col gap-3"
    >
      <input type="hidden" name="id" value={chofer.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Clases</label>
          <Input name="licencia_clase" defaultValue={chofer.licencia_clase ?? ""} placeholder="B, C" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">N° de licencia</label>
          <Input name="licencia_numero" defaultValue={chofer.licencia_numero ?? ""} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Vence</label>
          <Input
            type="date"
            name="licencia_vencimiento"
            defaultValue={
              chofer.licencia_vencimiento ? toInputDate(chofer.licencia_vencimiento) : ""
            }
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <span className="mt-auto flex h-4 items-center gap-1.5 text-xs text-muted">
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando licencia…
          </>
        ) : state.ok ? (
          <>
            <Check className="h-3.5 w-3.5 text-ok" />
            Licencia guardada
          </>
        ) : (
          ""
        )}
      </span>
    </form>
  );
}
