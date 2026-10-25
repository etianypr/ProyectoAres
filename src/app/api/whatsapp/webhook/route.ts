import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerPayloadBoton } from "@/lib/encomiendas/config";
import type { EstadoAviso } from "@/lib/encomiendas/catalogos";
import type { Aviso } from "@/types/db";

// Meta llama a este endpoint de dos formas:
// - GET: handshake de verificación al guardar la config en el dashboard de Meta.
// - POST: eventos reales (estado de mensajes, respuestas del receptor).
//
// ----------------------------------------------------------------------------
// ES LA ÚNICA RUTA SIN SESIÓN, Y POR ESO ES LA QUE MÁS DESCONFÍA
//
// Meta llama desde sus servidores, sin cookies: la puerta no puede ser la sesión
// del conductor (ver la excepción en lib/supabase/sesion-proxy.ts). Lo que la
// reemplaza es la FIRMA: Meta manda un HMAC-SHA256 del cuerpo crudo con el
// secreto de la app en `X-Hub-Signature-256`. Sin ese header válido no se procesa
// nada, porque si no, cualquiera que conozca la URL podría inventar respuestas
// de receptores y meterle confirmaciones falsas a la ruta del conductor.
//
// ----------------------------------------------------------------------------
// POR QUÉ SIEMPRE CONTESTA 200
//
// Meta reintenta un webhook al que no le llega un 200, y lo reintenta durante
// horas. Un evento que no se entiende —texto libre del receptor, un tipo nuevo,
// una plantilla vieja— se descarta y se contesta 200 igual: no hay nada que
// reintentar, el evento simplemente no nos servía. Devolver 500 ahí convierte un
// mensaje irrelevante en una tormenta de reintentos.
//
// Las únicas respuestas que no son 200 son las de firma inválida (403) y las de
// configuración faltante (500 de verdad: hay algo que arreglar en el servidor).
//
// ----------------------------------------------------------------------------
// QUÉ SE GUARDA DE LO QUE LLEGA
//
// El botón que tocó, el bloque horario si eligió uno, el identificador del
// mensaje y la hora. NO se guarda el número del receptor —que viene en el evento,
// en `messages[].from`— ni el texto que haya escrito. Es la misma regla que en el
// envío: esta base no custodia destinatarios (principio V, Ley 21.719).
//
// El webhook usa service_role porque no hay sesión de nadie a quien atribuirle la
// escritura. Es el único lugar del proyecto donde se justifica: la fila que
// escribe está acotada por el `correlation_id`, que solo puede conocer quien
// recibió el mensaje que lo llevaba.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verificación fallida" }, { status: 403 });
}

// ----------------------------------------------------------------------------
// Firma
// ----------------------------------------------------------------------------

/** Compara la firma de Meta contra el cuerpo CRUDO.
 *
 *  Tiene que ser el cuerpo tal como llegó, byte por byte, y no un JSON
 *  re-serializado: `JSON.stringify(JSON.parse(x))` reordena claves y cambia el
 *  escapado, así que el HMAC no coincidiría nunca y todos los eventos se
 *  descartarían en silencio. De ahí que el handler lea `req.text()` primero y
 *  parsee después.
 *
 *  La comparación es de tiempo constante. Con `===` el tiempo de respuesta
 *  filtra cuántos bytes del prefijo acertó quien esté probando, y eso alcanza
 *  para adivinar una firma byte a byte. */
function firmaValida(cuerpoCrudo: string, header: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  // Sin secreto configurado no se puede verificar nada, así que no se procesa
  // nada. Fallar cerrado y no abierto: un webhook sin verificar es una entrada
  // para que un tercero invente respuestas de receptores.
  if (!secreto || !header) return false;

  const esperado = "sha256=" + createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex");

  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  // timingSafeEqual lanza si los largos no coinciden, y el largo no es secreto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ----------------------------------------------------------------------------
// Formas de los eventos de Meta
// ----------------------------------------------------------------------------

type EstadoMeta = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
};

type MensajeMeta = {
  id?: string;
  timestamp?: string;
  type?: string;
  /** El mensaje al que está contestando: `id` es el wamid de nuestro aviso. */
  context?: { id?: string };
  /** Respuesta a un botón de PLANTILLA. */
  button?: { payload?: string; text?: string };
  /** Respuesta a un mensaje interactivo (la lista de horarios). */
  interactive?: {
    type?: string;
    button_reply?: { id?: string };
    list_reply?: { id?: string };
  };
};

type CuerpoWebhook = {
  entry?: {
    changes?: {
      field?: string;
      value?: { statuses?: EstadoMeta[]; messages?: MensajeMeta[] };
    }[];
  }[];
};

/** Traduce los estados de Meta a los nuestros. Los de Meta describen el MENSAJE
 *  y nunca la entrega física — un 'failed' quiere decir que WhatsApp no lo pudo
 *  dejar, no que el receptor haya rechazado el pedido (regla explícita del
 *  contrato). */
const ESTADOS: Record<string, EstadoAviso> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

/** De dónde sale el payload según el tipo de respuesta. Los dos caminos usan el
 *  mismo formato de payload, así que los lee el mismo codec. */
function payloadDe(m: MensajeMeta): string | null {
  if (m.button?.payload) return m.button.payload;
  const i = m.interactive;
  return i?.list_reply?.id ?? i?.button_reply?.id ?? null;
}

