// Contrato teléfono ↔ POST /api/lectura (spec 005). Lo comparten las dos puntas.

import type { ReferenciaPaquete } from "../paquete";
import type { EtiquetaIA, GuiaIA } from "./esquemas";
import type { LecturaEtiqueta } from "./etiqueta";

export type TipoLectura = "guia" | "etiqueta";

/** Lo que devuelve el servidor. La guía va cruda (se juntan varias fotos en el
 *  teléfono); la etiqueta, ya con las reglas aplicadas. */
export type RespuestaLectura =
  | { tipo: "guia"; guia: GuiaIA }
  | { tipo: "etiqueta"; etiqueta: LecturaEtiqueta & { referencia: ReferenciaPaquete | null } };

export type ErrorLecturaApi = { error: string };

/** Límite de la foto que acepta el servidor (Vercel corta en 4,5 MB). */
export const BYTES_MAXIMOS_FOTO = 4 * 1024 * 1024;

/** Lado mayor de la foto reducida en el teléfono. La guía tiene letra chica,
 *  pero 2000 px alcanzan (Haiku la reduce a ~1568 igual, y para el modelo fino
 *  cuesta un tercio menos que 2576; medido 2026-10-25). */
export const LADO_MAXIMO: Record<TipoLectura, number> = { guia: 2000, etiqueta: 1280 };

export type { EtiquetaIA, GuiaIA };
