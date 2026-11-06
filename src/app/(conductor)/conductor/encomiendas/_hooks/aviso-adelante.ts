// El aviso dos paradas antes de un pedido con ⚠ (spec 022, US2; `AGENTS.md`,
// «Pedidos con problemas»): para confirmar —llamar o mirar— antes de gastar
// combustible y tiempo en ir. Lo muestran la cabecera de ARES y la burbuja.
// Puro.

import { problemasDelPedido, type ProblemaPedido } from "@/lib/encomiendas/problemas";
import type { Parada } from "./dia-trabajo-tipos";

export type AvisoAdelante = {
  parada: Parada;
  /** A cuántas paradas pendientes está: 1 (la próxima) o 2. */
  cuantas: 1 | 2;
  /** El primero de sus ⚠ que se avisa antes. */
  problema: ProblemaPedido;
};

/** El primer pedido con un ⚠ que se avisa antes, entre las DOS paradas
 *  pendientes que siguen a la activa. La activa no cuenta: su ⚠ ya está en su
 *  tarjeta. Las cerradas tampoco: no hay que ir. */
export function avisoAdelante(paradas: Parada[], activaId: string | null): AvisoAdelante | null {
  if (!activaId) return null;
  const i = paradas.findIndex((p) => p.pedido.id === activaId);
  if (i < 0) return null;
  const siguientes = paradas.slice(i + 1).filter((p) => p.pedido.resultado === "pendiente").slice(0, 2);
  for (const [k, parada] of siguientes.entries()) {
    const problema = problemasDelPedido(parada.pedido).find((x) => x.avisaAntes);
    if (problema) return { parada, cuantas: k === 0 ? 1 : 2, problema };
  }
  return null;
}

/** "En 2 paradas: la 14" / "En la próxima parada: la 13". */
export function tituloAvisoAdelante(a: AvisoAdelante): string {
  return a.cuantas === 1 ? `En la próxima parada: la ${a.parada.secuencia}` : `En 2 paradas: la ${a.parada.secuencia}`;
}

/** La línea de la burbuja: lo mismo, en una sola. */
export function lineaAvisoAdelante(a: AvisoAdelante): string {
  return `⚠ ${tituloAvisoAdelante(a)} · ${a.problema.texto}`;
}
