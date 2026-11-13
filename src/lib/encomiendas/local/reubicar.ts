// Mover una parada de la ruta en curso y volver atrás (spec 033, G3). Todo es del
// teléfono: no hay evento en la cola, así que «Deshacer» es volver al orden de
// antes (`volverAlOrden`).
//
//   · Cambió la dirección de una parada (> 150 m): entra donde menos alarga, como
//     un pedido que llega tarde (sumarALaRuta), sin mover la parada activa.
//   · «Pidió otra hora»: el bloque va en los campos de siempre (disponibilidad
//     «horario_indicado»), y la ruta se reordena como con una respuesta de
//     WhatsApp (replanificarRuta), respetando el bloque.
//
// El orden no cambia de algoritmo: lugarMasBarato y ubicarConHorario, los mismos
// de antes. Distancias estimadas: corre sin señal y en el acto.

import { resultadoCerrado } from "@/lib/encomiendas/estados";
import { deLngLat, distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { rutaPorCalles } from "@/lib/geo/ruta-por-calles";
import {
  anotarHorario,
  fijarTrazado,
  leerPedidos,
  leerRuta,
  ordenarRuta,
  pedidosEnOrden,
  tramosConPedidos,
  type Pedido,
  type Ruta,
} from "./almacen";
import { lugarMasBarato, metrosEstimados, vueltaEstimada, type PuntoDeRuta } from "./planificar";
import { replanificarRuta } from "./replanificar";

/** Más que esto entre el punto de antes y el nuevo es otro lugar: la parada se
 *  reubica. Menos es corregir la puerta en la misma cuadra. */
export const METROS_OTRO_LUGAR = 150;

type Ubicado = Pedido & PuntoDeRuta;
const ubicado = (p: Pedido): p is Ubicado => p.lat != null && p.lng != null;
const coord = (p: Ubicado): Coordenada => ({ lat: p.lat, lng: p.lng });

/** Lo que el pedido tenía antes de «Pidió otra hora», para deshacerlo. */
export type HorarioAntes = Pick<Pedido, "id" | "disponibilidad" | "bloqueHorarioId">;

/** Un cambio de orden que se puede deshacer: el orden de lo pendiente de antes. */
export type Reorden = { ordenAntes: string[]; horarioAntes?: HorarioAntes };

/** Los pendientes de la ruta, en orden. */
export function ordenPendiente(ruta: Ruta | null, pedidos: Pedido[]): string[] {
  return pedidosEnOrden(ruta, pedidos)
    .filter((p) => !resultadoCerrado(p.resultado))
    .map((p) => p.id);
}

export async function leerOrdenPendiente(fecha: string): Promise<string[]> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  return ordenPendiente(ruta, pedidos);
}

/** El número de parada de un pedido (1 = la primera del día, como en la lista). */
async function paradaDe(fecha: string, pedidoId: string): Promise<number | null> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  const i = pedidosEnOrden(ruta, pedidos).findIndex((p) => p.id === pedidoId);
  return i < 0 ? null : i + 1;
}

/** El trazado gris con el orden guardado. Lo dibuja la red propia (spec 031: sin
 *  señal ni cupo) y ORS solo de respaldo; si ninguno puede, queda el anterior y la
 *  línea azul hasta la parada activa se recalcula sola. Devuelve si lo cambió. Es
 *  el mismo trazado que usa sumarALaRuta. */
export async function retrazarRuta(fecha: string): Promise<boolean> {
  try {
    const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
    if (!ruta) return false;
    const ubicados = pedidosEnOrden(ruta, pedidos).filter(ubicado);
    const inicio = ruta.trazado?.[0] ? deLngLat(ruta.trazado[0]) : ubicados[0] ? coord(ubicados[0]) : null;
    if (!inicio || ubicados.length === 0) return false;
    const calles = await rutaPorCalles([inicio, ...ubicados.map(coord), ...(ruta.partida ? [ruta.partida] : [])]);
    if (!calles) return false;
    // A qué pedido llega cada tramo (spec 020): la partida y la vuelta no son pedidos.
    const tramos = tramosConPedidos(calles.tramos, [null, ...ubicados.map((p) => p.id), null]);
    await fijarTrazado(fecha, { ...calles, tramos });
    return true;
  } catch {
    return false;
  }
}

/** «Deshacer»: lo pendiente vuelve al orden de antes (y el horario, si se anotó
 *  uno). Lo que se cerró en el medio queda cerrado: ordenarRuta no lo mueve. */
