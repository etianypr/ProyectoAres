// Los ⚠ guardados en el pedido (spec 022): entrar a la ruta con un lugar en duda,
// elegir una de sus opciones, «Va igual» / «Es así», y los que deja el armado de
// la ruta. Qué cuenta como problema y qué texto lleva: lib/encomiendas/problemas.ts.

import type { OpcionLugar, ProblemaGuardado } from "@/lib/encomiendas/problemas";
import { STORES, escribir } from "../idb";
import { enFila } from "./fila";
import { leerPedido, leerPedidos } from "./lecturas";
import type { Pedido } from "./tipos";

type TipoGuardado = ProblemaGuardado["tipo"];

function sinTipos(problemas: ProblemaGuardado[], tipos: TipoGuardado[]): ProblemaGuardado[] {
  return problemas.filter((p) => !tipos.includes(p.tipo));
}

/** Cambia un pedido leído dentro de la fila. Uno que ya no existe se ignora: el
 *  conductor pudo borrarlo mientras tanto. */
function cambiarPedido(id: string, cambio: (p: Pedido) => Pedido): Promise<Pedido | null> {
  return enFila(async () => {
    const pedido = await leerPedido(id);
    if (!pedido) return null;
    const cambiado = cambio(pedido);
    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, cambiado));
    return cambiado;
  });
}

/** Pedidos cuya dirección quedó en duda pero trae opciones: entran a la ruta con
 *  la primera y el ⚠ con todas (spec 022, US1). */
export function ubicarConDuda(
  entradas: { id: string; punto: { lat: number; lng: number }; problema: ProblemaGuardado }[],
): Promise<void> {
  if (entradas.length === 0) return Promise.resolve();
  return enFila(async () => {
    const actuales = await Promise.all(entradas.map((e) => leerPedido(e.id)));
    await escribir([STORES.pedidos], ({ guardar }) => {
      actuales.forEach((pedido, i) => {
        if (!pedido) return;
        const { punto, problema } = entradas[i];
        guardar(STORES.pedidos, {
          ...pedido,
          lat: punto.lat,
          lng: punto.lng,
          problemas: [...sinTipos(pedido.problemas, ["calle_repetida", "solo_calle"]), problema],
        });
      });
    });
  });
}

/** El conductor eligió una de las opciones guardadas: el punto cambia sin
 *  consultar a ningún buscador (spec 022, SC-002). La parada lejana era del
 *  punto de antes: se vuelve a medir al rehacer la ruta. */
export function elegirLugar(id: string, opcion: OpcionLugar): Promise<Pedido | null> {
  return cambiarPedido(id, (p) => ({
    ...p,
    lat: opcion.lat,
    lng: opcion.lng,
    problemas: sinTipos(p.problemas, ["calle_repetida", "solo_calle", "lejana"]),
  }));
}

/** «Va igual» o «Es así»: queda anotado, pero deja de pedir nada. */
export function marcarRevisado(id: string, tipo: "lejana" | "horario" | "fuera_de_guia"): Promise<Pedido | null> {
  return cambiarPedido(id, (p) => ({
    ...p,
    problemas: p.problemas.map((x) => (x.tipo === tipo ? { ...x, revisado: true } : x)),
  }));
}

/** El ⚠ se va sin cambiar nada más: «Dejar la de la guía». */
export function quitarProblema(id: string, tipo: TipoGuardado): Promise<Pedido | null> {
  return cambiarPedido(id, (p) => ({ ...p, problemas: sinTipos(p.problemas, [tipo]) }));
}

/** Los ⚠ del armado de la ruta recién confirmada (parada lejana, horario que no
 *  alcanza) reemplazan a los de antes, en todos los pedidos del día. Lo marcado
 *  «Va igual» sigue revisado si el problema sigue: no se vuelve a preguntar. */
export function fijarProblemasDeRuta(fecha: string, nuevos: Map<string, ProblemaGuardado[]>): Promise<void> {
  return enFila(async () => {
    const pedidos = await leerPedidos(fecha);
    const cambiados: Pedido[] = [];
    for (const p of pedidos) {
      const antes = p.problemas.filter((x) => x.tipo === "lejana" || x.tipo === "horario");
      const ahora = (nuevos.get(p.id) ?? []).map((x) => {
        const previo = antes.find((a) => a.tipo === x.tipo);
        return previo && "revisado" in previo && previo.revisado ? { ...x, revisado: true } : x;
      });
      if (antes.length === 0 && ahora.length === 0) continue;
      cambiados.push({ ...p, problemas: [...sinTipos(p.problemas, ["lejana", "horario"]), ...ahora] });
    }
    if (cambiados.length === 0) return;
    await escribir([STORES.pedidos], ({ guardar }) => {
      for (const p of cambiados) guardar(STORES.pedidos, p);
    });
  });
}
