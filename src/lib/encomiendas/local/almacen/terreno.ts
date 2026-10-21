// Marcar en terreno: las dos operaciones que mueven plata.
//
// Llamada y resultado viven en el pedido (spec 009): marcar escribe el pedido y
// el evento de la cola en UNA transacción, y no toca la ruta, que solo guarda
// el orden de visita.

import {
  tipoEventoDe,
  type ResultadoMarcable,
  type ResultadoLlamada,
} from "@/lib/encomiendas/estados";
import { STORES, escribir, leerUno } from "../idb";
import { nuevoEvento } from "./cola";
import { enFila } from "./fila";
import { leerPedido, leerPedidos, leerRuta, pedidosEnOrden } from "./lecturas";
import type { ActividadPorEnviar, Pedido, Ruta } from "./tipos";

/** Si en todo el día no se cerró ni se llamó nada todavía, este es el primer
 *  acto en terreno: hay que dejar constancia en el servidor de que el conductor
 *  salió, aunque después no logre entregar nada (de eso depende el fijo
 *  diario). Después del primero ya no hace falta: cualquier evento del día
 *  prueba lo mismo. */
function esPrimeraAccion(enRuta: Pedido[]): boolean {
  return enRuta.every((p) => p.llamada === "pendiente" && p.resultado === "pendiente");
}

/** Qué pedido se marca: lo usan las operaciones de terreno. */
export type MarcaPedido = {
  fecha: string;
  pedidoId: string;
  choferId: string;
};

/** La ruta del día con el pedido adentro, o un error mostrable. */
async function rutaConPedido(fecha: string, pedidoId: string) {
  const [ruta, pedido] = await Promise.all([leerRuta(fecha), leerPedido(pedidoId)]);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  if (!pedido) throw new Error("Ese pedido ya no existe en este teléfono.");
  if (!ruta.orden.includes(pedidoId)) throw new Error("Ese pedido no está en la ruta del día.");
  return { ruta, pedido };
}

/** Registra el resultado de llamar al destinatario. No suma ni resta entregas:
 *  solo prueba que el conductor está trabajando (ver esPrimeraAccion). */
export function marcarLlamada(
  { fecha, pedidoId, choferId }: MarcaPedido,
  resultado: Exclude<ResultadoLlamada, "pendiente">,
): Promise<void> {
  return enFila(async () => {
    const { ruta, pedido } = await rutaConPedido(fecha, pedidoId);
    const primera = esPrimeraAccion(pedidosEnOrden(ruta, await leerPedidos(fecha)));

    const hora = new Date().toISOString();
    const actualizado: Pedido = { ...pedido, llamada: resultado, horaLlamada: hora };

    await escribir([STORES.pedidos, STORES.cola], ({ guardar }) => {
      guardar(STORES.pedidos, actualizado);
      if (primera) guardar(STORES.cola, nuevoEvento(choferId, fecha, "llamada", hora));
    });
  });
}

/** Cierra la visita de un pedido.
 *
 *  Entregado o no entregado, cierra el pedido del día: lo no entregado se tacha
 *  y no pasa a mañana; si vuelve a salir, se escanea de nuevo (specs 009 y 012).
 *  El evento para el servidor sale en la misma transacción. */
export function marcarResultado(
  { fecha, pedidoId, choferId }: MarcaPedido,
  resultado: ResultadoMarcable,
  /** Milisegundos que el evento queda retenido en la cola antes de poder
   *  salir: la ventana en la que el conductor puede deshacer (ver leerCola). 0
   *  lo deja listo para el próximo envío. */
  retenerMs = 0,
): Promise<string | null> {
  return enFila(async () => {
    const { pedido } = await rutaConPedido(fecha, pedidoId);
    // Marcar dos veces el mismo pedido duplicaría el evento y por lo tanto el
    // conteo: el id del evento sería nuevo, así que la idempotencia del servidor
    // no lo frenaría. Se corta acá.
    //
    // Este guardia solo vale porque la lectura de arriba y la escritura de abajo
    // corren sin que se meta otra marca en el medio; eso lo garantiza enFila
    // (ver su comentario). Sin la fila, dos toques simultáneos leían los dos
    // "pendiente" y pasaban los dos.
    if (pedido.resultado !== "pendiente") return null;

    const hora = new Date().toISOString();
    const actualizado: Pedido = { ...pedido, resultado: resultado, horaResultado: hora };

    const registro: ActividadPorEnviar = {
      ...nuevoEvento(choferId, fecha, tipoEventoDe(resultado), hora),
      ...(retenerMs > 0 ? { retenidoHasta: new Date(Date.now() + retenerMs).toISOString() } : {}),
    };

    await escribir([STORES.pedidos, STORES.cola], ({ guardar }) => {
      guardar(STORES.pedidos, actualizado);
      guardar(STORES.cola, registro);
    });

    return registro.id;
  });
}

/** Reabre una visita que se acaba de cerrar: vuelve el pedido a pendiente,
 *  borra su evento de la cola y reabre el día si ese cierre había sido el
 *  último.
 *
 *  Solo tiene sentido dentro de la ventana de retención (ver marcarResultado):
 *  pasada esa ventana el evento ya salió al servidor, y ahí borrarlo del
 *  teléfono dejaría las dos partes contando cosas distintas. Por eso se comprueba
 *  que el evento SIGA en la cola; si no está, no se toca nada. */
export function deshacerResultado(
  { fecha, pedidoId }: { fecha: string; pedidoId: string },
  eventoId: string,
): Promise<boolean> {
  return enFila(async () => {
    const [ruta, pedido, enCola] = await Promise.all([
      leerRuta(fecha),
      leerPedido(pedidoId),
      leerUno(STORES.cola, eventoId),
    ]);
    if (!ruta || !pedido || !enCola) return false;

    // Si este era el último pedido, marcarlo cerró el día (ver la pantalla
    // del conductor). Al reabrirlo, el día vuelve a estar en curso: sin esto el
    // servidor valoraría un día que todavía tiene una entrega por hacer.
    const reabierta: Ruta = { ...ruta, cierre: null };

    await escribir([STORES.rutas, STORES.pedidos, STORES.cola], ({ guardar, borrar }) => {
      guardar(STORES.rutas, reabierta);
      guardar(STORES.pedidos, { ...pedido, resultado: "pendiente", horaResultado: null });
      borrar(STORES.cola, eventoId);
    });

    return true;
  });
}

/** Manda un pedido al final del recorrido, sin cerrarlo. Es lo que pasa cuando
 *  el destinatario no contesta y el conductor decide reintentar al terminar: el
 *  pedido sigue pendiente, solo cambia de lugar en la fila.
 *
 *  No toca el trazado: la línea gris del día queda dibujada en el orden viejo
 *  hasta que se rehaga la ruta. La que importa manejando —la azul, hasta la
 *  parada activa— se recalcula sola contra la posición del conductor. */
export function moverAlFinal({
  fecha,
  pedidoId,
}: {
  fecha: string;
  pedidoId: string;
}): Promise<void> {
  return enFila(async () => {
    const ruta = await leerRuta(fecha);
    if (!ruta) throw new Error("No hay una ruta para ese día.");
    if (!ruta.orden.includes(pedidoId)) throw new Error("Ese pedido no está en la ruta del día.");

    const actualizada: Ruta = {
      ...ruta,
      orden: [...ruta.orden.filter((id) => id !== pedidoId), pedidoId],
    };

    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, actualizada));
  });
}
