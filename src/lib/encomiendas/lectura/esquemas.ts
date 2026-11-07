// Lo que la IA devuelve al leer la foto de la guía (spec 005, contracts/lectura.md).
// Lo comparten el servidor (que se lo pide a Claude como salida estructurada) y
// las pruebas. Sin restricciones de largo ni de rango: la salida estructurada no
// las admite todas; se recorta y valida después (guia.ts). La etiqueta no va a
// la IA (spec 021).

import { z } from "zod";

export const GuiaIA = z.object({
  folio: z.string().nullable(),
  /** MONTO NETO de la guía (cada línea vale 1). */
  totalDeclarado: z.number().nullable(),
  lineas: z.array(z.object({ of: z.string(), destino: z.string() })),
});
export type GuiaIA = z.infer<typeof GuiaIA>;
