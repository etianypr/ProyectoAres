import "server-only";

// Lectura con IA de la guía y de la etiqueta (spec 005): la foto va a Claude y
// vuelve como datos con forma fija (salida estructurada). Nada se guarda: ni la
// foto, ni la respuesta, ni un log del cuerpo (FR-023, docs/PRIVACIDAD.md §3).
//
// Sin ANTHROPIC_API_KEY la lectura está apagada y la app sigue con el texto
// pegado y el código de barras.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EtiquetaIA, GuiaIA } from "./esquemas";
import { etiquetaDesdeIA } from "./etiqueta";
import type { RespuestaLectura, TipoLectura } from "./contrato";

/** Modelo para las etiquetas; se cambia con LECTURA_MODELO tras medir con
 *  etiquetas reales (tasks T030). El teléfono las lee primero (ML Kit) y la IA
 *  solo recibe las que no pudo: ahí basta uno barato (claude-haiku-4-5). */
const MODELO_POR_DEFECTO = "claude-opus-5";

/** La guía: muchas líneas de letra chica fotografiadas a una pantalla. Medido
 *  (2026-10-25) con una foto difícil —ruido, rayas, inclinada— de 10 líneas:
 *  Haiku, Sonnet y Opus leyeron 10/10, a US$0,003, 0,014–0,022 y 0,024–0,036
 *  por foto. Lo que fallaba en terreno ("14, 6…") era el lector del teléfono
 *  dando por buena una lectura incompleta, no el modelo. El dueño eligió Opus
 *  (~US$3 al mes con 3 fotos por día). Si el teléfono ve una OF que la primera
 *  lectura no trajo, la foto se relee (`alta`). Se cambian con
 *  LECTURA_MODELO_GUIA y LECTURA_MODELO_GUIA_ALTA. */
const MODELO_GUIA = "claude-opus-5";
const MODELO_GUIA_ALTA = "claude-opus-5";

function modeloPara(tipo: TipoLectura, alta: boolean): string {
  if (tipo === "etiqueta") return process.env.LECTURA_MODELO || MODELO_POR_DEFECTO;
  return alta
    ? process.env.LECTURA_MODELO_GUIA_ALTA || MODELO_GUIA_ALTA
    : process.env.LECTURA_MODELO_GUIA || MODELO_GUIA;
}

/** La IA no pudo leer la foto (ilegible, rechazada o con otra forma): el
 *  teléfono ofrece pegar el texto. */
export class LecturaIlegible extends Error {}

export function lecturaIADisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function cliente(): Anthropic {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Una clave de usuario (no de un workspace) tiene que decir a cuál va.
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
    // El conductor espera con el paquete en la mano: un reintento y nada más.
    maxRetries: 1,
    timeout: 25_000,
  });
}

const INSTRUCCIONES: Record<TipoLectura, string> = {
  guia: [
    "Es una foto de la pantalla de una guía de despacho electrónica de Starken (app Infologistic).",
    'En la tabla DESCRIPCION, cada línea tiene la forma "OF:<número> DESTINO:<dirección>".',
    "La foto suele estar tomada a una pantalla: puede venir inclinada, con reflejos o con rayas.",
    "Recorre la tabla de arriba hacia abajo y devuelve CADA fila que tenga OF, en orden, con la OF tal como está escrita y el destino tal como aparece.",
    "No te detengas antes de la última fila. Una fila cortada en el borde de la foto también va, con los dígitos que se vean.",
    "folio es el número de la guía (Nº). totalDeclarado es MONTO NETO.",
    "Si un dígito no se lee con seguridad, devuelve tu mejor lectura: el conductor revisa cada línea. No inventes líneas.",
  ].join(" "),
  etiqueta: [
    "Es una foto de la etiqueta de envío de Starken pegada en un paquete.",
    "Extrae solo: la OF impresa, el bulto (Bulto N° x/y), el destinatario, su teléfono, la dirección,",
    "el pago (POR PAGAR, CONTADO o CTA CTE; si no se ve, DESCONOCIDO) y, solo si dice POR PAGAR,",
    "el monto de 'Total Monto O.F.' en pesos, como número entero.",
    "En descripcion, describe el paquete que se ve en la foto: tipo (caja, bolsa, sobre u otro),",
    "tamaño aproximado, color del envoltorio y en nota un rasgo físico distintivo en pocas palabras",
    "(cinta, marca, 'FRÁGIL'; máximo 40 caracteres), nunca un comentario sobre la foto.",
    "Si el paquete no se ve en la foto, deja tipo, tamano, color y nota en null.",
    "No extraigas RUT, remitente, correo ni cuenta corriente.",
    "En dudosos, nombra los campos que no lees con seguridad (por ejemplo telefono o montoPorPagar).",
  ].join(" "),
};

/** Lee la foto (JPEG ya reducido en el teléfono). Lanza LecturaIlegible si no se
 *  pudo, y deja pasar los errores de la API (red, cuota) para que la ruta los
 *  conteste como 503. */
export async function leerFoto(
  tipo: TipoLectura,
  foto: Uint8Array,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  { alta = false }: { alta?: boolean } = {},
): Promise<RespuestaLectura> {
  const formato = tipo === "guia" ? zodOutputFormat(GuiaIA) : zodOutputFormat(EtiquetaIA);
  const modelo = modeloPara(tipo, alta);
  let respuesta;
  try {
    respuesta = await cliente().messages.parse({
      model: modelo,
      max_tokens: 4096,
      // Leer una foto no necesita razonar: sin pensamiento es más rápido y barato.
      thinking: { type: "disabled" },
      // Haiku no acepta `effort` (verificado en la API de modelos): con él, la
      // consulta vuelve con error 400. La guía pide más atención: una línea
      // salteada es un paquete que no entra a la ruta.
      output_config: /haiku/.test(modelo)
        ? { format: formato }
        : { effort: tipo === "guia" ? "medium" : "low", format: formato },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(foto).toString("base64") } },
            { type: "text", text: INSTRUCCIONES[tipo] },
          ],
        },
      ],
    });
  } catch (e) {
    // Red, cuota, clave: la ruta contesta 503. Lo demás es que la respuesta no
    // tuvo la forma pedida (p. ej. un rechazo sin texto): foto ilegible.
    if (e instanceof Anthropic.APIError) throw e;
    throw new LecturaIlegible("No se pudo leer la foto.");
  }

  if (respuesta.stop_reason === "refusal" || respuesta.stop_reason === "max_tokens" || !respuesta.parsed_output) {
    throw new LecturaIlegible("No se pudo leer la foto.");
  }
  if (tipo === "guia") return { tipo, guia: GuiaIA.parse(respuesta.parsed_output) };
  return { tipo, etiqueta: etiquetaDesdeIA(EtiquetaIA.parse(respuesta.parsed_output)) };
}
