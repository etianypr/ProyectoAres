// Pedidos que entran o vuelven a la ruta en curso SIN rehacerla (spec 017, R4).
//
//   · "Dejar como pendiente": la parada se reintenta donde menos alarga, al menos
//     media hora más adelante (antes iba al final, aunque el final quedara al
//     otro lado de la ciudad).
//   · Un pedido que llegó con la ruta andando: entra donde menos alarga, sin
//     mover la parada que se está atendiendo (antes había que rehacer todo).
//   · «Hacer ahora» (spec 023): una parada cercana pasa a ser la próxima.
//
// Con distancias estimadas (línea recta × 1,3): corre sin señal y en el acto.

import { resultadoCerrado } from "@/lib/encomiendas/estados";
import { deLngLat, type Coordenada } from "@/lib/geo/coordenada";
import { metrosEnMemoria } from "@/lib/geo/matriz";
import { leerPedidos, leerRuta, ordenarRuta, pedidosEnOrden, type Pedido } from "./almacen";
import { retrazarRuta } from "./reubicar";
import { lugarMasBarato, lugarParaReintentar, metrosEstimados, vueltaEstimada, type MetrosEntre, type PuntoDeRuta, type VueltaDesde } from "./planificar";

type Ubicado = Pedido & PuntoDeRuta;
const ubicado = (p: Pedido): p is Ubicado => p.lat != null && p.lng != null;
const coord = (p: Ubicado): Coordenada => ({ lat: p.lat, lng: p.lng });

/** Deja la parada para más tarde. Devuelve en qué lugar de lo pendiente quedó
 *  (1 = la próxima), o null si fue al final. */
export async function dejarParaMasTarde(fecha: string, pedidoId: string): Promise<number | null> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  const pendientes = pedidosEnOrden(ruta, pedidos).filter((p) => !resultadoCerrado(p.resultado));
  const pedido = pendientes.find((p) => p.id === pedidoId);
  if (!pedido) throw new Error("Ese pedido no está en la ruta del día.");
  const resto = pendientes.filter((p) => p.id !== pedidoId);

  // Sin coordenadas no hay cómo medir: al final, como siempre.
  const lugar =
    ubicado(pedido) && resto.every(ubicado)
      ? lugarParaReintentar(resto as Ubicado[], pedido, ...distanciasDelDia(coord(pedido), ruta.partida ?? null))
      : resto.length;
  const ids = resto.map((p) => p.id);
  ids.splice(lugar, 0, pedidoId);
  await ordenarRuta(fecha, ids);
  return lugar < resto.length ? lugar + 1 : null;
}

/** Las distancias para reubicar una parada: por calle si ya se pidieron hoy (la
 *  matriz del día queda en memoria), y si no, la estimación en línea recta.
 *  Simulado en una ruta real de 66 paradas, decidir por calle deja el reintento
 *  entre 0,8 y 1,5 km más corto por día (terreno 2026-10-29). */
function distanciasDelDia(desde: Coordenada, partida: Coordenada | null): [MetrosEntre, VueltaDesde | undefined] {
  const estimado = metrosEstimados(desde);
  const metros: MetrosEntre = (a, b) => metrosEnMemoria(a ?? desde, b) ?? estimado(a, b);
  if (!partida) return [metros, undefined];
  const vueltaEstimadaDesde = vueltaEstimada(partida, desde);
  return [metros, (p) => metrosEnMemoria(p ?? desde, partida) ?? vueltaEstimadaDesde(p)];
}

/** «Hacer ahora» (spec 023): el pedido pasa a ser la próxima parada, justo
 *  después de la que se está atendiendo; si estaba fuera de la ruta, entra. El
 *  trazado no se pide acá: la pantalla lo rehace en segundo plano (retrazarRuta,
 *  spec 033), para que el orden quede al tiro aunque no haya señal. */
