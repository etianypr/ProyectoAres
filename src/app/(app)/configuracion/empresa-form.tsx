"use client";

import { useActionState, useRef, useState } from "react";
import { guardarEmpresa, type FormState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { DireccionInput } from "@/components/ui/direccion-input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Upload, ImageIcon, CheckCircle2 } from "lucide-react";
import type { Empresa } from "@/types/db";

export function EmpresaForm({ empresa }: { empresa?: Empresa }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarEmpresa,
    {},
  );
  const [logoUrl, setLogoUrl] = useState<string>(empresa?.logo_url ?? "");
  // El único campo controlado del formulario: el de dirección ofrece
  // sugerencias mientras se escribe y necesita poder reescribir su propio valor
  // al elegir una. El resto viaja como FormData, igual que siempre.
  const [direccion, setDireccion] = useState(empresa?.direccion ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "No se pudo subir el logo.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {empresa ? <input type="hidden" name="id" value={empresa.id} /> : null}
      <input type="hidden" name="logo_url" value={logoUrl} />

      <Card>
        <CardHeader>
          <CardTitle>Datos de la empresa</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre comercial" htmlFor="nombre">
            <Input id="nombre" name="nombre" defaultValue={empresa?.nombre ?? "Transportes Pucarani"} required />
          </Field>
          <Field label="Razón social / representante" htmlFor="razon_social">
            <Input id="razon_social" name="razon_social" defaultValue={empresa?.razon_social ?? ""} />
          </Field>
          <Field label="RUT" htmlFor="rut">
            <Input id="rut" name="rut" defaultValue={empresa?.rut ?? ""} placeholder="12.345.678-9" />
          </Field>
          <Field label="Giro" htmlFor="giro">
            <Input id="giro" name="giro" defaultValue={empresa?.giro ?? ""} />
          </Field>
          {/* Con sugerencias: de acá sale el punto de partida de la ruta de
              reparto (ver generar-ruta.ts), así que si esta dirección no se
              puede ubicar en el mapa, el chofer arranca desde otro lado. */}
          <Field label="Dirección" htmlFor="direccion">
            <DireccionInput
              id="direccion"
              name="direccion"
              value={direccion}
              onChange={setDireccion}
              placeholder="Calle y número"
            />
          </Field>
          <Field label="Ciudad" htmlFor="ciudad">
            <Input id="ciudad" name="ciudad" defaultValue={empresa?.ciudad ?? ""} />
          </Field>
          <Field label="Teléfono" htmlFor="telefono">
            <Input id="telefono" name="telefono" defaultValue={empresa?.telefono ?? ""} />
          </Field>
          <Field label="Correo" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={empresa?.email ?? ""} />
          </Field>
          <Field
            label="Representante (autor por defecto)"
            htmlFor="representante"
            className="sm:col-span-2"
          >
            <Input id="representante" name="representante" defaultValue={empresa?.representante ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo y numeración</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 block text-sm font-medium">Logo</p>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-muted" />
                )}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogo}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Subiendo…" : "Subir logo"}
                </Button>
                {uploadError ? (
                  <p className="mt-1 text-xs text-danger">{uploadError}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted">PNG o JPG, fondo claro.</p>
                )}
              </div>
            </div>
          </div>

        </CardBody>
      </Card>

      {state.error ? (
        <p className="rounded-lg bg-danger-bg border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="flex items-center gap-2 rounded-lg bg-ok-bg border border-ok/20 px-3 py-2 text-sm text-ok">
          <CheckCircle2 className="h-4 w-4" />
          Cambios guardados.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || uploading}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}
