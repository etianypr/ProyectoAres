import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { nuevoCorrelationId } from "@/lib/whatsapp/correlacion";
import { normalizarTelefono } from "@/lib/comun/telefono";
import { bloquesActivos } from "@/lib/encomiendas/config";
import { esFecha } from "@/lib/comun/fechas";
import { enviarAvisoDisponibilidad, enviarListaHorarios } from "@/lib/whatsapp/meta";
import type { EnvioOk, ErrorApi, PedidoEnvio } from "@/lib/encomiendas/contrato-whatsapp";

// POST /api/whatsapp/send — el teléfono pide que salga un aviso de WhatsApp.
//
// Es la única razón por la que un dato del receptor toca este servidor, así que
// vale detallar exactamente qué pasa con él:
//
//   1. El teléfono manda `nombre` y `telefono` en el cuerpo.
//   2. Se usan para armar la llamada a Meta, que los necesita para poder decir
//      "Ana, tu encomienda llega hoy" y para saber a qué número mandarlo.
//   3. NO SE GUARDAN. La fila que queda en la base lleva el conductor, el id
//      local del pedido, el día y un identificador aleatorio. Nada más.
//   4. Terminada la consulta, no quedan en ninguna parte del servidor: no se
//      escriben en un log ni en un mensaje de error.
//
// Lo que sí queda es la correlación (ver la migración 0003), que es lo que
// permite que la respuesta del receptor vuelva al teléfono correcto sin que el
// servidor sepa de quién era el pedido.
//
// ----------------------------------------------------------------------------
// DOS TIPOS DE ENVÍO
//
//   tipo: "aviso"     la plantilla con los tres botones. Sale cuando un pedido
//                     ubicado entra en una ruta (FR-007).
//   tipo: "horarios"  el mensaje de lista con los bloques. Solo después de que
//                     el receptor tocó "Indicar un horario", que es lo que abre
//                     la ventana de 24 h (ver docs/WHATSAPP.md, Diseño).

// Un aviso por llamada. No hace falta un tope explícito: la ruta trabaja sobre
// UN pedido, así que un bucle con un error del lado del teléfono se frena solo
// contra la comprobación de "ya se mandó" de más abajo.

/** El cuerpo crudo: los campos de PedidoEnvio, todavía sin validar. */
type Cuerpo = Partial<Record<keyof Extract<PedidoEnvio, { tipo: "aviso" }>, unknown>>;

