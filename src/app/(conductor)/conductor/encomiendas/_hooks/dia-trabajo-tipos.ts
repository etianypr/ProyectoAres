// Lo que la pantalla del conductor recibe del día en curso (sale de
// use-dia-trabajo.ts, spec 002 T041).

import type { Pedido, PedidoEliminado, Ruta } from "@/lib/encomiendas/local/almacen";
import type { ResultadoMarcable, ResultadoVisita } from "@/lib/encomiendas/estados";

/** Un pedido de la ruta listo para mostrar: su lugar en el recorrido y si hay
 *  que contactarlo. La llamada y el resultado están en el pedido. */
export type Parada = {
  /** Orden de visita, empezando en 1. */
  secuencia: number;
  pedido: Pedido;
  /** Si hay que contactar al receptor antes de llegar: no contestó el WhatsApp
   *  y tampoco se lo llamó todavía. Es lo que dispara el aviso de aproximación
   *  (FR-017). */
  hayQueContactar: boolean;
};

export type DiaEnCurso = {
  /** Todavía no se sabe qué hay guardado para esta fecha. */
  cargando: boolean;
  /** El teléfono no pudo entregar lo guardado (modo privado, sin espacio). */
  error: string | null;
  ruta: Ruta | null;
  pedidos: Pedido[];
  /** Los pedidos de la ruta, en orden de visita. */
  paradas: Parada[];
  /** La primera pendiente: a la que hay que ir ahora. */
  activa: Parada | null;
  /** Cuántas entregas quedaron guardadas sin llegar al servidor. */
  sinEnviar: number;
  /** Último fallo del envío (spec 017, E8). */
  errorEnvio: string | null;
  /** Registros que el servidor rechazó y quedaron aparte. */
  rechazados: number;
  /** Correcciones que el servidor no aceptó: pasó el plazo de 12 h (spec 033, G5). */
  correccionesRechazadas: number;
  enviando: boolean;
  intentar: () => void;
  recargar: () => Promise<void>;
  /** Último fallo de WhatsApp, mostrable. No es una alarma: el sondeo reintenta
   *  solo y el conductor siempre puede llamar. */
  errorWhatsapp: string | null;
  /** true mientras hay un envío o una sincronización en vuelo. */
  avisando: boolean;
  /** Manda el aviso a los pedidos que entraron en la ruta y todavía no lo
   *  tienen. Se llama al confirmar una ruta (FR-007). */
  avisarPedidos: (pedidoIds: string[]) => Promise<void>;
  /** Se lo llamó: la hora de la primera llamada (no se anota si contestó, spec 020). */
  registrarLlamada: (pedidoId: string) => Promise<void>;
  /** Cierra una parada con uno de los cuatro resultados y devuelve el
   *  identificador para deshacerla, o null si ya estaba cerrada (o si el toque
   *  llegó mientras el anterior estaba en vuelo).
   *
   *  El evento queda retenido MS_DESHACER; hasta que venza, ni sale al servidor
   *  ni se cierra el día. */
  marcarResultado: (pedidoId: string, resultado: ResultadoMarcable) => Promise<string | null>;
  /** Lo que las respuestas de WhatsApp le cambiaron a la ruta en curso, para
   *  avisarle al conductor ("Ana pidió mañana", "Pedro pasa a la parada 7"). */
  cambiosRuta: string[];
  /** Saca de `cambiosRuta` el aviso más viejo: el conductor ya lo leyó. */
  vistoCambioRuta: () => void;
  /** null = se puede cerrar el día. Si no, el motivo, mostrable. */
  motivoNoCerrar: string | null;
  /** Reabre la parada y borra su evento: de la cola dentro de la ventana, y si ya
   *  salió, del servidor como cualquier corrección (spec 033, G5). false = ya no
   *  se podía. */
  deshacer: (pedidoId: string, eventoId: string) => Promise<boolean>;
  /** Cambia una parada ya cerrada a entregado, no entregado o pendiente (spec
   *  033, G5), aunque su evento ya se haya enviado (< 12 h). null = ya no se podía;
   *  `parada` = dónde volvió a la ruta, si pasó a pendiente. */
  cambiarResultado: (pedidoId: string, nuevo: ResultadoVisita) => Promise<{ parada: number | null } | null>;
  /** La parada sigue pendiente y se reintenta más tarde: donde menos alarga,
   *  al menos media hora más adelante (spec 017, R4). Devuelve en qué lugar de lo
   *  pendiente quedó, o null si fue al final. */
  dejarParaElFinal: (pedidoId: string) => Promise<number | null>;
  /** Suma a la ruta en curso los pedidos de afuera que tienen punto, donde
   *  menos alargan (spec 017, R4). Devuelve cuántos entraron. */
  sumarALaRuta: () => Promise<number>;
  /** «Hacer ahora» (spec 023): una parada cercana pasa a ser la próxima. */
  hacerAhora: (pedidoId: string) => Promise<void>;
  /** Saca un pedido del teléfono —esté en la ruta o fuera de ella— y devuelve el
   *  recibo para volver a ponerlo, o null si ya no estaba.
   *
   *  A diferencia de marcar una entrega, esto NO se retiene: se escribe de una,
   *  y arrepentirse es restaurar (ver restaurar). Retenerlo dejaría la pantalla
   *  mostrando ocho segundos un pedido que el conductor ya vio salir volando, y la
   *  ruta contándolo.
   *
   *  Nada de esto sale al servidor: los pedidos del día viven solo en el
   *  teléfono, y los eventos ya marcados se quedan en la cola tal como estaban
   *  (ver borrarPedido). */
  eliminarPedido: (pedidoId: string) => Promise<PedidoEliminado | null>;
  /** Vuelve a poner lo que devolvió eliminarPedido, en su lugar de la ruta. */
  restaurar: (eliminado: PedidoEliminado) => Promise<void>;
  /** Vencida la ventana de deshacer: cierra el día si ya no queda nada
   *  pendiente y manda lo que estaba retenido. */
  confirmar: () => Promise<void>;
};
