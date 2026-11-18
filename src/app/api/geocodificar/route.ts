import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { tiemposServidor } from "@/lib/comun/tiempos-servidor";
import { googleDirecto } from "@/lib/geo/geocoding/google";

// Una dirección con número, preguntada a Google con la clave del servidor (spec
// 016, US3; desde la spec 019 Google es el que da el número de casa). Solo el
// conductor. La dirección pasa en tránsito: no se guarda ni se registra (sin
// console.*).
//
//   401 sin sesión de conductor · 400 sin dirección · 503 sin GOOGLE_MAPS_KEY ·
//   502 Google no contestó bien (el teléfono no lo recuerda como "no existe")
//
// El proxy no consulta la sesión aquí: la verifica conductorDeLaApi (spec 038). Server-Timing
// lleva solo cifras (auth, proveedor), nunca la dirección.

export async function POST(request: Request) {
  const tiempos = tiemposServidor();
  const quien = await tiempos.medir("auth", () => conductorDeLaApi());
  if (!quien.ok) return tiempos.con(quien.respuesta);

  const clave = process.env.GOOGLE_MAPS_KEY;
  if (!clave) return tiempos.con(NextResponse.json({ error: "Google no está configurado." }, { status: 503 }));

  const cuerpo = (await request.json().catch(() => null)) as { direccion?: unknown } | null;
  const direccion = typeof cuerpo?.direccion === "string" ? cuerpo.direccion.trim().slice(0, 200) : "";
  if (!direccion) return tiempos.con(NextResponse.json({ error: "Falta la dirección." }, { status: 400 }));

  const sugerencias = await tiempos.medir("proveedor", () => googleDirecto(direccion, clave));
  if (!sugerencias) return tiempos.con(NextResponse.json({ error: "Google no respondió." }, { status: 502 }));
  return tiempos.con(NextResponse.json({ sugerencias }));
}
