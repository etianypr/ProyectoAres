import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { tiemposServidor } from "@/lib/comun/tiempos-servidor";
import { loteValido } from "@/lib/geo/direccion-ia/contrato";
import { direccionIADisponible, esLimiteDeTasa, pasoLoteIA } from "@/lib/geo/direccion-ia/servidor";

// Un lote de direcciones para que la IA las corrija de una vez (spec 040; antes una ida por
// dirección, spec 018). Solo el conductor. El lote (direcciones escritas, lo que devolvieron los
// buscadores y la zona del día en sectores; sin nombres ni teléfonos) pasa en tránsito: no se
// guarda ni se registra.
//
//   401 sin sesión de conductor · 400 lote inválido · 429 Anthropic limitó la tasa (el teléfono
//   reintenta una vez, spec 038) · 503 sin IA o la IA no respondió
//
// El proxy no consulta la sesión aquí: la verifica conductorDeLaApi (spec 038). Server-Timing
// lleva solo cifras (auth, proveedor).

/** Un lote de 15 tarda ~15-20 s; el SDK espera hasta 40 s por intento y reintenta una vez. */
export const maxDuration = 90;

export async function POST(request: Request) {
  const tiempos = tiemposServidor();
  const quien = await tiempos.medir("auth", () => conductorDeLaApi());
  if (!quien.ok) return tiempos.con(quien.respuesta);
  if (!direccionIADisponible()) return tiempos.con(NextResponse.json({ error: "La IA no está configurada." }, { status: 503 }));

  const cuerpo = (await request.json().catch(() => null)) as { lote?: unknown } | null;
  const lote = cuerpo?.lote;
  if (!loteValido(lote)) {
    return tiempos.con(NextResponse.json({ error: "Lote inválido." }, { status: 400 }));
  }

  try {
    return tiempos.con(NextResponse.json(await tiempos.medir("proveedor", () => pasoLoteIA(lote))));
  } catch (e) {
    if (esLimiteDeTasa(e)) {
      return tiempos.con(NextResponse.json({ error: "La IA está ocupada. Intenta de nuevo en un momento." }, { status: 429 }));
    }
    return tiempos.con(NextResponse.json({ error: "La IA no respondió. Intenta de nuevo." }, { status: 503 }));
  }
}