export async function volverAlOrden(fecha: string, reorden: Reorden): Promise<void> {
  const h = reorden.horarioAntes;
  if (h) await anotarHorario(h.id, { disponibilidad: h.disponibilidad, bloqueHorarioId: h.bloqueHorarioId });
  await ordenarRuta(fecha, reorden.ordenAntes);
}

/** Desde dónde sigue la ruta: la última visita cerrada, o el inicio del trazado. */
function desdeDonde(ruta: Ruta, enRuta: Pedido[]): Coordenada | null {
  const ultima = enRuta
    .filter((p): p is Ubicado => resultadoCerrado(p.resultado) && ubicado(p) && p.horaResultado != null)
    .sort((a, b) => (b.horaResultado ?? "").localeCompare(a.horaResultado ?? ""))[0];
  if (ultima) return coord(ultima);
  return ruta.trazado?.[0] ? deLngLat(ruta.trazado[0]) : null;
}

export type ResultadoReubicar =
  | { tipo: "igual" }
  /** Es la parada activa: el conductor elige «Seguir con esta» o «Moverla». */
  | { tipo: "activa" }
  | ({ tipo: "movida"; parada: number } & Reorden);

/** Cambió el punto de un pedido de la ruta (spec 033, cambio-dir-ruta). Si quedó
 *  a más de METROS_OTRO_LUGAR del de antes, entra donde menos alarga. La parada
 *  activa no se mueve sola: con `moverActiva` sí. */
export async function reubicarPorPunto(
  fecha: string,
  pedidoId: string,
  antes: Coordenada,
  { moverActiva = false }: { moverActiva?: boolean } = {},
): Promise<ResultadoReubicar> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  if (!ruta) return { tipo: "igual" };
  const enRuta = pedidosEnOrden(ruta, pedidos);
  const pendientes = enRuta.filter((p) => !resultadoCerrado(p.resultado));
  const i = pendientes.findIndex((p) => p.id === pedidoId);
  const pedido = pendientes[i];
  if (!pedido || !ubicado(pedido) || distanciaMetros(antes, coord(pedido)) <= METROS_OTRO_LUGAR) return { tipo: "igual" };
  if (i === 0 && !moverActiva) return { tipo: "activa" };

  const ordenAntes = pendientes.map((p) => p.id);
  const resto = pendientes.filter((p) => p.id !== pedidoId);
  // La activa (la primera) no se mueve por el cambio de OTRA parada: el botón que
  // el conductor está por tocar es de ella.
  const fijas = i === 0 ? 0 : 1;
  const candidatas = resto.slice(fijas).filter(ubicado);
  const activa = fijas === 1 && resto[0] && ubicado(resto[0]) ? resto[0] : null;
  const desde = activa ? coord(activa) : (desdeDonde(ruta, enRuta) ?? antes);
  const metros = metrosEstimados(desde);
  // La ruta vuelve a la base: el final no es gratis (ver Ruta.partida).
  const vuelta = ruta.partida ? vueltaEstimada(ruta.partida, desde) : undefined;
  const lugar = lugarMasBarato(candidatas, pedido, metros, 0, vuelta);
  const indice = lugar === 0 ? fijas : resto.indexOf(candidatas[lugar - 1]) + 1;

  const ids = resto.map((p) => p.id);
  ids.splice(indice, 0, pedidoId);
  await ordenarRuta(fecha, ids);
  return { tipo: "movida", parada: (await paradaDe(fecha, pedidoId)) ?? indice + 1, ordenAntes };
}

/** «Pidió otra hora» (spec 033, otra-hora): anota el bloque y la parada entra
 *  donde se la atiende dentro de él. Devuelve en qué parada quedó y cómo
 *  deshacerlo. No sale nada del teléfono. */
export async function pedirOtraHora(
  fecha: string,
  pedidoId: string,
  bloqueHorarioId: string,
  ahora: Date = new Date(),
): Promise<{ parada: number | null } & Reorden> {
  const ordenAntes = await leerOrdenPendiente(fecha);
  const antes = await anotarHorario(pedidoId, { disponibilidad: "horario_indicado", bloqueHorarioId });
  if (!antes) throw new Error("Ese pedido ya no está pendiente.");
  // Sin el trazado: lo rehace la pantalla en segundo plano (retrazarRuta).
  await replanificarRuta(fecha, [{ pedidoId, tipo: "horario_indicado" }], ahora, { trazar: false });
  return { parada: await paradaDe(fecha, pedidoId), ordenAntes, horarioAntes: { id: pedidoId, ...antes } };
}
