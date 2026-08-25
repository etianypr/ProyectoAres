import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirConductor } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inicio — Conductor" };

// Acá había un hub: un menú con una sola tarjeta, "Ruta de encomiendas", que
// había que tocar para entrar. Se fue.
//
// Un menú de un ítem no es un menú, es un peaje: el chofer abre la app parado
// al lado del vehículo y lo único que quiere es su ruta. Lo que el hub sí
// guardaba —quién tiene la sesión abierta y cómo cerrarla— se mudó al menú
// lateral de la propia pantalla de reparto (ver components/encomiendas/
// menu-lateral.tsx), que además muestra los días.
//
// Lo que queda acá es lo que no se puede mudar: el aviso de cuenta sin
// vincular. Esa cuenta no tiene ninguna ruta a la que mandarla, así que esta
// página sigue existiendo y para ella no hay redirección.
//
// El reenvío se hace en el servidor y no con un link automático en el cliente
// para que no haya un cuadro intermedio: el navegador nunca llega a dibujar
// esta página. Lo que se ve mientras tanto es (conductor)/loading.tsx.
export default async function ConductorInicioPage() {
  // El layout del grupo ya validó sesión + rol; acá se reusa el resultado
  // (sesionActual está memoizado con cache() dentro del mismo render).
  const sesion = await exigirConductor();
  const supabase = await createClient();

  const { data: chofer } = await supabase
    .from("choferes")
    .select("id")
    .eq("user_id", sesion.userId)
    .maybeSingle();

  // Derecho al reparto. La ficha se vuelve a comprobar del otro lado (ver
  // acceso.ts): es la misma consulta, y hacerla también acá evita mandar a una
  // pantalla que solo podría rebotarlo de vuelta.
  if (chofer) redirect("/conductor/encomiendas");

  // Con logout a la vista: sin él la pantalla es un callejón sin salida — no hay
  // nada que tocar y tampoco forma de entrar con otra cuenta.
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
