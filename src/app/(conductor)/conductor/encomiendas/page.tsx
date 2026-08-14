import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/format";
import { accesoEncomiendas } from "./acceso";
import { PantallaEncomiendas } from "./pantalla";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ruta del día" };

// Esta página quedó reducida a lo que SOLO el servidor puede hacer: comprobar
// quién es el chofer y de dónde sale la ruta. Los pedidos y la ruta ya no se
// bajan de la base —viven en el teléfono, ver lib/encomiendas/local— así que de
// ahí en adelante manda PantallaEncomiendas, en el navegador.
//
// Ya no acepta ?fecha=: la app del chofer trabaja el día en curso y de los
// anteriores solo muestra el resumen del último. Un chofer no vuelve a repartir
// un día pasado, y el historial completo lo mira la oficina en el panel.

// Siempre con la vuelta al hub: estas pantallas no tienen nada que tocar, y sin
// el link el chofer queda encerrado en una URL que se sabe de memoria.
function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="p-6 text-center">
      <p className="text-lg font-semibold">{titulo}</p>
      <p className="mx-auto max-w-xs text-sm text-muted">{texto}</p>
      <Link href="/conductor" className="mt-4 inline-block text-sm text-brand hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}

export default async function EncomiendasConductorPage() {
  const acceso = await accesoEncomiendas();
  if (!acceso.ok) return <Mensaje titulo={acceso.titulo} texto={acceso.texto} />;

  // Punto de partida por defecto de la ruta. Es un dato de la EMPRESA, no de un
  // destinatario, así que sigue viviendo en la base sin problema (ver la
  // cabecera de la migración 0026 para qué es lo que sí se sacó de ahí).
  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("empresa")
    .select("direccion, ciudad")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const direccionEmpresa =
    [empresa?.direccion, empresa?.ciudad].filter(Boolean).join(", ") || null;

  return (
    <PantallaEncomiendas
      choferId={acceso.chofer.id}
      nombreChofer={acceso.chofer.nombre}
      fecha={hoyChile()}
      direccionEmpresa={direccionEmpresa}
    />
  );
}