export async function hacerAhora(fecha: string, pedidoId: string): Promise<void> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  if (pedidos.find((p) => p.id === pedidoId)?.resultado !== "pendiente") {
    throw new Error("Ese pedido ya no está pendiente.");
  }
  const ids = pedidosEnOrden(ruta, pedidos)
    .filter((p) => !resultadoCerrado(p.resultado) && p.id !== pedidoId)
    .map((p) => p.id);
  ids.splice(Math.min(1, ids.length), 0, pedidoId);
  await ordenarRuta(fecha, ids);
}

/** Una parada cerrada que se pasó a «Pendiente» (spec 033, G5): vuelve donde menos
 *  alarga, sin mover la parada activa, como un pedido que llega tarde. Devuelve su
 *  número de parada. El trazado lo rehace la pantalla (retrazarRuta). */
export async function volverALaRuta(fecha: string, pedidoId: string): Promise<number | null> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  if (!ruta) return null;
  const pedido = pedidos.find((p) => p.id === pedidoId);
  if (!pedido || pedido.resultado !== "pendiente") return null;
  const pendientes = pedidosEnOrden(ruta, pedidos).filter((p) => !resultadoCerrado(p.resultado) && p.id !== pedidoId);
  const orden = pendientes.filter(ubicado);
  const sinPunto = pendientes.filter((p) => !ubicado(p));
  if (ubicado(pedido)) {
    const desde = orden[0] ? coord(orden[0]) : coord(pedido);
    const vuelta = ruta.partida ? vueltaEstimada(ruta.partida, desde) : undefined;
    const lugar = orden.length > 0 ? lugarMasBarato(orden.slice(1), pedido, metrosEstimados(desde), 0, vuelta) + 1 : 0;
    orden.splice(lugar, 0, pedido);
  } else {
    sinPunto.push(pedido);
  }
  const guardada = await ordenarRuta(fecha, [...orden, ...sinPunto].map((p) => p.id));
  const i = guardada ? guardada.orden.indexOf(pedidoId) : -1;
  return i < 0 ? null : i + 1;
}

/** Los pedidos pendientes del día que no están en la ruta y tienen punto. */
export function fueraDeLaRuta(pedidos: Pedido[], orden: string[]): Ubicado[] {
  const enRuta = new Set(orden);
  return pedidos.filter((p): p is Ubicado => p.resultado === "pendiente" && !enRuta.has(p.id) && ubicado(p));
}

/** Suma a la ruta en curso los pedidos de afuera que tienen punto, cada uno
 *  donde menos alarga y sin pasar adelante de la parada que se está atendiendo.
 *  Devuelve cuántos entraron. */
export async function sumarALaRuta(fecha: string): Promise<number> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  const nuevos = fueraDeLaRuta(pedidos, ruta.orden);
  if (nuevos.length === 0) return 0;

  const pendientes = pedidosEnOrden(ruta, pedidos).filter((p) => !resultadoCerrado(p.resultado));
  const orden = pendientes.filter(ubicado);
  const sinPunto = pendientes.filter((p) => !ubicado(p));
  // Desde dónde se mide el primer tramo: la parada activa, o el inicio del trazado.
  const inicio = ruta.trazado?.[0] ? deLngLat(ruta.trazado[0]) : coord(nuevos[0]);
  const metros = metrosEstimados(orden[0] ? coord(orden[0]) : inicio);
  // La ruta vuelve a la base: el final no es gratis (ver Ruta.partida).
  const vuelta = ruta.partida ? vueltaEstimada(ruta.partida, orden[0] ? coord(orden[0]) : inicio) : undefined;
  for (const p of nuevos) {
    // La parada activa (la primera) no se mueve: el botón que el conductor está
    // por tocar es de ella.
    const lugar = orden.length > 0 ? lugarMasBarato(orden.slice(1), p, metros, 0, vuelta) + 1 : 0;
    orden.splice(lugar, 0, p);
  }

  const guardada = await ordenarRuta(fecha, [...orden, ...sinPunto].map((p) => p.id));

  // El trazado gris con las paradas nuevas (reubicar.ts, el mismo de «Ahora» y
  // del Deshacer): la red propia y ORS de respaldo (spec 031). Es un extra: si
  // ninguno puede, queda el anterior.
  if (guardada) await retrazarRuta(fecha);
  return nuevos.length;
}
