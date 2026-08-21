import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmpresaForm } from "./empresa-form";
import { BloquesHorariosForm } from "./bloques-horarios-form";
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
        description="Datos de la empresa y horarios que se le ofrecen al cliente."
      />
      <EmpresaForm empresa={(data as Empresa) ?? undefined} />
      <BloquesHorariosForm
        empresaId={data?.id ?? null}
        activos={data?.bloques_horarios_activos ?? null}
      />
    </div>
  );
}
