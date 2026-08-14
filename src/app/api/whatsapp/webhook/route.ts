import { NextResponse } from "next/server";

// Meta llama a este endpoint de dos formas:
// - GET: handshake de verificación al guardar la config en el dashboard de Meta.
// - POST: eventos reales (estado de mensajes, mensajes entrantes, etc).

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

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await req.json().catch(() => null);
  // TODO: cuando se conecte el envío de notificaciones, procesar aquí
  // body.entry[].changes[].value.statuses (delivered/read/failed) y
  // .messages (respuestas entrantes del cliente).
  console.log("whatsapp webhook:", JSON.stringify(body));
  return NextResponse.json({ received: true }, { status: 200 });
}
