"use client";

// El teléfono lee la foto de la guía o de la etiqueta (spec 005).
//
//   · El TEXTO de la foto sale de Google Cloud Vision (/api/texto: el lector de
//     Google Lens, sin salir de la app) y, sin señal o sin clave, del lector
//     del teléfono (ML Kit). Pasa por las mismas reglas que el texto pegado
//     (leerGuia, leerEtiqueta).
//   · Etiqueta: con ese texto alcanza si trae nombre, teléfono y pago; si no, y
//     la IA está encendida, la foto va a /api/lectura (Haiku).
//   · Guía: manda la IA (Opus, ~US$3 al mes); el texto sirve de control
//     gratis: si trae una OF que la IA no leyó, la foto se relee. Con un lector
//     solo, cada foto a la pantalla daba una cantidad distinta de líneas (14,
//     6…; terreno 2026-10-25).
//
// Sin nada que leer lanza ErrorLectura y la pantalla ofrece pegar el texto; la
// parada ya se sabe por el código de barras.

import { BYTES_MAXIMOS_FOTO, LADO_MAXIMO, type RespuestaLectura, type TipoLectura } from "@/lib/encomiendas/lectura/contrato";
import { conDescripcion, etiquetaCompleta, leerEtiqueta, type LecturaEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { faltanEnLaPrimera, guiaDesdeIA, leerGuia, type GuiaLeida } from "@/lib/encomiendas/lectura/guia";
import type { ReferenciaPaquete } from "@/lib/encomiendas/paquete";
import { textoDeFoto } from "@/lib/nativo/telefono";
import { tope } from "@/lib/comun/tope";
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

/** Quién leyó la foto: un lector de texto (Cloud Vision o el del teléfono) o
 *  la IA. */
export type FuenteLectura = "texto" | "ia";

export type LecturaFoto =
  | { tipo: "guia"; guia: GuiaLeida; fuente: FuenteLectura }
  | { tipo: "etiqueta"; etiqueta: LecturaEtiqueta & { referencia: ReferenciaPaquete | null }; fuente: FuenteLectura };

/** Lee la foto (ver la cabecera). Si la IA falla pero hubo texto, se devuelve
 *  lo que dio el texto. */
export async function leerImagen(tipo: TipoLectura, foto: Blob, { ia }: { ia: boolean }): Promise<LecturaFoto> {
  if (tipo === "guia") return leerFotosGuia([foto], { ia });
  const reducida = await comprimirFoto(foto, LADO_MAXIMO[tipo]);

  if (!ia) {
    const texto = await textoDeLaFoto(reducida);
    const local = texto ? desdeTexto(tipo, texto) : null;
    if (local) return local;
    throw new ErrorLectura("No se pudo leer el texto de la foto. Saca otra más derecha y con luz, o pega el texto.", 422);
  }

  // Con IA se le pregunta SIEMPRE, junto con el texto: la descripción del
  // paquete (tipo, color, tamaño) solo la hace ella. Antes, si el texto traía
  // nombre, teléfono y pago, no se le preguntaba y el paquete quedaba sin
  // descripción (terreno 2026-10-28: "funcionó una vez de 3").
  const [lectura, texto] = await Promise.all([
    pedirIA(tipo, reducida)
      .then(desdeIA)
      .catch((e: unknown) => (e instanceof Error ? e : new ErrorLectura("No se pudo leer la foto.", 0))),
    textoDeLaFoto(reducida),
  ]);
  const local = texto ? desdeTexto(tipo, texto) : null;
  if (lectura instanceof Error) {
    if (local) return local;
    throw lectura;
  }
  if (local?.tipo !== "etiqueta" || lectura.tipo !== "etiqueta") return lectura;
  const etiqueta = conDescripcion(local.etiqueta, lectura.etiqueta);
  return etiqueta === lectura.etiqueta ? lectura : { ...local, etiqueta };
}

/** Las fotos de la guía del día (suelen ser 3), TODAS en una sola consulta a la
 *  IA: la instrucción va una vez y la IA junta las filas que se repiten donde
 *  las fotos se superponen (terreno 2026-10-27). El texto de cada foto sirve de
 *  control gratis: si trae una OF que la IA no leyó, se relee todo junto. */
export async function leerFotosGuia(fotos: Blob[], { ia }: { ia: boolean }): Promise<LecturaFoto> {
  // De a una: decodificar varias fotos de 12–50 MP a la vez puede agotar la
  // memoria de un teléfono barato (spec 017, E10).
  let reducidas: Blob[] = [];
  for (const f of fotos) reducidas.push(await comprimirFoto(f, LADO_MAXIMO.guia));
  // Todas juntas tienen que entrar en una consulta: si no, se achican más.
  if (reducidas.reduce((s, r) => s + r.size, 0) > BYTES_MAXIMOS_FOTO * 0.9) {
    const chicas: Blob[] = [];
    for (const r of reducidas) chicas.push(await comprimirFoto(r, 1400));
    reducidas = chicas;
  }
  const textos = async () => {
    const leidos: string[] = [];
    for (const r of reducidas) {
      const t = await textoDeLaFoto(r);
      if (t) leidos.push(t);
    }
    return leidos.join("\n");
  };

  if (!ia) {
    const texto = await textos();
    const local = texto ? desdeTexto("guia", texto) : null;
    if (local && suficiente(local)) return local;
    throw new ErrorLectura("No se pudo leer el texto de las fotos. Sácalas más derechas y con luz, o pega el texto.", 422);
  }

  const [lectura, texto] = await Promise.all([
    pedirIA("guia", reducidas)
      .then(desdeIA)
      .catch((e: unknown) => (e instanceof Error ? e : new ErrorLectura("No se pudo leer la foto.", 0))),
    textos(),
  ]);
  const local = texto ? desdeTexto("guia", texto) : null;
  if (lectura instanceof Error) {
    if (local && suficiente(local)) return local;
    throw lectura;
  }
  if (lectura.tipo === "guia" && local?.tipo === "guia" && faltanEnLaPrimera(lectura.guia, local.guia)) {
    try {
      return desdeIA(await pedirIA("guia", reducidas, { revisar: true }));
    } catch {
      return lectura;
    }
  }
  return lectura;
}

/** El texto de la foto: Cloud Vision y, si no está o no hay señal, el lector
 *  del teléfono. */
async function textoDeLaFoto(reducida: Blob): Promise<string | null> {
  return (await textoEnLaNube(reducida)) ?? (await textoDeFoto(reducida));
}

/** Sin clave en el servidor (503) no se vuelve a preguntar hasta recargar. */
let nubeApagada = false;

async function textoEnLaNube(reducida: Blob): Promise<string | null> {
  if (nubeApagada) return null;
  const datos = new FormData();
  datos.set("imagen", reducida, "foto.jpg");
  try {
    const res = await fetch("/api/texto", { method: "POST", body: datos, signal: tope(15_000) });
    if (res.status === 503) nubeApagada = true;
    if (!res.ok) return null;
    const { texto } = (await res.json()) as { texto?: string };
    return texto?.trim() ? texto : null;
  } catch {
    return null;
  }
}

function desdeTexto(tipo: TipoLectura, texto: string): LecturaFoto {
  if (tipo === "guia") return { tipo, guia: leerGuia(texto), fuente: "texto" };
  return { tipo, etiqueta: { ...leerEtiqueta(texto), referencia: null }, fuente: "texto" };
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

async function pedirIA(tipo: TipoLectura, fotos: Blob | Blob[], { revisar = false } = {}): Promise<RespuestaLectura> {
  const datos = new FormData();
  datos.set("tipo", tipo);
  for (const [i, f] of (Array.isArray(fotos) ? fotos : [fotos]).entries()) datos.append("imagen", f, `foto-${i + 1}.jpg`);
  if (revisar) datos.set("revisar", "1");

  let respuesta: Response;
  try {
    // Varias fotos con el modelo grande tardan ~10 s; releer, otro tanto.
    respuesta = await fetch("/api/lectura", { method: "POST", body: datos, signal: tope(60_000) });
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
