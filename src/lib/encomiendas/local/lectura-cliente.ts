"use client";

// El teléfono lee la foto de la guía o de la etiqueta (spec 005). La guía va
// primero a la IA (ver leerImagen); la etiqueta, lo más barato primero:
//
//   1. En la APK, el texto se lee EN EL TELÉFONO (ML Kit, lib/nativo): gratis,
//      sin señal y sin que la foto salga del teléfono. Ese texto pasa por las
//      mismas reglas que el texto pegado (leerGuia, leerEtiqueta).
//   2. Solo si eso no alcanza —en el navegador, o si faltó el nombre, el
//      teléfono o el pago— y la IA está encendida, la foto va a /api/lectura.
//
// Medido el 2026-10-24 (contador de tokens): una etiqueta con Claude Opus 5 son
// ~2.000 tokens de entrada (~US$0,02) y una foto de la guía ~5.000. Con el paso
// 1, la IA queda para las fotos que el teléfono no pudo leer.
//
// Sin nada que leer lanza ErrorLectura y la pantalla ofrece pegar el texto; la
// parada ya se sabe por el código de barras.

import { LADO_MAXIMO, type RespuestaLectura, type TipoLectura } from "@/lib/encomiendas/lectura/contrato";
import { etiquetaCompleta, leerEtiqueta, type LecturaEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { guiaDesdeIA, leerGuia, type GuiaLeida } from "@/lib/encomiendas/lectura/guia";
import type { ReferenciaPaquete } from "@/lib/encomiendas/paquete";
import { textoDeFoto } from "@/lib/nativo/telefono";
import { comprimirFoto } from "./foto";

export class ErrorLectura extends Error {
  constructor(
    message: string,
    /** HTTP, o 0 si no hubo respuesta (sin señal). */
    readonly estado: number,
  ) {
    super(message);
  }
}

/** Quién leyó la foto: el teléfono (gratis) o la IA (se paga por foto). */
export type FuenteLectura = "telefono" | "ia";

export type LecturaFoto =
  | { tipo: "guia"; guia: GuiaLeida; fuente: FuenteLectura }
  | { tipo: "etiqueta"; etiqueta: LecturaEtiqueta & { referencia: ReferenciaPaquete | null }; fuente: FuenteLectura };

/** Lee la foto: primero en el teléfono y, si no alcanza y `ia` lo permite, con
 *  la IA. Si la IA falla pero el teléfono leyó algo, se devuelve eso. */
export async function leerImagen(tipo: TipoLectura, foto: Blob, { ia }: { ia: boolean }): Promise<LecturaFoto> {
  const reducida = await comprimirFoto(foto, LADO_MAXIMO[tipo]);

  // La guía, al revés: primero la IA. El lector del teléfono, con una foto a la
  // pantalla, daba una cantidad distinta de líneas en cada foto (14, 6…;
  // terreno 2026-10-25). Queda para cuando no hay IA o no hay señal.
  if (tipo === "guia" && ia) {
    try {
      return desdeIA(await pedirIA(tipo, reducida));
    } catch (e) {
      const texto = await textoDeFoto(reducida);
      const local = texto ? desdeTexto(tipo, texto) : null;
      if (local && suficiente(local)) return local;
      throw e;
    }
  }

  const texto = await textoDeFoto(reducida);
  const local = texto ? desdeTexto(tipo, texto) : null;
  if (local && suficiente(local)) return local;

  if (ia) {
    try {
      return desdeIA(await pedirIA(tipo, reducida));
    } catch (e) {
      if (local) return local;
      throw e;
    }
  }
  if (local) return local;
  throw new ErrorLectura("No se pudo leer el texto de la foto. Saca otra más derecha y con luz, o pega el texto.", 422);
}

function desdeTexto(tipo: TipoLectura, texto: string): LecturaFoto {
  if (tipo === "guia") return { tipo, guia: leerGuia(texto), fuente: "telefono" };
  return { tipo, etiqueta: { ...leerEtiqueta(texto), referencia: null }, fuente: "telefono" };
}

/** La guía sirve con una línea leída (el conductor revisa la lista y agrega otra
 *  foto); la etiqueta, con nombre, teléfono y pago. */
function suficiente(l: LecturaFoto): boolean {
  return l.tipo === "guia" ? l.guia.lineas.length > 0 : etiquetaCompleta(l.etiqueta);
}

function desdeIA(r: RespuestaLectura): LecturaFoto {
  return r.tipo === "guia"
    ? { tipo: "guia", guia: guiaDesdeIA([r.guia]), fuente: "ia" }
    : { tipo: "etiqueta", etiqueta: r.etiqueta, fuente: "ia" };
}

async function pedirIA(tipo: TipoLectura, reducida: Blob): Promise<RespuestaLectura> {
  const datos = new FormData();
  datos.set("tipo", tipo);
  datos.set("imagen", reducida, "foto.jpg");

  let respuesta: Response;
  try {
    respuesta = await fetch("/api/lectura", { method: "POST", body: datos });
  } catch {
    throw new ErrorLectura("Sin señal: no se pudo leer la foto. Pega el texto o intenta con señal.", 0);
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaLectura | { error?: string } | null;
  if (!respuesta.ok || !cuerpo || !("tipo" in cuerpo)) {
    const mensaje = cuerpo && "error" in cuerpo && cuerpo.error ? cuerpo.error : "No se pudo leer la foto.";
    throw new ErrorLectura(mensaje, respuesta.status);
  }
  return cuerpo;
}
