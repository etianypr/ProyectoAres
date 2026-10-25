import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { googleDirecto } from "@/lib/geo/geocoding/google";

// La dirección que Mapbox y OSM no ubicaron, preguntada a Google con la clave
// del servidor (spec 016, US3). Solo el conductor. La dirección pasa en
// tránsito: no se guarda ni se registra (sin console.*).
//
//   401 sin sesión de conductor · 400 sin dirección · 503 sin GOOGLE_MAPS_KEY

export async function POST(request: Request) {
  const quien = await conductorDeLaApi();
  if (!quien.ok) return quien.respuesta;

  const clave = process.env.GOOGLE_MAPS_KEY;
  if (!clave) return NextResponse.json({ error: "Google no está configurado." }, { status: 503 });

  const cuerpo = (await request.json().catch(() => null)) as { direccion?: unknown } | null;
  const direccion = typeof cuerpo?.direccion === "string" ? cuerpo.direccion.trim().slice(0, 200) : "";
  if (!direccion) return NextResponse.json({ error: "Falta la dirección." }, { status: 400 });

  return NextResponse.json({ sugerencias: await googleDirecto(direccion, clave) });
}
