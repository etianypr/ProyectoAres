import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { BYTES_MAXIMOS_FOTO } from "@/lib/encomiendas/lectura/contrato";
import { textoConVision, visionDisponible } from "@/lib/encomiendas/lectura/vision";

// El texto de una foto (etiqueta o guía) con Google Cloud Vision (spec 005).
// Solo el conductor. La foto pasa en tránsito: no se guarda ni se registra
// (sin console.*).
//
//   401 sin sesión · 400 sin foto · 413 foto grande · 503 sin clave ·
//   502 Google no respondió (el teléfono sigue con su propio lector)

export async function POST(request: Request) {
  const quien = await conductorDeLaApi();
  if (!quien.ok) return quien.respuesta;
  if (!visionDisponible()) return NextResponse.json({ error: "Cloud Vision no está configurado." }, { status: 503 });

  const datos = await request.formData().catch(() => null);
  const foto = datos?.get("imagen");
  if (!(foto instanceof Blob)) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  if (foto.size > BYTES_MAXIMOS_FOTO) return NextResponse.json({ error: "La foto es demasiado grande." }, { status: 413 });

  try {
    return NextResponse.json({ texto: await textoConVision(new Uint8Array(await foto.arrayBuffer())) });
  } catch {
    return NextResponse.json({ error: "Cloud Vision no respondió." }, { status: 502 });
  }
}
