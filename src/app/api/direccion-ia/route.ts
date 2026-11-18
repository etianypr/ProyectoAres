import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { tiemposServidor } from "@/lib/comun/tiempos-servidor";
import { conversacionValida } from "@/lib/geo/direccion-ia/contrato";
import { direccionIADisponible, esLimiteDeTasa, pasoDireccionIA } from "@/lib/geo/direccion-ia/servidor";

// Una ida de la conversación con la IA que corrige una dirección (spec 018). Solo
// el conductor. La conversación (direcciones y lo que devolvieron los buscadores,
// sin nombres ni teléfonos) pasa en tránsito: no se guarda ni se registra.
//
//   401 sin sesión de conductor · 400 conversación inválida · 429 Anthropic limitó la tasa (el
//   teléfono sigue de a una, spec 038) · 503 sin IA o la IA no respondió
//
// El proxy no consulta la sesión aquí: la verifica conductorDeLaApi (spec 038). Server-Timing
// lleva solo cifras (auth, proveedor).

export async function POST(request: Request) {
  const tiempos = tiemposServidor();
  const quien = await tiempos.medir("auth", () => conductorDeLaApi());
  if (!quien.ok) return tiempos.con(quien.respuesta);
  if (!direccionIADisponible()) return tiempos.con(NextResponse.json({ error: "La IA no está configurada." }, { status: 503 }));

  const cuerpo = (await request.json().catch(() => null)) as { mensajes?: unknown } | null;
  const mensajes = cuerpo?.mensajes;
  if (!conversacionValida(mensajes)) {
    return tiempos.con(NextResponse.json({ error: "Conversación inválida." }, { status: 400 }));
  }

  try {
    return tiempos.con(NextResponse.json(await tiempos.medir("proveedor", () => pasoDireccionIA(mensajes))));
  } catch (e) {
    if (esLimiteDeTasa(e)) {
      return tiempos.con(NextResponse.json({ error: "La IA está ocupada. Intenta de nuevo en un momento." }, { status: 429 }));
    }
    return tiempos.con(NextResponse.json({ error: "La IA no respondió. Intenta de nuevo." }, { status: 503 }));
  }
}
