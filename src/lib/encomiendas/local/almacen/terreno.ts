// Marcar en terreno: las dos operaciones que mueven plata.
//
// Llamada y resultado viven en el pedido (spec 009): marcar escribe el pedido y
// el evento de la cola en UNA transacción, y no toca la ruta, que solo guarda
// el orden de visita.

import { tipoEventoDe, type ResultadoMarcable } from "@/lib/encomiendas/estados";
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
  return enRuta.every((p) => p.llamada === "pendiente" && !p.horaLlamada && p.resultado === "pendiente");
}

/** Qué pedido se marca: lo usan las operaciones de terreno. */
type MarcaPedido = {
  fecha: string;
  pedidoId: string;
  conductorId: string;
};

/** La ruta del día con el pedido adentro, o un error mostrable. */
async function rutaConPedido(fecha: string, pedidoId: string) {
  const [ruta, pedido] = await Promise.all([leerRuta(fecha), leerPedido(pedidoId)]);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  if (!pedido) throw new Error("El pedido ya no existe en este dispositivo.");
  if (!ruta.orden.includes(pedidoId)) throw new Error("El pedido no está en la ruta del día.");
  return { ruta, pedido };
}

/** El conductor llamó al destinatario. Desde la spec 020 no se anota si contestó
 *  (el dueño, 2026-11-06: no ayuda a repartir): se guarda la hora de la primera
 *  llamada —"ya se lo llamó"— y, si es lo primero del día en terreno, el evento
 *  que prueba que el conductor salió (ver esPrimeraAccion). Volver a llamar no
 *  escribe nada. */
export function registrarLlamada({ fecha, pedidoId, conductorId }: MarcaPedido): Promise<void> {
  return enFila(async () => {
    const { ruta, pedido } = await rutaConPedido(fecha, pedidoId);
    if (pedido.horaLlamada) return;
    const primera = esPrimeraAccion(pedidosEnOrden(ruta, await leerPedidos(fecha)));
    const hora = new Date().toISOString();
    await escribir([STORES.pedidos, STORES.cola], ({ guardar }) => {
      guardar(STORES.pedidos, { ...pedido, horaLlamada: hora });
      if (primera) guardar(STORES.cola, nuevoEvento(conductorId, fecha, "llamada", hora));
    });
  });
}

/** Cierra la visita de un pedido.
 *
 *  Entregado o no entregado, cierra el pedido del día: lo no entregado se tacha
 *  y no pasa a mañana; si vuelve a salir, se escanea de nuevo (specs 009 y 012).
 *  El evento para el servidor sale en la misma transacción. */
export function marcarResultado(
  { fecha, pedidoId, conductorId }: MarcaPedido,
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
    const registro: ActividadPorEnviar = {
      ...nuevoEvento(conductorId, fecha, tipoEventoDe(resultado), hora),
      ...(retenerMs > 0 ? { retenidoHasta: new Date(Date.now() + retenerMs).toISOString() } : {}),
    };
    // El id del evento queda en el pedido: con él se corrige después aunque ya se
    // haya enviado (spec 033, G5, correccion.ts).
    const actualizado: Pedido = { ...pedido, resultado: resultado, horaResultado: hora, eventoResultado: registro.id };

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
    // Vencida la retención el evento ya puede estar subiendo (el envío corre
    // fuera de esta fila): borrarlo acá y volver a marcar contaría la entrega
    // dos veces en el servidor (spec 017, E2). Sin retención no hay deshacer.
    if (!enCola.retenidoHasta || enCola.retenidoHasta <= new Date().toISOString()) return false;

    // Si este era el último pedido, marcarlo cerró el día (ver la pantalla
    // del conductor). Al reabrirlo, el día vuelve a estar en curso: sin esto el
    // servidor valoraría un día que todavía tiene una entrega por hacer.
    const reabierta: Ruta = { ...ruta, cierre: null };

    await escribir([STORES.rutas, STORES.pedidos, STORES.cola], ({ guardar, borrar }) => {
      guardar(STORES.rutas, reabierta);
      guardar(STORES.pedidos, { ...pedido, resultado: "pendiente", horaResultado: null, eventoResultado: null });
      borrar(STORES.cola, eventoId);
    });

    return true;
  });
}