/** La hora del evento. Meta la manda en segundos Unix como texto. */
function horaDe(timestamp: string | undefined): string {
  const segundos = Number(timestamp);
  return Number.isFinite(segundos) && segundos > 0
    ? new Date(segundos * 1000).toISOString()
    : new Date().toISOString();
}

export async function POST(req: Request) {
  // Crudo primero: la firma se calcula sobre estos bytes exactos.
  const crudo = await req.text();

  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"))) {
    // Sin decir qué falló y sin registrar el cuerpo: si alguien está probando,
    // no se le devuelve información, y si el cuerpo era legítimo, no queda un
    // dato de receptor escrito en un log.
    return NextResponse.json({ error: "Firma inválida" }, { status: 403 });
  }

  let cuerpo: CuerpoWebhook;
  try {
    cuerpo = JSON.parse(crudo) as CuerpoWebhook;
  } catch {
    // Firmado por Meta pero no es JSON. No hay nada que reintentar.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const cambios = (cuerpo.entry ?? []).flatMap((e) => e.changes ?? []);
  // Meta manda por el mismo webhook eventos que no son de mensajes (aprobación
  // de plantillas, calidad del número). Se ignoran sin ruido.
  const deMensajes = cambios.filter((c) => c.field === "messages");
  if (deMensajes.length === 0) return NextResponse.json({ received: true }, { status: 200 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    // Falta la service_role. Esto SÍ es un 500: hay algo que arreglar en el
    // servidor, y conviene que Meta reintente cuando esté arreglado.
    return NextResponse.json({ error: "Servidor sin configurar" }, { status: 500 });
  }

  for (const cambio of deMensajes) {
    for (const estado of cambio.value?.statuses ?? []) {
      await procesarEstado(supabase, estado);
    }
    for (const mensaje of cambio.value?.messages ?? []) {
      await procesarRespuesta(supabase, mensaje);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

type Cliente = ReturnType<typeof createAdminClient>;

/** Un estado del mensaje. No toca la disponibilidad: eso solo lo cambia una
 *  respuesta del receptor. */
async function procesarEstado(supabase: Cliente, estado: EstadoMeta) {
  const wamid = estado.id;
  const nuevo = estado.status ? ESTADOS[estado.status] : undefined;
  if (!wamid || !nuevo) return;

  // Se busca por el wamid del aviso que mandamos. Si no hay correlación, el
  // estado es de un mensaje que ya se limpió (día cerrado) y no hay nada que
  // anotar.
  //
  // El update NO puede pisar 'respondido': un 'delivered' que llega tarde
  // —Meta no garantiza el orden— haría retroceder el estado de un pedido que ya
  // contestó. Se excluye con el filtro, no con un if después de leer, para que
  // dos eventos en paralelo no puedan colarse entre la lectura y la escritura.
  await supabase
    .from("encomienda_whatsapp_correlaciones")
    .update({ estado: nuevo })
    .eq("external_message_id", wamid)
    .neq("estado", "respondido");
}

/** Una respuesta del receptor. */
async function procesarRespuesta(supabase: Cliente, mensaje: MensajeMeta) {
  const wamidRespuesta = mensaje.id;
  if (!wamidRespuesta) return;

  const payload = leerPayloadBoton(payloadDe(mensaje));

  // Texto libre, un audio, una imagen: el producto decidió no depender de
  // mensajes libres (ver el contrato), así que no se interpreta y no se guarda
  // NADA de su contenido. Se descarta y punto.
  if (!payload) return;

  const recibidoEn = horaDe(mensaje.timestamp);

  // El insert de la respuesta se hace con un UPDATE condicionado, y ahí está la
  // idempotencia: el filtro `respuesta_mensaje_id is null` significa "solo si
  // todavía no tiene respuesta". Meta reintenta el mismo evento cuando no recibe
  // el 200 a tiempo, y dos reintentos en paralelo no pueden pasar los dos: el
  // segundo no encuentra ninguna fila que cumpla la condición.
  //
  // Además el índice único de `respuesta_mensaje_id` (migración 0003) frena el
  // caso en que el mismo wamid llegue asociado a otra correlación.
  const campos = {
    respuesta_accion: payload.accion,
    respuesta_bloque_id: payload.bloqueHorarioId,
    respuesta_mensaje_id: wamidRespuesta,
    respuesta_recibida_en: recibidoEn,
    estado: "respondido",
  } satisfies Partial<Aviso>;

  const { data } = await supabase
    .from("encomienda_whatsapp_correlaciones")
    .update(campos)
    .eq("correlation_id", payload.correlationId)
    .is("respuesta_mensaje_id", null)
    .select("correlation_id");

  if (data?.length) return;

  // No entró por correlation_id. Dos motivos posibles, y hay que distinguirlos:
  //
  //  · ya tenía respuesta → es un reintento de Meta o el receptor tocó dos
  //    veces. Correcto que no haga nada.
  //  · la correlación no existe → el payload es de una plantilla vieja, o la
  //    día ya se cerró y la fila se limpió. Se intenta la segunda vía: el
  //    wamid del mensaje al que está contestando, que Meta manda en `context`.
  const contexto = mensaje.context?.id;
  if (!contexto) return;

  await supabase
    .from("encomienda_whatsapp_correlaciones")
    .update(campos)
    .eq("external_message_id", contexto)
    .is("respuesta_mensaje_id", null);
}

// Nunca prerenderizable: valida una firma sobre el cuerpo de cada request.
export const dynamic = "force-dynamic";
