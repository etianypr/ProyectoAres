import { createClient } from "@/lib/supabase/server";
import { exigirConductor } from "@/lib/auth/sesion";
import { conductorDeUsuario } from "@/lib/auth/conductor-de-usuario";

// Quién puede entrar a las pantallas de encomiendas. Vive aparte porque ahora
// son DOS páginas —preparar el día y hacer el reparto— y las dos tienen que
// comprobar exactamente lo mismo. Repetido en cada una, alcanzaba con olvidarse
// de una comprobación en una sola para dejar una puerta abierta.

export type Acceso =
  | { ok: true; conductor: { id: string; nombre: string } }
  /** borrarLocal: el servidor confirmó que esta cuenta ya no reparte, así que el
   *  teléfono borra los datos de destinatarios (spec 007). */
  | { ok: false; titulo: string; texto: string; borrarLocal: boolean };

export async function accesoEncomiendas(): Promise<Acceso> {
  const sesion = await exigirConductor();
  const supabase = await createClient();

  const conductor = await conductorDeUsuario(supabase, sesion.userId);

  if (!conductor) {
    return {
      ok: false,
      titulo: "Cuenta sin vincular",
      texto:
        "Tu usuario no está vinculado a ningún conductor. Pide a un administrador que lo configure en tu ficha.",
      borrarLocal: true,
    };
  }
  if (!conductor.activo) {
    return {
      ok: false,
      titulo: "Cuenta desactivada",
      texto:
        "Tu cuenta de conductor está desactivada. Los pedidos se borraron de este teléfono. Si es un error, habla con la oficina.",
      borrarLocal: true,
    };
  }

  // Acá terminaba una segunda comprobación: que el jefe le hubiera asignado la
  // categoría "encomiendas". Existía porque el sistema del que salió este
  // proyecto tenía tres líneas de trabajo y un conductor de taxis no debía poder
  // abrir el reparto tecleando la URL. Con un solo negocio no queda nadie a quien
  // distinguir: tener cuenta de conductor Y ficha vinculada ES la autorización.
  return { ok: true, conductor: { id: conductor.id, nombre: conductor.nombre } };
}
