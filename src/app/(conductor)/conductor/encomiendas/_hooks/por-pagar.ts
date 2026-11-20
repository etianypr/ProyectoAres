// POR PAGAR «por revisar» (spec 033, nuevo-pendiente-por-revisar-invisible): un
// pedido que vino de la guía o de una etiqueta y del que no se leyó si se cobra
// (porPagar null). Antes no se veía en ninguna parte: ni en la parada ni en el
// cierre. Nunca se supone que no se cobra (spec 005, FR-015). Puro.

import type { Pedido } from "@/lib/encomiendas/local/almacen";

/** Un pedido cargado a mano no tiene etiqueta que leer: ahí null es «no se sabe»
 *  porque nadie lo anotó, y no se marca. */
export function porPagarPorRevisar(p: Pick<Pedido, "porPagar" | "origenCarga">): boolean {
  return p.porPagar === null && p.origenCarga !== "manual";
}

/** La ficha del pago de la parada (spec 046; dueño, 2026-11-20): se cobra (con su monto o por
 *  revisar), está pagado, o falta leerlo. Nunca «pagado» sin haberlo leído (spec 005). null =
 *  un pedido manual sin dato: no se muestra ficha. */
export type PagoDelPedido = { tipo: "cobro"; monto: number | null } | { tipo: "pagado" } | { tipo: "sin_leer" };

export function pagoDelPedido(p: Pick<Pedido, "porPagar" | "montoPorPagar" | "origenCarga">): PagoDelPedido | null {
  if (p.porPagar) return { tipo: "cobro", monto: p.montoPorPagar };
  if (p.porPagar === false) return { tipo: "pagado" };
  return porPagarPorRevisar(p) ? { tipo: "sin_leer" } : null;
}

/** Los entregados del día con el cobro por revisar: el cierre los cuenta aparte. */
export function entregadosPorRevisar(pedidos: Pedido[]): number {
  return pedidos.filter((p) => p.resultado === "entregado" && porPagarPorRevisar(p)).length;
}

/** El monto como lo escribe el conductor («12.345», «$ 12345»): pesos enteros, o
 *  null si no escribió ninguno (POR PAGAR con el monto por revisar). */
export function montoEscrito(texto: string): number | null {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) : null;
}

/** Lo que se guarda del cobro desde el formulario (spec 033, por-pagar): «No» no
 *  cobra, «Sí» con el monto escrito (o por revisar), y «Por revisar» queda null.
 *  Son los mismos campos que llena la etiqueta. */
export function cobroDelFormulario(
  porPagar: boolean | null,
  monto: string,
): { porPagar: boolean | null; montoPorPagar: number | null } {
  return { porPagar, montoPorPagar: porPagar ? montoEscrito(monto) : null };
}
