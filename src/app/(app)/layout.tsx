import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/panel/app-shell";
import { exigirPanel } from "@/lib/auth/sesion";
import { getPeriodo } from "@/lib/comun/periodo-servidor";
import { construirAlertas } from "@/lib/conductores/vencimientos";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Slot paralelo: rutas interceptadas de creación (ver src/app/(app)/@modal).
  modal: React.ReactNode;
}) {
  // Puerta del panel: sin sesión → login; con rol conductor → su app (/conductor).
  // Va ANTES de cualquier consulta: al conductor, RLS le negaría igual la lista de
  // conductores, y no tiene sentido pagar ese viaje para después redirigirlo.
  const sesion = await exigirPanel();

  const periodo = await getPeriodo();
  const supabase = await createClient();

  const [{ data: empresa }, { data: conductores }] = await Promise.all([
    supabase.from("empresa").select("nombre").limit(1).maybeSingle(),
    supabase.from("conductores").select("*"),
  ]);

  return (
    <AppShell
      userEmail={sesion.email}
      empresaNombre={empresa?.nombre ?? "Encomiendas"}
      periodoAnio={periodo.anio}
      periodoMes={periodo.mes}
      alertas={construirAlertas(conductores ?? [])}
    >
      {children}
      {modal}
    </AppShell>
  );
}
