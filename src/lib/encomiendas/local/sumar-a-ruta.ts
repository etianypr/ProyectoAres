// Pedidos que entran o vuelven a la ruta en curso SIN rehacerla (spec 017, R4).
//
//   · "Dejar como pendiente": la parada se reintenta donde menos alarga, al menos
//     media hora más adelante (antes iba al final, aunque el final quedara al
//     otro lado de la ciudad).
//   · Un pedido que llegó con la ruta andando: entra donde menos alarga, sin
//     mover la parada que se está atendiendo (antes había que rehacer todo).
//
// Con distancias estimadas (línea recta × 1,3): corre sin señal y en el acto.

import { resultadoCerrado } from "@/lib/encomiendas/estados";
import { deLngLat, type Coordenada } from "@/lib/geo/coordenada";
import { obtenerRutaCalles } from "@/lib/geo/mapbox/direcciones";
import { fijarTrazado, leerPedidos, leerRuta, ordenarRuta, pedidosEnOrden, type Pedido } from "./almacen";
import { lugarMasBarato, lugarParaReintentar, metrosEstimados, vueltaEstimada, type PuntoDeRuta } from "./planificar";

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
      ? lugarParaReintentar(
          resto as Ubicado[],
          pedido,
          metrosEstimados(coord(pedido)),
          ruta.partida ? vueltaEstimada(ruta.partida, coord(pedido)) : undefined,
        )
      : resto.length;
  const ids = resto.map((p) => p.id);
  ids.splice(lugar, 0, pedidoId);
  await ordenarRuta(fecha, ids);
  return lugar < resto.length ? lugar + 1 : null;
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

  // El trazado gris con las paradas nuevas. Es un extra: sin señal queda el
  // anterior y la línea azul hasta la parada activa se recalcula sola.
  if (guardada) {
    try {
      const puntos = pedidosEnOrden(guardada, pedidos).filter(ubicado).map(coord);
      const calles = await obtenerRutaCalles([inicio, ...puntos, ...(ruta.partida ? [ruta.partida] : [])]);
      if (calles) await fijarTrazado(fecha, calles);
    } catch {
      // Queda el trazado anterior.
    }
  }
  return nuevos.length;
}
