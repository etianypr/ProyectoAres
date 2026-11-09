// Las paradas cerca de la activa (spec 023; dueño, 2026-11-08): para aprovechar
// el paso con un pedido que quedó para más tarde («Dejar como pendiente») o con
// una entrega que el receptor agendó por teléfono y la app no conoce. Puro.

import { distanciaMetros } from "@/lib/geo/coordenada";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { Parada } from "./dia-trabajo-tipos";

/** Cerca es a menos de esto, en línea recta: sin red ni cupo (dueño). */
export const METROS_CERCA = 300;
/** Las que siguen en la ruta ya vienen: mostrarlas solo repite la lista. */
const SIGUIENTES_QUE_YA_VIENEN = 2;
/** Más que esto no cabe en la esquina del mapa. */
const MAX_CERCANAS = 3;

export type Cercana = {
  pedido: Pedido;
  /** Su número en la ruta; null = está fuera de la ruta. */
  secuencia: number | null;
  /** En línea recta desde la parada activa. */
  metros: number;
};

/** Hasta tres pedidos pendientes a menos de METROS_CERCA de la parada activa, del
 *  más cercano al más lejano: los de la ruta salvo las dos que siguen, y los que
 *  están fuera de ella con punto. Sin activa, o sin su punto, ninguno. */
export function paradasCercanas(paradas: Parada[], activa: Parada | null, pedidos: Pedido[]): Cercana[] {
  const { lat, lng } = activa?.pedido ?? {};
  if (!activa || lat == null || lng == null) return [];
  const i = paradas.findIndex((p) => p.pedido.id === activa.pedido.id);
  const masAdelante = paradas
    .slice(i + 1)
    .filter((p) => p.pedido.resultado === "pendiente")
    .slice(SIGUIENTES_QUE_YA_VIENEN);
  const enRuta = new Set(paradas.map((p) => p.pedido.id));
  const candidatas = [
    ...masAdelante.map((p) => ({ pedido: p.pedido, secuencia: p.secuencia as number | null })),
    ...pedidos.filter((p) => p.resultado === "pendiente" && !enRuta.has(p.id)).map((pedido) => ({ pedido, secuencia: null })),
  ];
  return candidatas
    .flatMap((c) => (c.pedido.lat == null || c.pedido.lng == null ? [] : [{ ...c, metros: distanciaMetros({ lat, lng }, { lat: c.pedido.lat, lng: c.pedido.lng }) }]))
    .filter((c) => c.metros <= METROS_CERCA)
    .sort((a, b) => a.metros - b.metros)
    .slice(0, MAX_CERCANAS);
}
