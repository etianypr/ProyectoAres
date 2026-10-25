import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import {
  MAX_RESPUESTAS_POR_CONSULTA,
  type BuzonRespuestas,
  type ConfirmacionOk,
  type ConfirmarAplicadas,
} from "@/lib/encomiendas/contrato-whatsapp";

// El buzón de respuestas del conductor.
//
//   GET  → qué contestaron sus receptores y todavía no aplicó en el teléfono.
//   POST → "ya las escribí en IndexedDB, borralas".
//
// ----------------------------------------------------------------------------
// POR QUÉ EL TELÉFONO VIENE A BUSCAR EN VEZ DE QUE EL SERVIDOR LE AVISE
//
// Porque el conductor reparte en la periferia de Arica, donde el caso común no
// es quedarse sin red sino tener red que no llega a ningún lado. Una respuesta
// empujada por Web Push o por Realtime mientras el teléfono no está escuchando
// se pierde, y el receptor no la va a repetir. Entonces el servidor tiene que
// poder ACUMULAR las respuestas hasta que el teléfono aparezca — y en cuanto
// existe ese buzón, venir a buscarlo alcanza. Ver la Decisión 7 de
// docs/WHATSAPP.md (Diseño).
//
// ----------------------------------------------------------------------------
// POR QUÉ CONFIRMAR ES UN PASO APARTE
//
// El GET podría marcar las respuestas como entregadas y ahorrarse el POST. No lo
// hace: si el teléfono se queda sin batería entre recibir la respuesta y
// escribirla en IndexedDB, esa respuesta quedaría marcada como aplicada y no
// volvería a bajar nunca. El receptor habría confirmado y el conductor no se
// enteraría jamás.
//
// Es el mismo orden que ya tiene la cola de actividad (ver quitarDeCola en
// lib/encomiendas/local/almacen/cola.ts): primero el dato queda firme donde lo va a
// usar el conductor, y recién después se avisa que se puede olvidar.
//
// ----------------------------------------------------------------------------
// QUÉ SALE DE ACÁ
//
// Solo "a este pedido tuyo le contestaron esto": el id local del pedido, qué
// botón tocó, el bloque si eligió uno, y cuándo. Ni el número del receptor ni su
// nombre, porque el servidor no los tiene guardados (ver la migración 0003). Y
// solo del `conductor_id` de quien pregunta: lo filtra esta ruta y lo vuelve a
// exigir RLS.

export async function GET() {
  const conductor = await conductorDeLaApi();
  if (!conductor.ok) return conductor.respuesta;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("encomienda_whatsapp_correlaciones")
    .select("pedido_id_local, respuesta_accion, respuesta_bloque_id, respuesta_mensaje_id, respuesta_recibida_en")
    .eq("conductor_id", conductor.conductorId)
    // Solo las que YA tienen respuesta y el teléfono todavía no confirmó.
    .not("respuesta_mensaje_id", "is", null)
    .is("aplicada_en", null)
    // Más viejas primero: si el receptor contestó dos veces, la última tiene que
    // aplicarse última y quedar como la vigente.
    .order("respuesta_recibida_en", { ascending: true })
    .limit(MAX_RESPUESTAS_POR_CONSULTA);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron leer las respuestas. Reintentá." },
      { status: 500 },
    );
  }

  // Los nombres se traducen al vocabulario del dominio local acá, y no en el
  // teléfono: así la forma de las columnas de la base no se filtra al cliente y
  // cambiar una no obliga a tocar el IndexedDB.
  const respuestas = (data ?? []).map((r) => ({
    pedidoId: r.pedido_id_local,
    mensajeId: r.respuesta_mensaje_id,
    accion: r.respuesta_accion,
    bloqueHorarioId: r.respuesta_bloque_id,
    recibidoEn: r.respuesta_recibida_en,
  }));

  return NextResponse.json({ respuestas } satisfies BuzonRespuestas);
}

/** El cuerpo crudo de ConfirmarAplicadas, todavía sin validar. */
type CuerpoConfirmar = Partial<Record<keyof ConfirmarAplicadas, unknown>>;

export async function POST(req: Request) {
  const conductor = await conductorDeLaApi();
  if (!conductor.ok) return conductor.respuesta;

  const cuerpo = (await req.json().catch(() => null)) as CuerpoConfirmar | null;
  const ids = Array.isArray(cuerpo?.aplicadas)
    ? cuerpo.aplicadas.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No hay nada que confirmar." }, { status: 400 });
  }
  if (ids.length > MAX_RESPUESTAS_POR_CONSULTA) {
    return NextResponse.json({ error: "Demasiadas respuestas en una llamada." }, { status: 400 });
  }

  const supabase = await createClient();

  // El filtro por conductor_id está además de RLS, no en su lugar: es lo que hace
  // que un id de mensaje adivinado no pueda confirmar (y por lo tanto ocultarle)
  // la respuesta de otro conductor.
  const { data, error } = await supabase
    .from("encomienda_whatsapp_correlaciones")
    .update({ aplicada_en: new Date().toISOString() })
    .eq("conductor_id", conductor.conductorId)
    .in("respuesta_mensaje_id", ids)
    .select("respuesta_mensaje_id");

  if (error) {
    // El teléfono ya escribió en IndexedDB; que la confirmación falle solo
    // significa que la respuesta va a volver a bajar, y aplicarla otra vez no
    // cambia nada (es idempotente por mensajeId). Así que esto no es grave.
    return NextResponse.json(
      { error: "No se pudo confirmar. Se vuelve a intentar solo." },
      { status: 500 },
    );
  }

  // Confirmadas es lo que va a borrar el barrido; se pueden borrar ya mismo.
  // Hacerlo acá y no esperar la hora del cron es la mitad de la retención que el
  // producto promete: la fila deja de existir en cuanto no hace falta.
  await supabase
    .from("encomienda_whatsapp_correlaciones")
    .delete()
    .eq("conductor_id", conductor.conductorId)
    .in("respuesta_mensaje_id", ids);

  return NextResponse.json({ confirmadas: data?.length ?? 0 } satisfies ConfirmacionOk);
}

// Lee la sesión del conductor y consulta la base: no hay nada que prerenderizar.
export const dynamic = "force-dynamic";
