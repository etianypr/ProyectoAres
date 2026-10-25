import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/comun/fechas";
import { whatsappActivo } from "@/lib/whatsapp/meta";
import { lecturaIADisponible } from "@/lib/encomiendas/lectura/servidor";
import { accesoEncomiendas } from "./acceso";
import { BorradoLocal } from "../../borrado-local";
import { PantallaEncomiendas } from "./pantalla";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ruta del día" };

// Esta página quedó reducida a lo que SOLO el servidor puede hacer: comprobar
// quién es el conductor y de dónde sale la ruta. Los pedidos y la ruta ya no se
// bajan de la base —viven en el teléfono, ver lib/encomiendas/local— así que de
// ahí en adelante manda PantallaEncomiendas, en el navegador.
//
// Ya no acepta ?fecha=: la app del conductor trabaja el día en curso y de los
// anteriores solo muestra el resumen del último. Un conductor no vuelve a repartir
// un día pasado, y el historial completo lo mira la oficina en el panel.

// Siempre con la vuelta al hub: estas pantallas no tienen nada que tocar, y sin
// el link el conductor queda encerrado en una URL que se sabe de memoria.
function Mensaje({ titulo, texto, borrarLocal }: { titulo: string; texto: string; borrarLocal: boolean }) {
  return (
    <div className="p-6 text-center">
      {borrarLocal ? <BorradoLocal /> : null}
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
  if (!acceso.ok) return <Mensaje titulo={acceso.titulo} texto={acceso.texto} borrarLocal={acceso.borrarLocal} />;

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
  // La meta del bono, si la regla de pago tiene una (spec 006, US4).
  const { data: metaBono } = await supabase.rpc("encomienda_meta_entregas_dia");

  return (
    <PantallaEncomiendas
      conductorId={acceso.conductor.id}
      nombreConductor={acceso.conductor.nombre}
      fecha={hoyChile()}
      direccionEmpresa={direccionEmpresa}
      whatsapp={whatsappActivo()}
      lecturaIA={lecturaIADisponible()}
      apkMinima={process.env.APK_VERSION_MINIMA ?? null}
      apkUrl={process.env.APK_URL ?? null}
      metaBono={typeof metaBono === "number" && metaBono > 0 ? metaBono : null}
    />
  );
}
