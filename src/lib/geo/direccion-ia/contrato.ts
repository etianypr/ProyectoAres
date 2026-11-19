// Corregir con IA, en lote (spec 040; antes una conversación por dirección, spec 018). Lo que
// comparten el teléfono y el servidor.
//
// El reparto del trabajo:
//   · el TELÉFONO arma el lote: cada dirección que no quedó exacta, con los candidatos que ya
//     devolvieron los buscadores (la caché del día), los nombres parecidos del catálogo y la zona
//     del día (cuántos pedidos ubicados hay en cada sector). Ronda 2: busca de nuevo lo que la IA
//     pidió y le manda solo esas;
//   · el SERVIDOR solo le pasa el lote a Claude (la clave no sale de ahí) y devuelve su respuesta.
//
// Las coordenadas NUNCA las escribe la IA: elige un candidato de ESA dirección por su id. Así no
// puede inventar un punto ni mezclar dos direcciones.

import type { Confianza, Fuente } from "../geocoding/tipos";

/** Direcciones por llamada; más van en varias llamadas. */
export const LOTE_MAXIMO = 15;
/** Direcciones por tanda (por carga o por toque de «Corregir con IA»): el resto queda a mano. */
export const MAX_DIRECCIONES_POR_TANDA = 100;
/** Candidatos por dirección que ve la IA. */
export const CANDIDATOS_POR_DIRECCION = 10;
/** Nombres parecidos del catálogo por dirección. */
export const CALLES_POR_DIRECCION = 3;
/** Tamaño máximo del lote que acepta el servidor (caracteres del JSON). */
const MAX_CARACTERES_LOTE = 60_000;

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

/** Un candidato tal como lo lee la IA (sin más precisión que la que hace falta para elegir). */
export type CandidatoEnLote = {
  id: string;
  direccion: string;
  detalle: string | null;
  confianza: Confianza;
  numero_coincide: boolean | null;
  solo_calle: boolean;
  fuente: Fuente;
  /** «lat,lng» con 4 decimales (~11 m). */
  punto: string;
  /** El sector municipal del punto: para compararlo con la zona del día (Google solo dice «Arica»). */
  sector: string;
  /** Solo en una calle repetida (spec 035): las calles que cruzan ese lugar (hasta 3). */
  cruces?: string[];
  /** Solo en una calle repetida: la referencia de la guía nombra su población o una calle que lo cruza. */
  calza_con_la_guia?: boolean;
};

export type DireccionEnLote = {
  /** «d1», «d2»…; los candidatos de esta dirección son «d1c1», «d1c2»… */
  id: string;
  /** La dirección como venía en la guía (máx. 200 caracteres). */
  escrita: string;
  candidatos: CandidatoEnLote[];
  /** Nombres reales del catálogo de calles de Arica parecidos a la calle escrita. */
  calles_parecidas: { nombre: string; largo_m: number }[];
};

/** Cuántos pedidos ya ubicados hay en cada sector: la zona por donde anda la ruta. */
export type ZonaDelDia = { sector: string; pedidos: number }[];

/** Lo que el teléfono le manda al servidor. */
export type Lote = { ronda: 1 | 2; zona: ZonaDelDia; direcciones: DireccionEnLote[] };

export type ConfianzaIA = "alta" | "media" | "baja";

/** Lo que contesta la IA por cada dirección. */
export type ResultadoEnLote = {
  /** El id de la dirección («d1»). */
  direccion: string;
  /** El id del candidato elegido, o null si ninguno sirve. */
  candidato: string | null;
  confianza: ConfianzaIA;
  /** Cómo debería escribirse la dirección. */
  direccion_corregida: string;
  /** Solo en la ronda 1, sin candidato: un texto para volver a buscar. */
  buscar: string | null;
  motivo: string;
};

/** Tokens de la caché de prompt en una llamada (spec 038): solo cifras, para Diagnóstico. */
type UsoCache = { cacheLeidos: number; cacheCreados: number };

/** Lo que devuelve el servidor por cada lote. */
export type RespuestaLote = { resultados: ResultadoEnLote[]; uso?: UsoCache };

/** Lo que queda de cada dirección después del lote. */
export type ResultadoIA =
  | { tipo: "propuesta"; candidato: CandidatoIA; direccion: string; confianza: ConfianzaIA; motivo: string }
  | { tipo: "sin_arreglo"; motivo: string }
  | { tipo: "error"; mensaje: string };

const ID_DIRECCION = /^d\d{1,3}$/;
const texto = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** El lote que manda el teléfono tiene la forma esperada y no es enorme. Pura: la usa la ruta
 *  antes de gastar una consulta. Revisa la forma y los tamaños, no lo que dicen los textos. */
export function loteValido(x: unknown): x is Lote {
  if (!x || typeof x !== "object") return false;
  const { ronda, zona, direcciones } = x as Partial<Lote>;
  if (ronda !== 1 && ronda !== 2) return false;
  if (!Array.isArray(zona) || zona.length > 20) return false;
  const zonaBien = zona.every(
    (z) => z && texto(z.sector, 40) && Number.isInteger(z.pedidos) && z.pedidos >= 0 && z.pedidos <= 1000,
  );
  if (!zonaBien) return false;
  if (!Array.isArray(direcciones) || direcciones.length === 0 || direcciones.length > LOTE_MAXIMO) return false;
  const ids = new Set<string>();
  for (const d of direcciones) {
    if (!d || !ID_DIRECCION.test(String(d.id)) || ids.has(d.id)) return false;
    if (!texto(d.escrita, 200) || !d.escrita.trim()) return false;
    ids.add(d.id);
    if (!Array.isArray(d.candidatos) || d.candidatos.length > CANDIDATOS_POR_DIRECCION) return false;
    const deEsta = new RegExp(`^${d.id}c\\d{1,2}$`);
    const candidatosBien = d.candidatos.every(
      (c) =>
        c &&
        deEsta.test(String(c.id)) &&
        texto(c.direccion, 200) &&
        (c.detalle === null || texto(c.detalle, 200)) &&
        texto(c.punto, 40) &&
        texto(c.sector, 40) &&
        typeof c.solo_calle === "boolean" &&
        (c.cruces === undefined || (Array.isArray(c.cruces) && c.cruces.length <= 3 && c.cruces.every((x) => texto(x, 80)))) &&
        (c.calza_con_la_guia === undefined || typeof c.calza_con_la_guia === "boolean"),
    );
    if (!candidatosBien) return false;
    if (!Array.isArray(d.calles_parecidas) || d.calles_parecidas.length > CALLES_POR_DIRECCION) return false;
    if (!d.calles_parecidas.every((c) => c && texto(c.nombre, 120) && Number.isFinite(c.largo_m))) return false;
  }
  return JSON.stringify(x).length <= MAX_CARACTERES_LOTE;
}
