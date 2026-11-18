"use client";

// El teléfono lee la foto de la guía o de la etiqueta (spec 005).
//
//   · Etiqueta (spec 021): la lee SOLO el lector del teléfono (ML Kit), y el
//     texto pasa por las mismas reglas que el texto pegado (leerEtiqueta). Ni la
//     foto ni su texto salen del teléfono: traen el nombre y el teléfono del
//     destinatario. El dueño: "no quiero que se envíen fotos a anthropic por
//     temas legales de privacidad" (2026-11-07).
//   · Guía: manda la IA (Opus, ~US$3 al mes) y el texto (Cloud Vision por
//     /api/texto o, sin señal o sin clave, ML Kit) sirve de control gratis: si
//     trae una OF que la IA no leyó, la foto se relee. Con un lector solo, cada
//     foto a la pantalla daba una cantidad distinta de líneas (14, 6…; terreno
//     2026-10-25). La guía no trae nombre ni teléfono.
//
// Sin nada que leer lanza ErrorLectura y la pantalla ofrece pegar el texto; la
// parada ya se sabe por el código de barras.

import { BYTES_MAXIMOS_FOTO, LADO_CONFIRMAR_ETIQUETA, LADO_MAXIMO, type RespuestaLectura } from "@/lib/encomiendas/lectura/contrato";
import { leerEtiqueta, type LecturaEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { combinarLecturas } from "@/lib/encomiendas/lectura/etiqueta/combinar";
import { faltanEnLaPrimera, guiaDesdeIA, leerGuia, type GuiaLeida } from "@/lib/encomiendas/lectura/guia";
import { textoDeFoto } from "@/lib/nativo/telefono";
import { cronometrar } from "@/lib/comun/cronometro";
import { tope } from "@/lib/comun/tope";
import { comprimirFoto } from "./foto";

// Sin propiedades en el constructor: Node las rechaza al quitar los tipos, y las
// pruebas importan este archivo tal cual (etiqueta-en-el-telefono.test.mjs).
export class ErrorLectura extends Error {
  /** HTTP, o 0 si no hubo respuesta (sin señal). */
  readonly estado: number;

  constructor(message: string, estado: number) {
    super(message);
    this.estado = estado;
  }
}

/** Quién leyó la foto de la guía: un lector de texto (Cloud Vision o el del
 *  teléfono) o la IA. */
export type FuenteLectura = "texto" | "ia";

type LecturaFoto = { tipo: "guia"; guia: GuiaLeida; fuente: FuenteLectura };

/** La foto de la etiqueta, leída SOLO en el teléfono (ver la cabecera). Fuera
 *  de la APK no hay lector: la pantalla no ofrece la foto y se pega el texto. */
export async function leerFotoEtiqueta(foto: Blob): Promise<LecturaEtiqueta> {
  const leida = await leerFotoEtiquetaDoble(foto);
  if (!leida) {
    throw new ErrorLectura("No se pudo leer el texto de la foto. Toma otra, de frente y con buena luz, o pega el texto.", 422);
  }
  return leida.lectura;
}

/** Lo que dieron las dos lecturas de la etiqueta: el resultado, el texto de la
 *  grande (Diagnóstico → «Probar etiqueta» lo muestra) y los campos en que no
 *  coincidieron. */
type LecturaDoble = { lectura: LecturaEtiqueta; texto: string; distintos: string[] };

/** ML Kit lee la foto dos veces, a 2400 y a 1600 px, y se juntan
 *  (`combinarLecturas`): manda la precisión sobre la rapidez (el dueño,
 *  2026-11-08). Tarda ~3 s en vez de ~1,5. Las fotos se achican de a una: un
 *  teléfono barato se queda sin memoria (spec 017, E10). null si no salió texto. */
export async function leerFotoEtiquetaDoble(foto: Blob): Promise<LecturaDoble | null> {
  const conTexto = (t: string | null) => (t?.trim() ? t : null);
  const grande = await comprimirFoto(foto, LADO_MAXIMO.etiqueta);
  const alto = conTexto(await textoDeFoto(grande));
  const chica = await comprimirFoto(grande, LADO_CONFIRMAR_ETIQUETA);
  const bajo = conTexto(await textoDeFoto(chica));
  if (alto && bajo) {
    const { lectura, distintos } = combinarLecturas(leerEtiqueta(alto), leerEtiqueta(bajo));
    return { lectura, texto: alto, distintos };
  }
  const uno = alto ?? bajo;
  return uno ? { lectura: leerEtiqueta(uno), texto: uno, distintos: [] } : null;
}

// De a una: decodificar varias fotos de 12–50 MP a la vez puede agotar la memoria de un
// teléfono barato (spec 017, E10). Todo lo que achica una foto de la guía pasa por esta fila,
// también lo que se adelanta al tomarla (spec 038).
let filaCompresion: Promise<unknown> = Promise.resolve();
function enFilaDeCompresion<T>(trabajo: () => Promise<T>): Promise<T> {
  const hecho = filaCompresion.then(trabajo);
  filaCompresion = hecho.catch(() => null);
  return hecho;
}

/** Las fotos de la guía ya achicadas al tomarlas, por foto (spec 038). */
const adelantadas = new WeakMap<Blob, Promise<Blob>>();

/** Achica la foto de la guía apenas se toma (spec 038): «Leer direcciones» ya no espera la
 *  compresión de todas juntas. Es la misma compresión que hacía `leerFotosGuia`, así que van
 *  los mismos bytes; achicarlas más (1400 px) se sigue decidiendo al leer, con todas a la vista.
 *  No lanza: si falla, se vuelve a intentar al leer, como antes. */
export function adelantarCompresionGuia(foto: Blob): void {
  if (adelantadas.has(foto)) return;
  const reducida = enFilaDeCompresion(() => comprimirFoto(foto, LADO_MAXIMO.guia));
  adelantadas.set(foto, reducida);
  reducida.catch(() => adelantadas.delete(foto));
}

async function reducirGuia(foto: Blob): Promise<Blob> {
  const adelantada = adelantadas.get(foto);
  if (adelantada) {
    try {
      return await adelantada;
    } catch {
      // Se vuelve a intentar, como si no se hubiera adelantado.
    }
  }
  return enFilaDeCompresion(() => comprimirFoto(foto, LADO_MAXIMO.guia));
}

/** Las fotos de la guía del día (suelen ser 3), TODAS en una sola consulta a la
 *  IA: la instrucción va una vez y la IA junta las filas que se repiten donde
 *  las fotos se superponen (terreno 2026-10-27). El texto de cada foto sirve de
 *  control gratis: si trae una OF que la IA no leyó, se relee todo junto. */
export function leerFotosGuia(fotos: Blob[], opciones: { ia: boolean }): Promise<LecturaFoto> {
  // Diagnóstico «Tiempos» (spec 038): solo los milisegundos.
  return cronometrar("guia.leer", () => leerFotosGuiaSinMedir(fotos, opciones));
}

async function leerFotosGuiaSinMedir(fotos: Blob[], { ia }: { ia: boolean }): Promise<LecturaFoto> {
  let reducidas: Blob[] = [];
  for (const f of fotos) reducidas.push(await reducirGuia(f));
  // Todas juntas tienen que entrar en una consulta: si no, se achican más.
  if (reducidas.reduce((s, r) => s + r.size, 0) > BYTES_MAXIMOS_FOTO * 0.9) {
    const chicas: Blob[] = [];
    for (const r of reducidas) chicas.push(await enFilaDeCompresion(() => comprimirFoto(r, 1400)));
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
    const local = texto ? desdeTexto(texto) : null;
    if (local && suficiente(local)) return local;
    throw new ErrorLectura("No se pudo leer el texto de las fotos. Tómalas de frente y con buena luz, o pega el texto.", 422);
  }

  const [lectura, texto] = await Promise.all([
    pedirIA(reducidas)
      .then(desdeIA)
      .catch((e: unknown) => (e instanceof Error ? e : new ErrorLectura("No se pudo leer la foto.", 0))),
    textos(),
  ]);
  const local = texto ? desdeTexto(texto) : null;
  if (lectura instanceof Error) {
    if (local && suficiente(local)) return local;
    throw lectura;
  }
  if (local && faltanEnLaPrimera(lectura.guia, local.guia)) {
    try {
      return desdeIA(await pedirIA(reducidas, { revisar: true }));
    } catch {
      return lectura;
    }
  }
  return lectura;
}

/** El texto de la foto de la guía: Cloud Vision y, si no está o no hay señal, el
 *  lector del teléfono. La etiqueta no pasa por aquí (spec 021). */
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

function desdeTexto(texto: string): LecturaFoto {
  return { tipo: "guia", guia: leerGuia(texto), fuente: "texto" };
}

/** La guía sirve con una línea leída: el conductor revisa la lista y agrega
 *  otra foto. */
function suficiente(l: LecturaFoto): boolean {
  return l.guia.lineas.length > 0;
}

function desdeIA(r: RespuestaLectura): LecturaFoto {
  return { tipo: "guia", guia: guiaDesdeIA([r.guia]), fuente: "ia" };
}

async function pedirIA(fotos: Blob[], { revisar = false } = {}): Promise<RespuestaLectura> {
  const datos = new FormData();
  datos.set("tipo", "guia");
  for (const [i, f] of fotos.entries()) datos.append("imagen", f, `foto-${i + 1}.jpg`);
  if (revisar) datos.set("revisar", "1");

  let respuesta: Response;
  try {
    // Varias fotos con el modelo grande tardan ~10 s; releer, otro tanto.
    respuesta = await fetch("/api/lectura", { method: "POST", body: datos, signal: tope(60_000) });
  } catch {
    throw new ErrorLectura("Sin conexión. No se pudo leer la foto. Pega el texto o vuelve a intentarlo con conexión.", 0);
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaLectura | { error?: string } | null;
  if (!respuesta.ok || !cuerpo || !("tipo" in cuerpo)) {
    const mensaje = cuerpo && "error" in cuerpo && cuerpo.error ? cuerpo.error : "No se pudo leer la foto.";
    throw new ErrorLectura(mensaje, respuesta.status);
  }
  return cuerpo;
}
