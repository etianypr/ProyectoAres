import { uuidv7 } from "@/lib/comun/uuid";
import { STORES, escribir } from "../idb";
import { enFila } from "./fila";
import { leerPedido, leerPedidos, leerRuta } from "./lecturas";
import { avisoVacio } from "./migrar";
import type { Pedido, Ruta } from "./tipos";

/** Los del día que todavía hay que visitar: la entrada para armar la ruta.
 *
 *  Un pedido cerrado —entregado o no entregado— NO está acá: lo tachado no se
 *  vuelve a rutear. */
export async function pedidosPendientes(fecha: string): Promise<Pedido[]> {
  const pedidos = await leerPedidos(fecha);
  return pedidos.filter((p) => p.resultado === "pendiente");
}

/** Lo que el formulario edita: el resto del pedido lo maneja el almacén. */
export type DatosPedido = Pick<Pedido, "nombre" | "telefono" | "direccion" | "lat" | "lng" | "notas"> &
  /** El paquete (spec 003). Si no viene, se conserva el que tenía. */
  Partial<Pick<Pedido, "of" | "referencia">>;

/** Crea (sin id) o actualiza (con id) un pedido del día `fecha`. Devuelve el
 *  guardado. Editar no cambia la fecha de un pedido existente. */
export function guardarPedido(
  datos: DatosPedido,
  fecha: string,
  id?: string,
): Promise<Pedido> {
  return enFila(async () => {
    const anterior = id ? await leerPedido(id) : null;

    const pedido: Pedido = {
      ...datos,
      id: anterior?.id ?? id ?? uuidv7(),
      fecha: anterior?.fecha ?? fecha,
      // Editar un pedido no lo reabre ni lo cierra: eso solo pasa al marcar.
      llamada: anterior?.llamada ?? "pendiente",
      resultado: anterior?.resultado ?? "pendiente",
      horaLlamada: anterior?.horaLlamada ?? null,
      horaResultado: anterior?.horaResultado ?? null,
      // Corregir un teléfono o una dirección tampoco borra lo que el receptor
      // ya contestó. Si el conductor cambia el número porque el anterior estaba
      // mal, esa respuesta era de otra persona y hay que descartarla — pero eso
      // lo decide reiniciarDisponibilidad(), no un guardado cualquiera.
      disponibilidad: anterior?.disponibilidad ?? "pendiente_respuesta",
      bloqueHorarioId: anterior?.bloqueHorarioId ?? null,
      aviso: anterior?.aviso ?? avisoVacio(),
      cargadoEn: anterior?.cargadoEn ?? new Date().toISOString(),
      of: datos.of !== undefined ? datos.of : (anterior?.of ?? null),
      referencia: datos.referencia !== undefined ? datos.referencia : (anterior?.referencia ?? null),
      fotoId: anterior?.fotoId ?? null,
      bultos: anterior?.bultos ?? null,
      bultosEscaneados: anterior?.bultosEscaneados ?? [],
      porPagar: anterior?.porPagar ?? null,
      montoPorPagar: anterior?.montoPorPagar ?? null,
      folioGuia: anterior?.folioGuia ?? null,
      origenCarga: anterior?.origenCarga ?? "manual",
    };

    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, pedido));
    return pedido;
  });
}

/** Fija las coordenadas de varios pedidos de una vez, sin tocar el resto de sus
 *  datos: se usa al reintentar ubicar direcciones que habían fallado (ver
 *  ../generar-ruta.ts). Los que ya no existan se ignoran en silencio — el conductor
 *  pudo borrarlos mientras corría la geocodificación. */
export function fijarCoordenadas(
  coordenadas: { id: string; lat: number; lng: number }[],
): Promise<void> {
  if (coordenadas.length === 0) return Promise.resolve();
  return enFila(async () => {
    const actuales = await Promise.all(coordenadas.map((c) => leerPedido(c.id)));

    await escribir([STORES.pedidos], ({ guardar }) => {
      actuales.forEach((pedido, i) => {
        if (!pedido) return;
        guardar(STORES.pedidos, { ...pedido, lat: coordenadas[i].lat, lng: coordenadas[i].lng });
      });
    });
  });
}

/** Cambia la dirección de un pedido y su punto (spec 005: la etiqueta dice otra
 *  cosa que la guía). Sin punto queda "sin ubicar": el de antes era de la otra
 *  dirección y dejarlo mandaría al conductor al lugar equivocado. El orden de la
 *  ruta no se toca; para reordenar se rehace la ruta. */
