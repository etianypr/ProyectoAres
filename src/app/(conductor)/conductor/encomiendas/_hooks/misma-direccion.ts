// Paquetes en el mismo punto (spec 033, misma-dir): dos pedidos de la misma casa
// o del mismo edificio quedan como paradas seguidas. La tarjeta dice «2 paquetes
// aquí» y «Pedido entregado» pregunta si van los dos. Puro.

import { distanciaMetros } from "@/lib/geo/coordenada";
import type { Parada } from "./dia-trabajo-tipos";

/** Hasta esto se considera el mismo punto (la misma puerta o el mismo edificio). */
export const METROS_MISMO_PUNTO = 15;

/** Las paradas pendientes que siguen JUSTO después de la activa y están en su
 *  mismo punto. Se cortan en la primera que no: la que queda más allá ya es otra
 *  parada aunque después vuelva a estar cerca. */
export function paradasJuntas(paradas: Parada[], activa: Parada | null): Parada[] {
  if (!activa) return [];
  const { lat, lng } = activa.pedido;
  if (lat == null || lng == null) return [];
  const juntas: Parada[] = [];
  const pendientes = paradas.filter((p) => p.pedido.resultado === "pendiente");
  const i = pendientes.findIndex((p) => p.pedido.id === activa.pedido.id);
  if (i < 0) return [];
  for (const p of pendientes.slice(i + 1)) {
    if (p.pedido.lat == null || p.pedido.lng == null) break;
    if (distanciaMetros({ lat, lng }, { lat: p.pedido.lat, lng: p.pedido.lng }) > METROS_MISMO_PUNTO) break;
    juntas.push(p);
  }
  return juntas;
}
