// Cambiar el estado de un pedido ya cerrado (spec 033, G5; dueño, 2026-11-13):
// una parada ✓ o ✕ de la «Ruta del día» pasa a entregado, no entregado o
// pendiente.
//
// El resultado mueve plata, así que se corrige con la misma regla que el resto
// de la cola: nada se borra del servidor sin que el servidor lo confirme.
//
//   · Si el evento todavía no salió (retenido o rechazado), se quita de la cola,
//     como hace deshacerResultado.
//   · Si pudo salir (o está saliendo), en la cola queda una corrección con el
//     mismo id (`borrar: true`): enviar.ts lo borra del servidor por su id, con
//     o sin señal en este momento. La policy de delete del conductor (0002)
//     deja borrar los propios de las últimas 12 h; por eso no se ofrece pasado
//     PLAZO_CORREGIR_MS.
//   · El estado nuevo, si es entregado o no entregado, es un evento nuevo con su
//     propio id. Pendiente reabre la parada y, si el día estaba cerrado, el día.

import { resultadoCerrado, tipoEventoDe, type ResultadoMarcable, type ResultadoVisita } from "@/lib/encomiendas/estados";
import { STORES, escribir, leerUno } from "../idb";
import { nuevoEvento } from "./cola";
import { enFila } from "./fila";
import { leerPedido, leerRuta } from "./lecturas";
import type { ActividadPorEnviar, Pedido, Ruta } from "./tipos";

/** Hasta cuándo se ofrece cambiar un resultado: el servidor deja borrar 12 h
 *  después de la hora del evento; media hora de margen para que la corrección
 *  alcance a salir si se hace con poca señal. */
export const PLAZO_CORREGIR_MS = 11.5 * 60 * 60 * 1000;

/** Si la parada cerrada se puede cambiar todavía: con el id de su evento (los
 *  cerrados antes de G5 no lo tienen) y dentro del plazo. */
export function sePuedeCambiar(pedido: Pedido, ahora = Date.now()): boolean {
  if (!resultadoCerrado(pedido.resultado) || !pedido.eventoResultado || !pedido.horaResultado) return false;
  return ahora - Date.parse(pedido.horaResultado) < PLAZO_CORREGIR_MS;
}

/** Cambia el resultado de una parada cerrada. Devuelve false si ya no se podía
 *  (fuera de plazo, el pedido o la ruta ya no están, o ya tenía ese estado). */
export function cambiarResultado(
  { fecha, pedidoId, conductorId }: { fecha: string; pedidoId: string; conductorId: string },
  nuevo: ResultadoVisita,
): Promise<boolean> {
  return enFila(async () => {
    const [ruta, pedido] = await Promise.all([leerRuta(fecha), leerPedido(pedidoId)]);
    if (!ruta || !pedido || !ruta.orden.includes(pedidoId)) return false;
    if (!sePuedeCambiar(pedido) || pedido.resultado === nuevo) return false;
    const eventoId = pedido.eventoResultado as string;
    const enCola = await leerUno(STORES.cola, eventoId);

    const ahora = new Date().toISOString();
    // Sin salir todavía: retenido (el «Deshacer» a la vista o la app atrás) o
    // rechazado (el servidor no lo tiene). Lo demás pudo llegar: se borra allá.
    const sinSalir = enCola != null && !enCola.borrar && (enCola.rechazado != null || (enCola.retenidoHasta ?? "") > ahora);
    const correccion: ActividadPorEnviar = {
      id: eventoId,
      conductorId: enCola?.conductorId ?? conductorId,
      fecha: enCola?.fecha ?? pedido.fecha,
      tipo: enCola?.tipo ?? tipoEventoDe(pedido.resultado as ResultadoMarcable),
      hora: enCola?.hora ?? (pedido.horaResultado as string),
      borrar: true,
    };

    const evento = nuevo === "pendiente" ? null : nuevoEvento(conductorId, fecha, tipoEventoDe(nuevo), ahora);
    const actualizado: Pedido = evento
      ? { ...pedido, resultado: nuevo, horaResultado: ahora, eventoResultado: evento.id }
      : { ...pedido, resultado: "pendiente", horaResultado: null, eventoResultado: null };
    // Reabrir una parada reabre el día, como deshacer o sumar (el servidor no
    // valora un día con una entrega por hacer).
    const rutaNueva: Ruta | null = nuevo === "pendiente" && ruta.cierre != null ? { ...ruta, cierre: null } : null;

    await escribir([STORES.rutas, STORES.pedidos, STORES.cola], ({ guardar, borrar }) => {
      if (rutaNueva) guardar(STORES.rutas, rutaNueva);
      guardar(STORES.pedidos, actualizado);
      if (sinSalir) borrar(STORES.cola, eventoId);
      else guardar(STORES.cola, correccion);
      if (evento) guardar(STORES.cola, evento);
    });
    return true;
  });
}
