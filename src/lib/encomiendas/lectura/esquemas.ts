// Lo que la IA devuelve al leer una foto (spec 005, contracts/lectura.md). Lo
// comparten el servidor (que se lo pide a Claude como salida estructurada) y las
// pruebas. Sin restricciones de largo ni de rango: la salida estructurada no
// las admite todas; se recorta y valida después (guia.ts, etiqueta.ts).

import { z } from "zod";
import { COLORES_PAQUETE, TAMANOS_PAQUETE, TIPOS_PAQUETE } from "../catalogos";

const claves = <C extends Record<string, string>>(c: C) => Object.keys(c) as [keyof C & string, ...(keyof C & string)[]];

export const GuiaIA = z.object({
  folio: z.string().nullable(),
  /** MONTO NETO de la guía (cada línea vale 1). */
  totalDeclarado: z.number().nullable(),
  lineas: z.array(z.object({ of: z.string(), destino: z.string() })),
});
export type GuiaIA = z.infer<typeof GuiaIA>;

export const EtiquetaIA = z.object({
  of: z.string().nullable(),
  bulto: z.number().nullable(),
  bultosTotal: z.number().nullable(),
  destinatario: z.string().nullable(),
  telefono: z.string().nullable(),
  direccion: z.string().nullable(),
  pago: z.enum(["POR_PAGAR", "CONTADO", "CTA_CTE", "DESCONOCIDO"]),
  montoPorPagar: z.number().nullable(),
  descripcion: z.object({
    tipo: z.enum(claves(TIPOS_PAQUETE)).nullable(),
    tamano: z.enum(claves(TAMANOS_PAQUETE)).nullable(),
    color: z.enum(claves(COLORES_PAQUETE)).nullable(),
    nota: z.string().nullable(),
  }),
  dudosos: z.array(z.string()),
});
export type EtiquetaIA = z.infer<typeof EtiquetaIA>;
