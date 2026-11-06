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

/** Cómo terminó el día, para la cabecera de "Cerrar el día" (spec 027): todos
 *  los pedidos del día y no solo los de la ruta, igual que la pantalla de cierre
 *  (spec 007). Uno que nunca entró a la ruta tampoco se entregó: vuelve a Starken. */
export function cierreDelDia(pedidos: Pedido[]): { entregadas: number; noEntregadas: number } {
  const entregadas = pedidos.filter((p) => p.resultado === "entregado").length;
  return { entregadas, noEntregadas: pedidos.length - entregadas };
}
