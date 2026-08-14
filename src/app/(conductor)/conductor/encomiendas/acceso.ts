import { createClient } from "@/lib/supabase/server";
import { exigirConductor } from "@/lib/auth";

// Quién puede entrar a las pantallas de encomiendas. Vive aparte porque ahora
// son DOS páginas —preparar la jornada y hacer el reparto— y las dos tienen que
// comprobar exactamente lo mismo. Repetido en cada una, alcanzaba con olvidarse
// de una comprobación en una sola para dejar una puerta abierta.

export type Acceso =
  | { ok: true; chofer: { id: string; nombre: string } }
  | { ok: false; titulo: string; texto: string };

export async function accesoEncomiendas(): Promise<Acceso> {
  const sesion = await exigirConductor();
  const supabase = await createClient();

  const { data: chofer } = await supabase
    .from("choferes")
    .select("id, nombre")
    .eq("user_id", sesion.userId)
    .maybeSingle();

  if (!chofer) {
    return {
      ok: false,
      titulo: "Cuenta sin vincular",
      texto:
        "Tu usuario no está vinculado a ningún conductor. Pide a un administrador que lo configure en tu ficha.",
    };
  }

  // Acá terminaba una segunda comprobación: que el jefe le hubiera asignado la
  // categoría "encomiendas". Existía porque el sistema del que salió este
  // proyecto tenía tres líneas de trabajo y un chofer de taxis no debía poder
  // abrir el reparto tecleando la URL. Con un solo negocio no queda nadie a quien
  // distinguir: tener cuenta de conductor Y ficha vinculada ES la autorización.
  return { ok: true, chofer };
}
