// Corregir con IA una dirección que no se pudo ubicar (spec 018). Lo que
// comparten el teléfono y el servidor.
//
// El reparto del trabajo:
//   · el SERVIDOR solo habla con Claude (la clave no sale de ahí): le pasa la
//     conversación y devuelve lo que contestó;
//   · el TELÉFONO ejecuta las herramientas que Claude pide —buscar en Mapbox,
//     OpenStreetMap y Google, mirar el catálogo de calles de Arica— igual que
//     cuando el conductor escribe una dirección, y arma la conversación.
//
// Las coordenadas NUNCA las escribe la IA: elige uno de los candidatos que
// devolvieron los buscadores, por su id. Así no puede inventar un punto.

import type { Confianza, Fuente } from "../geocoding/tipos";

export const HERRAMIENTA = {
  buscar: "buscar_direccion",
  calles: "calles_parecidas",
  proponer: "proponer",
} as const;

/** Idas y vueltas con la IA por dirección, como mucho. */
export const MAX_VUELTAS = 6;
/** Direcciones por tanda: el resto queda para corregir a mano. */
export const MAX_DIRECCIONES_POR_TANDA = 15;
/** Tamaño máximo de la conversación que acepta el servidor (caracteres). */
export const MAX_CARACTERES_CONVERSACION = 60_000;

/** Un lugar devuelto por un buscador, con el id que la IA usa para elegirlo. */
export type CandidatoIA = {
  id: string;
  direccion: string;
  detalle: string | null;
  lat: number;
  lng: number;
  confianza: Confianza;
  coincideNumero: boolean | null;
  /** El buscador dio la CALLE y no una puerta: su punto puede estar a
   *  kilómetros del número (terreno 2026-10-28: una dirección de la guía quedó
   *  en la mitad de una calle de 5 km). */
  soloCalle: boolean;
  fuente: Fuente;
};

export type BloqueTexto = { type: "text"; text: string };
export type BloqueHerramienta = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type BloqueResultado = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type MensajeIA =
  | { role: "user"; content: string | BloqueResultado[] }
  | { role: "assistant"; content: (BloqueTexto | BloqueHerramienta)[] };

/** Lo que devuelve el servidor por cada ida. */
export type RespuestaPaso = { contenido: (BloqueTexto | BloqueHerramienta)[]; fin: string | null };

export type ConfianzaIA = "alta" | "media" | "baja";

export type ResultadoIA =
  | { tipo: "propuesta"; candidato: CandidatoIA; direccion: string; confianza: ConfianzaIA; motivo: string }
  | { tipo: "sin_arreglo"; motivo: string }
  | { tipo: "error"; mensaje: string };

/** La conversación que manda el teléfono tiene la forma esperada y no es enorme.
 *  Pura: la usa la ruta antes de gastar una consulta. */
export function conversacionValida(mensajes: unknown): mensajes is MensajeIA[] {
  if (!Array.isArray(mensajes) || mensajes.length === 0 || mensajes.length > MAX_VUELTAS * 2 + 1) return false;
  if (JSON.stringify(mensajes).length > MAX_CARACTERES_CONVERSACION) return false;
  return mensajes.every((m, i) => {
    if (!m || typeof m !== "object") return false;
    const { role, content } = m as { role?: unknown; content?: unknown };
    // Empieza el usuario y se van turnando.
    if (role !== (i % 2 === 0 ? "user" : "assistant")) return false;
    if (role === "user" && typeof content === "string") return i === 0 && content.length > 0;
    if (!Array.isArray(content) || content.length === 0) return false;
    return content.every((b) => {
      const tipo = (b as { type?: unknown })?.type;
      return role === "user" ? tipo === "tool_result" : tipo === "text" || tipo === "tool_use";
    });
  });
}
