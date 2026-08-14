"use client";

import { useActionState } from "react";
import Link from "next/link";
import { guardarChofer, type FormState } from "./actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Save } from "lucide-react";
import type { Chofer } from "@/types/db";

export function ChoferForm({
  chofer,
  inline = false,
}: {
  chofer?: Chofer;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarChofer,
    {},
  );

  const fields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" htmlFor="nombre" className="sm:col-span-2">
        <Input id="nombre" name="nombre" defaultValue={chofer?.nombre ?? ""} required />
      </Field>
      <Field label="RUT" htmlFor="rut">
        <Input id="rut" name="rut" defaultValue={chofer?.rut ?? ""} />
      </Field>
      <Field label="Teléfono" htmlFor="telefono">
        <Input id="telefono" name="telefono" defaultValue={chofer?.telefono ?? ""} />
      </Field>
      <label className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          name="activo"
          defaultChecked={chofer?.activo ?? true}
        />
        <span className="text-sm font-medium">Chofer activo</span>
      </label>
      <Field label="Notas" htmlFor="notas" className="sm:col-span-2">
        <Textarea id="notas" name="notas" defaultValue={chofer?.notas ?? ""} />
      </Field>
      {state.error ? (
        <p className="sm:col-span-2 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );

  return (
    <form action={formAction}>
      {chofer ? <input type="hidden" name="id" value={chofer.id} /> : null}
      {inline ? (
        fields
      ) : (
        <Card>
          <CardBody>{fields}</CardBody>
        </Card>
      )}
      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {!inline ? (
          <Link href="/choferes" className={buttonClass({ variant: "outline" })}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
