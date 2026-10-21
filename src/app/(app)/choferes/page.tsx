import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, UserRound } from "lucide-react";
import { ChoferAccordion } from "./chofer-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conductores" };

export default async function ChoferesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("choferes").select("*").order("nombre");
  const choferes = data ?? [];

  return (
    <div>
      <PageHeader
        title="Conductores"
        description="Quiénes reparten, su licencia y su acceso a la app. Haz clic en uno para ver y editar."
      >
        <Link href="/choferes/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo conductor
        </Link>
      </PageHeader>

      {choferes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <UserRound className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Aún no hay conductores registrados.</p>
          <Link href="/choferes/nuevo" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Agregar el primero
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <ChoferAccordion choferes={choferes} />
          </div>
        </Card>
      )}
    </div>
  );
}
