// Lecturas del almacén, ya normalizadas (ver migrar.ts). Las comparten todos
// los archivos de esta carpeta; ninguno lee los stores de pedidos o rutas por
// su cuenta.

import { STORES, leerTodos, leerUno } from "../idb";
import { alDia, rutaAlDia } from "./migrar";
import type { Pedido, Ruta } from "./tipos";

export async function leerPedido(id: string): Promise<Pedido | null> {
  const pedido = await leerUno(STORES.pedidos, id);
  return pedido ? alDia(pedido) : null;
}

/** Todos los guardados, de cualquier día. Solo para resúmenes (ver leerDias). */
export async function leerTodosLosPedidos(): Promise<Pedido[]> {
  const pedidos = await leerTodos(STORES.pedidos);
  return pedidos.map(alDia).sort((a, b) => b.cargadoEn.localeCompare(a.cargadoEn));
}

/** Los pedidos de un día. Los de días anteriores no se arrastran: lo que no se
 *  entregó vuelve a cargarse en otra fecha (spec 009). */
export async function leerPedidos(fecha: string): Promise<Pedido[]> {
  const pedidos = await leerTodosLosPedidos();
  return pedidos.filter((p) => p.fecha === fecha);
}

export async function leerRuta(fecha: string): Promise<Ruta | null> {
  const ruta = await leerUno(STORES.rutas, fecha);
  return ruta ? rutaAlDia(ruta) : null;
}

/** Los pedidos de la ruta en orden de visita. Uno eliminado simplemente no está. */
export function pedidosEnOrden(ruta: Ruta | null, pedidos: Pedido[]): Pedido[] {
  const porId = new Map(pedidos.map((p) => [p.id, p] as const));
  return (ruta?.orden ?? []).flatMap((id) => porId.get(id) ?? []);
}
