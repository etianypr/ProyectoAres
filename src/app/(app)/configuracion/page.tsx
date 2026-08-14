import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmpresaForm } from "./empresa-form";
import type { Empresa } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const res = await supabase
    .from("empresa")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const data = (res.data as Empresa) ?? null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configuración"
        description="Datos de la empresa: nombre, RUT, dirección y logo."
      />
      <EmpresaForm empresa={(data as Empresa) ?? undefined} />
    </div>
  );
}