export function cambiarDireccion(
  id: string,
  direccion: string,
  punto: { lat: number; lng: number } | null,
  /** Se suma a las notas del pedido (por ejemplo, qué decía antes de corregirla). */
  nota: string | null = null,
): Promise<Pedido | null> {
  return enFila(async () => {
    const pedido = await leerPedido(id);
    if (!pedido) return null;
    const notas = nota ? (pedido.notas ? `${pedido.notas} · ${nota}` : nota) : pedido.notas;
    const cambiado: Pedido = { ...pedido, direccion, notas, lat: punto?.lat ?? null, lng: punto?.lng ?? null };
    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, cambiado));
    return cambiado;
  });
}

/** Todo lo que se le quitó al teléfono al eliminar un pedido, en una sola pieza.
 *  Es lo que hace que "Deshacer" pueda existir: sin esto, eliminar es definitivo
 *  y el conductor perdería la dirección y el teléfono del receptor —que escribió a
 *  mano— por un roce en la pantalla.
 *
 *  Se guarda en memoria y no en la base: si la app se cierra durante la ventana
 *  para deshacer, el recibo se pierde y la eliminación queda firme. Es el fallo
 *  que corresponde — lo contrario, un pedido que reaparece solo al día siguiente,
 *  es el que no se puede explicar. */
export type PedidoEliminado = {
  /** Con su llamada y su resultado: restaurarlo no reabre nada. */
  pedido: Pedido;
  /** En qué lugar de la ruta estaba, o null si estaba fuera de ella. Restaurar
   *  lo pone de vuelta AHÍ y no al final: el conductor eliminó por error, no
   *  reordenó. */
  posicion: number | null;
};

/** Elimina un pedido del teléfono y lo saca de la ruta del día si estaba ahí.
 *  Devuelve el recibo para restaurarlo (ver restaurarPedido), o null si ya no
 *  existía — dos toques en el mismo botón no son un error.
 *
 *  No toca la cola de eventos: lo que ya se marcó de este pedido está contado y
 *  así debe quedar. Los eventos no llevan el id del pedido (ver ActividadPorEnviar), así
 *  que no queda nada apuntando a un pedido que no existe. */
export function borrarPedido(id: string): Promise<PedidoEliminado | null> {
  return enFila(async () => {
    const pedido = await leerPedido(id);
    if (!pedido) return null;

    const ruta = await leerRuta(pedido.fecha);
    const indice = ruta ? ruta.orden.indexOf(id) : -1;
    const rutaSinPedido =
      ruta && indice >= 0 ? { ...ruta, orden: ruta.orden.filter((x) => x !== id) } : null;

    await escribir([STORES.pedidos, STORES.rutas], ({ guardar, borrar }) => {
      borrar(STORES.pedidos, id);
      if (rutaSinPedido) guardar(STORES.rutas, rutaSinPedido);
    });

    // El aviso va dentro del pedido: restaurarlo no vuelve a avisarle a nadie.
    return { pedido, posicion: indice >= 0 ? indice : null };
  });
}

/** Vuelve a poner un pedido eliminado tal como estaba, lugar en la ruta incluido.
 *
 *  Idempotente: restaurar dos veces el mismo recibo lo deja una sola vez en la
 *  ruta. Hace falta porque el aviso de "Deshacer" vive sobre el mapa y se puede
 *  tocar dos veces antes de que la pantalla se rehaga. */
export function restaurarPedido(eliminado: PedidoEliminado): Promise<void> {
  const { pedido, posicion } = eliminado;
  return enFila(async () => {
    const ruta = await leerRuta(pedido.fecha);
    let rutaConPedido: Ruta | null = null;
    if (ruta && posicion != null && !ruta.orden.includes(pedido.id)) {
      const orden = [...ruta.orden];
      // Acotado al largo actual: mientras el aviso estaba a la vista pudieron
      // eliminarse otros pedidos, y en ese caso el lugar que le toca es el final.
      orden.splice(Math.min(posicion, orden.length), 0, pedido.id);
      rutaConPedido = { ...ruta, orden };
    }

    await escribir([STORES.pedidos, STORES.rutas], ({ guardar }) => {
      guardar(STORES.pedidos, pedido);
      if (rutaConPedido) guardar(STORES.rutas, rutaConPedido);
    });
  });
}
