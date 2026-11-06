"use client";

// La etiqueta dice otra dirección que la guía y el conductor eligió la de la
// etiqueta (spec 005, T022): se guarda y se ubica de nuevo. Si queda en duda
// pero con opciones, entra con la primera y ⚠, como al leer la guía (spec 022).
// Lo usan el escáner y el ⚠ guardado del pedido.

import { lugarProvisorio } from "@/lib/encomiendas/problemas";
import { ubicarDireccion } from "@/lib/geo/geocoding";
import { cambiarDireccion, ubicarConDuda } from "./almacen";

export async function usarDireccionDeEtiqueta(
  pedidoId: string,
  direccion: string,
): Promise<"ubicada" | "en_duda" | "sin_ubicar"> {
  const r = await ubicarDireccion(direccion);
  const provisorio = r.elegida ? null : lugarProvisorio(r);
  await cambiarDireccion(pedidoId, direccion, r.elegida ?? provisorio?.punto ?? null);
  if (provisorio) await ubicarConDuda([{ id: pedidoId, ...provisorio }]);
  return r.elegida ? "ubicada" : provisorio ? "en_duda" : "sin_ubicar";
}
