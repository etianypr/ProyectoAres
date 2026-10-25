import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/panel/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, UserRound } from "lucide-react";
import { ConductorAccordion } from "./conductor-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conductores" };

export default async function ConductoresPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("conductores").select("*").order("nombre");
  const conductores = data ?? [];

  return (
    <div>
      <PageHeader
        title="Conductores"
        description="Quiénes reparten, su licencia y su acceso a la app. Haz clic en uno para ver y editar."
      >
        <Link href="/conductores/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo conductor
        </Link>
      </PageHeader>

      {conductores.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <UserRound className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Aún no hay conductores registrados.</p>
          <Link href="/conductores/nuevo" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Agregar el primero
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <ConductorAccordion conductores={conductores} />
          </div>
        </Card>
      )}
    </div>
  );
}
