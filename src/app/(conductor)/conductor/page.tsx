import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirConductor } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Package, LogOut, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inicio — Conductor" };

// El hub del conductor. Hoy tiene una sola herramienta —la ruta de encomiendas—
// y aun así existe como pantalla propia por dos razones: es el único lugar donde
// el conductor puede cerrar sesión, y es donde aparece el aviso cuando su cuenta
// no está vinculada a ninguna ficha.
//
// En el sistema del que salió este proyecto la lista de herramientas se armaba
// desde las "categorías" del chofer (operación, taxis, encomiendas). Acá no hay
// categorías: quien tiene cuenta reparte. Si algún día hay una segunda
// herramienta, se agrega a HERRAMIENTAS y listo.
const HERRAMIENTAS = [
  {
    href: "/conductor/encomiendas",
    label: "Ruta de encomiendas",
    descripcion: "Tus entregas de hoy, en orden",
  },
];

export default async function ConductorInicioPage() {
  // El layout del grupo ya validó sesión + rol; acá se reusa el resultado
  // (sesionActual está memoizado con cache() dentro del mismo render).
  const sesion = await exigirConductor();
  const supabase = await createClient();

  const { data: chofer } = await supabase
    .from("choferes")
    .select("id, nombre")
    .eq("user_id", sesion.userId)
    .maybeSingle();

  if (!chofer) {
    // Con logout a la vista: sin él la pantalla es un callejón sin salida —
    // no hay nada que tocar y tampoco forma de entrar con otra cuenta.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-1.5 p-6 text-center">
        <p className="text-lg font-semibold">Cuenta sin vincular</p>
        <p className="max-w-xs text-sm text-muted">
          Tu usuario no está vinculado a ningún conductor. Pide a un administrador que
          lo configure en tu ficha.
        </p>
        <form action={logout} className="mt-5">
          <button
            type="submit"
            className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    );
  }

  return (
    // El padding de arriba respeta la muesca del iPhone: instalada como app,
    // la barra de estado queda por encima del contenido (ver el layout del
    // grupo, statusBarStyle "black-translucent").
    <div className="flex min-h-screen flex-col px-5 pb-6 pt-[max(1.75rem,env(safe-area-inset-top))]">
      <header className="mb-7">
        <p className="text-sm text-muted">Hola,</p>
        <h1 className="text-2xl font-semibold tracking-tight">{chofer.nombre.split(" ")[0]}</h1>
      </header>

      <div className="stagger-in space-y-2.5">
        {HERRAMIENTAS.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="flex items-center gap-3.5 rounded-2xl bg-card p-4 shadow-soft transition-transform active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Package className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-tight">{h.label}</span>
              <span className="block text-xs text-muted">{h.descripcion}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        ))}
      </div>

      <form action={logout} className="mt-auto pt-10">
        <button
          type="submit"
          className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
