// La ruta en curso se reordena sola cuando un receptor contesta (spec 010).
//
// El aviso de WhatsApp sale al confirmar la ruta, así que las respuestas llegan
// con el reparto andando. Dos cambian lo que hay que visitar:
//   · "Mañana": el pedido ya quedó no entregado (ver registrarDisponibilidad); acá
//     pasa con los cerrados y deja de ser una parada por visitar.
//   · Un bloque horario: el pedido sale de su lugar y entra donde se llega
//     dentro de su ventana (ver planificar.ts).
// Lo demás conserva el orden que eligió el conductor: no se baraja la ruta.

import { bloquePorId } from "@/lib/encomiendas/config";
import { resultadoCerrado } from "@/lib/encomiendas/estados";
import { deLngLat, type Coordenada } from "@/lib/geo/coordenada";
import { obtenerRutaCalles } from "@/lib/rutas";
import {
  fijarTrazado,
  leerPedidos,
  leerRuta,
  ordenarRuta,
  pedidosEnOrden,
  type Pedido,
  type Ruta,
} from "./almacen";
import {
  fueraDeHorario,
  metrosEstimados,
  minutoDelDia,
  ubicarConHorario,
  type PuntoDeRuta,
} from "./planificar";

/** Una respuesta ya aplicada que puede mover la ruta. */
export type RespuestaAplicada = { pedidoId: string; tipo: "manana" | "horario_indicado" };

type Ubicado = Pedido & PuntoDeRuta;

const ubicado = (p: Pedido): p is Ubicado => p.lat != null && p.lng != null;
const coord = (p: Ubicado): Coordenada => ({ lat: p.lat, lng: p.lng });

/** Desde dónde sigue la ruta: la última visita cerrada, o el inicio del trazado. */
function partida(ruta: Ruta, enRuta: Pedido[]): Coordenada | null {
  const ultima = enRuta
    .filter((p): p is Ubicado => resultadoCerrado(p.resultado) && ubicado(p) && p.horaResultado != null)
    .sort((a, b) => (b.horaResultado ?? "").localeCompare(a.horaResultado ?? ""))[0];
  if (ultima) return coord(ultima);
  return ruta.trazado?.[0] ? deLngLat(ruta.trazado[0]) : null;
}

/** Aplica a la ruta de `fecha` lo que cambiaron las respuestas y devuelve un
 *  aviso por respuesta, listo para mostrarle al conductor. */
export async function replanificarRuta(
  fecha: string,
  respuestas: RespuestaAplicada[],
  ahora: Date = new Date(),
): Promise<string[]> {
  if (respuestas.length === 0) return [];
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  const porId = new Map(pedidos.map((p) => [p.id, p] as const));

  let guardada: Ruta | null = null;
  let fuera = new Set<string>();
  if (ruta) {
    const enRuta = pedidosEnOrden(ruta, pedidos);
    const pendientes = enRuta.filter((p): p is Ubicado => !resultadoCerrado(p.resultado) && ubicado(p));
    const desde = partida(ruta, enRuta) ?? (pendientes[0] ? coord(pendientes[0]) : null);

    if (desde) {
      const metros = metrosEstimados(desde);
      const minuto = minutoDelDia(ahora);
      const nuevo = ubicarConHorario(
        pendientes.filter((p) => !bloquePorId(p.bloqueHorarioId)),
        pendientes.filter((p) => bloquePorId(p.bloqueHorarioId)),
        minuto,
        metros,
      );
      fuera = new Set(fueraDeHorario(nuevo, minuto, metros).map((p) => p.id));
      guardada = await ordenarRuta(fecha, nuevo.map((p) => p.id));
    }

    if (guardada && guardada.orden.join() !== ruta.orden.join()) {
      // El trazado gris con el orden nuevo. Sin señal queda el anterior: la línea
      // azul, hasta la parada activa, se recalcula sola contra el GPS.
      // Es un extra: el orden ya quedó guardado, y un error acá (sin token, sin
      // red) no puede impedir que el conductor vea el aviso del cambio.
      const inicio = ruta.trazado?.[0] ? deLngLat(ruta.trazado[0]) : null;
      const puntos = pedidosEnOrden(guardada, pedidos).filter(ubicado).map(coord);
      try {
        const calles = await obtenerRutaCalles(inicio ? [inicio, ...puntos] : puntos);
        if (calles) await fijarTrazado(fecha, calles);
      } catch {
        // Queda el trazado anterior.
      }
    }
  }

  const secuencia = guardada ? pedidosEnOrden(guardada, pedidos).map((p) => p.id) : [];
  return respuestas.flatMap(({ pedidoId, tipo }) => {
    const pedido = porId.get(pedidoId);
    if (!pedido) return [];
    if (tipo === "manana") return [`${pedido.nombre} pidió mañana: sale de la ruta de hoy.`];

    const bloque = bloquePorId(pedido.bloqueHorarioId)?.etiqueta ?? "otro horario";
    const lugar = secuencia.indexOf(pedidoId) + 1;
    if (lugar === 0) return [`${pedido.nombre} eligió ${bloque}.`];
    if (fuera.has(pedidoId)) {
      return [`${pedido.nombre} eligió ${bloque} y no se alcanza: llámalo. Quedó en la parada ${lugar}.`];
    }
    return [`${pedido.nombre} (${bloque}) pasa a la parada ${lugar}.`];
  });
}
