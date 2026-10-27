import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { conversacionValida } from "@/lib/geo/direccion-ia/contrato";
import { direccionIADisponible, pasoDireccionIA } from "@/lib/geo/direccion-ia/servidor";

// Una ida de la conversación con la IA que corrige una dirección (spec 018). Solo
// el conductor. La conversación (direcciones y lo que devolvieron los buscadores,
// sin nombres ni teléfonos) pasa en tránsito: no se guarda ni se registra.
//
//   401 sin sesión de conductor · 400 conversación inválida · 503 sin IA o la IA no respondió

export async function POST(request: Request) {
  const quien = await conductorDeLaApi();
  if (!quien.ok) return quien.respuesta;
  if (!direccionIADisponible()) return NextResponse.json({ error: "La IA no está configurada." }, { status: 503 });

  const cuerpo = (await request.json().catch(() => null)) as { mensajes?: unknown } | null;
  const mensajes = cuerpo?.mensajes;
  if (!conversacionValida(mensajes)) {
    return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });
  }

  try {
    return NextResponse.json(await pasoDireccionIA(mensajes));
  } catch {
    return NextResponse.json({ error: "La IA no respondió. Intenta de nuevo." }, { status: 503 });
  }
}
