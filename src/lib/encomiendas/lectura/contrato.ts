// Contrato teléfono ↔ POST /api/lectura (spec 005). Lo comparten las dos puntas.
// Solo la guía: la etiqueta se lee en el teléfono y no pasa por el servidor
// (spec 021).

import type { GuiaIA } from "./esquemas";

/** Qué foto es. Con ella se elige cuánto se achica en el teléfono. */
export type TipoLectura = "guia" | "etiqueta";

/** Lo que devuelve el servidor: la guía cruda (se juntan varias fotos en el
 *  teléfono). */
export type RespuestaLectura = { tipo: "guia"; guia: GuiaIA };

export type ErrorLecturaApi = { error: string };

/** Límite de lo que acepta el servidor por consulta, todas las fotos juntas
 *  (Vercel corta en 4,5 MB). */
export const BYTES_MAXIMOS_FOTO = 4 * 1024 * 1024;

/** Fotos de la guía que van juntas en una consulta. */
export const MAX_FOTOS_GUIA = 6;

/** Lado mayor de la foto reducida en el teléfono. La guía tiene letra chica,
 *  pero 2000 px alcanzan (Haiku la reduce a ~1568 igual, y para el modelo fino
 *  cuesta un tercio menos que 2576; medido 2026-10-25). La etiqueta la lee solo
 *  ML Kit (spec 021), gratis: 2400 px, porque manda la precisión sobre la
 *  rapidez (el dueño, 2026-11-08) y hay letra chica y gastada. */
export const LADO_MAXIMO: Record<TipoLectura, number> = { guia: 2000, etiqueta: 2400 };

/** La segunda lectura de la etiqueta, más chica, para confirmar la primera. */
export const LADO_CONFIRMAR_ETIQUETA = 1600;

export type { GuiaIA };
