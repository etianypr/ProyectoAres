// Las cifras que muestra la pantalla del conductor: qué quedó fuera de la ruta y
// cómo va la ruta del día (sale de pantalla.tsx, spec 002 T035). Puro.

import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { Parada } from "./use-dia-trabajo";

export type CifrasPantalla = {
  /** Pendientes que no están en la ruta. */
  sinRutear: Pedido[];
  /** Cuántos de ellos no tienen punto en el mapa. */
  sinUbicar: number;
  entregadas: number;
  noEntregadas: number;
  /** Entregadas sobre el total de paradas, redondeado. */
  porcentaje: number;
};

export function cifrasPantalla(paradas: Parada[], pedidos: Pedido[]): CifrasPantalla {
  const enRuta = new Set(paradas.map((p) => p.pedido.id));
  const sinRutear = pedidos.filter((p) => p.resultado === "pendiente" && !enRuta.has(p.id));
  const entregadas = paradas.filter((p) => p.pedido.resultado === "entregado").length;
  return {
    sinRutear,
    sinUbicar: sinRutear.filter((p) => p.lat == null || p.lng == null).length,
    entregadas,
    noEntregadas: paradas.filter((p) => p.pedido.resultado === "no_entregado").length,
    porcentaje: paradas.length > 0 ? Math.round((entregadas / paradas.length) * 100) : 0,
  };
}