/** UUID en cualquier versión: el id lo genera el teléfono (UUIDv7). Se valida la
 *  FORMA y no el contenido, porque la columna es `uuid` y un texto cualquiera
 *  haría fallar el insert con un error de Postgres en vez de un 400 claro. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

export async function POST(req: Request) {
  const conductor = await conductorDeLaApi();
  if (!conductor.ok) return conductor.respuesta;

  const cuerpo = (await req.json().catch(() => null)) as Cuerpo | null;
  if (!cuerpo) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });

  const pedidoId = typeof cuerpo.pedidoId === "string" ? cuerpo.pedidoId : "";
  const fecha = typeof cuerpo.fecha === "string" ? cuerpo.fecha : "";
  if (!UUID.test(pedidoId)) {
    return NextResponse.json({ error: "Falta el identificador del pedido." }, { status: 400 });
  }
  if (!esFecha(fecha)) {
    return NextResponse.json({ error: "Falta el día de trabajo." }, { status: 400 });
  }

  // El teléfono se normaliza ACÁ otra vez, aunque el formulario ya lo haya hecho.
  // No es desconfianza del cliente: es que este es el último punto antes de que
  // el mensaje salga, y un número mal formado manda el aviso a un desconocido.
  const telefono = normalizarTelefono(texto(cuerpo.telefono, 32));
  if (!telefono.ok) {
    return NextResponse.json({ error: telefono.motivo, reintentable: false }, { status: 400 });
  }
  if (!telefono.telefono.puedeWhatsapp) {
    return NextResponse.json(
      {
        error: "Ese número es un fijo: no le va a llegar el aviso. Hay que llamarlo.",
        reintentable: false,
      },
      { status: 422 },
    );
  }

  const supabase = await createClient();

  // ¿Ya hay una correlación de este pedido para hoy? RLS ya limita la consulta a
  // las del propio conductor, y el filtro explícito está igual: si algún día una
  // policy cambia, esta ruta no se convierte en la que filtra los pedidos de
  // otro.
  const { data: previa } = await supabase
    .from("encomienda_whatsapp_correlaciones")
    .select("correlation_id, estado, external_message_id")
    .eq("conductor_id", conductor.conductorId)
    .eq("pedido_id_local", pedidoId)
    .eq("fecha", fecha)
    .maybeSingle();

  // ------------------------------------------------------------------
  // La lista de horarios: necesita una correlación que ya exista
  // ------------------------------------------------------------------
  if (cuerpo.tipo === "horarios") {
    if (!previa) {
      return NextResponse.json(
        { error: "No hay un aviso previo para este pedido.", reintentable: false },
        { status: 409 },
      );
    }

    // Los que el jefe dejó activos (FR-010). Se leen en el momento del envío y
    // no se cachean: si desactivó un bloque hace un minuto, el receptor que está
    // por recibir la lista no tiene que verlo.
    //
    // Sin fila de empresa —instalación nueva— van los seis del documento
    // principal, que es lo que hace `bloquesActivos` con un null.
    const { data: empresa } = await supabase
      .from("empresa")
      .select("bloques_horarios_activos")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const r = await enviarListaHorarios({
      telefono: telefono.telefono.e164,
      correlationId: previa.correlation_id,
      bloques: bloquesActivos(empresa?.bloques_horarios_activos),
    });

    return r.ok
      ? NextResponse.json({
          ok: true,
          correlationId: previa.correlation_id,
          mensajeId: r.mensajeId,
        } satisfies EnvioOk)
      : NextResponse.json(
          { error: r.error, codigo: r.codigo, reintentable: r.reintentable } satisfies ErrorApi,
          { status: r.reintentable ? 502 : 422 },
        );
  }

  // ------------------------------------------------------------------
  // El aviso
  // ------------------------------------------------------------------

  // Ya se mandó y no falló: no se manda de nuevo. Al receptor le llegaría el
  // mismo mensaje dos veces, y el teléfono no tiene forma de saber que su
  // reintento no era necesario (pudo perder la respuesta anterior por falta de
  // señal). Se contesta como si hubiera funcionado, porque para el teléfono el
  // resultado es el mismo: el aviso está mandado.
  if (previa && previa.estado !== "fallido") {
    return NextResponse.json({
      ok: true,
      correlationId: previa.correlation_id,
      mensajeId: previa.external_message_id,
      yaEstaba: true,
    } satisfies EnvioOk);
  }

  const nombre = texto(cuerpo.nombre, 60);
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre del destinatario." }, { status: 400 });
  }
  const cuando = texto(cuerpo.cuando, 40) ?? "hoy";

  // Un reintento REUTILIZA el identificador anterior. Si se generara uno nuevo,
  // el primer mensaje —que pudo haber llegado igual, aunque Meta contestara
  // error— quedaría con un payload que ya no resuelve nada, y la respuesta del
  // receptor se perdería.
  const correlationId = previa?.correlation_id ?? nuevoCorrelationId();

  // La fila se crea ANTES de mandar el mensaje. El orden importa: si se creara
  // después, un webhook rapidísimo (Meta contesta el estado en menos de un
  // segundo) llegaría antes que la fila y no tendría con qué correlacionarse.
  const { error: errorInsert } = await supabase
    .from("encomienda_whatsapp_correlaciones")
    .upsert(
      {
        correlation_id: correlationId,
        conductor_id: conductor.conductorId,
        pedido_id_local: pedidoId,
        fecha,
        estado: "pendiente",
        expira_en: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      },
      { onConflict: "conductor_id,pedido_id_local,fecha" },
    );

  if (errorInsert) {
    return NextResponse.json(
      { error: "No se pudo registrar el envío. Reintentá.", reintentable: true },
      { status: 500 },
    );
  }

  const r = await enviarAvisoDisponibilidad({
    telefono: telefono.telefono.e164,
    nombre,
    correlationId,
    cuando,
  });

  if (!r.ok) {
    // Queda anotado como fallido para que el teléfono pueda mostrar el reintento
    // y contarlo. No se BORRA la fila: si el mensaje salió igual (Meta contestó
    // error después de haberlo aceptado), la respuesta del receptor todavía tiene
    // que poder resolverse.
    await supabase
      .from("encomienda_whatsapp_correlaciones")
      .update({ estado: "fallido" })
      .eq("correlation_id", correlationId);

    return NextResponse.json(
      { error: r.error, codigo: r.codigo, reintentable: r.reintentable } satisfies ErrorApi,
      { status: r.reintentable ? 502 : 422 },
    );
  }

  await supabase
    .from("encomienda_whatsapp_correlaciones")
    .update({ estado: "enviado", external_message_id: r.mensajeId })
    .eq("correlation_id", correlationId);

  return NextResponse.json({ ok: true, correlationId, mensajeId: r.mensajeId } satisfies EnvioOk);
}

/** Meta no llama acá y el navegador tampoco debería: la única forma de saber si
 *  un aviso salió es el estado local del pedido. */
export function GET() {
  return NextResponse.json({ error: "Método no permitido." }, { status: 405 });
}

// La ruta escribe en la base y llama a un servicio externo: nunca se puede
// prerenderizar ni cachear. Es el comportamiento por defecto de un POST, y queda
// declarado para que agregar un GET no lo cambie por accidente.
export const dynamic = "force-dynamic";
