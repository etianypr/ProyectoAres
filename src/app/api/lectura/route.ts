import { NextResponse } from "next/server";
import { conductorDeLaApi } from "@/lib/auth/api-conductor";
import { BYTES_MAXIMOS_FOTO, type ErrorLecturaApi, type RespuestaLectura } from "@/lib/encomiendas/lectura/contrato";
import { LecturaIlegible, lecturaIADisponible, leerFoto } from "@/lib/encomiendas/lectura/servidor";

// Lectura con IA de la foto de la guía o de una etiqueta (spec 005,
// contracts/lectura.md). Solo el conductor; la foto pasa en tránsito y no se
// guarda ni se registra (sin console.*: la prueba de privacidad lo vigila).
//
//   401 sin sesión de conductor · 413 foto grande · 422 ilegible ·
//   503 IA apagada o caída (el teléfono sigue con el texto pegado).

const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
type TipoFoto = (typeof TIPOS_FOTO)[number];

function error(estado: number, mensaje: string) {
  return NextResponse.json<ErrorLecturaApi>({ error: mensaje }, { status: estado });
}

export async function POST(request: Request) {
  const quien = await conductorDeLaApi();
  if (!quien.ok) return quien.respuesta;

  if (!lecturaIADisponible()) return error(503, "La lectura con IA no está configurada.");

  const datos = await request.formData().catch(() => null);
  const tipo = datos?.get("tipo");
  const foto = datos?.get("imagen");
  if ((tipo !== "guia" && tipo !== "etiqueta") || !(foto instanceof Blob)) {
    return error(400, "Falta la foto o el tipo (guia | etiqueta).");
  }
  if (foto.size > BYTES_MAXIMOS_FOTO) return error(413, "La foto es demasiado grande.");
  const mediaType = TIPOS_FOTO.find((t) => t === foto.type);
  if (!mediaType) return error(400, "La foto tiene que ser JPEG, PNG o WebP.");

  try {
    // "revisar": el teléfono vio en la guía una OF que la primera lectura no
    // trajo; se relee con el modelo más fino (ver lectura/servidor.ts).
    const alta = tipo === "guia" && datos?.get("revisar") === "1";
    const lectura = await leerFoto(tipo, new Uint8Array(await foto.arrayBuffer()), mediaType as TipoFoto, { alta });
    return NextResponse.json<RespuestaLectura>(lectura);
  } catch (e) {
    if (e instanceof LecturaIlegible) return error(422, "No se pudo leer la foto. Intenta otra, más cerca y con luz.");
    return error(503, "La lectura con IA no respondió. Intenta de nuevo o pega el texto.");
  }
}
