// El aviso de WhatsApp y lo que contestó el receptor.
//
// El aviso vive DENTRO del pedido (spec 011): uno por pedido, y su estado dice
// en qué va (pendiente, enviado, respondido, fallido). El servidor guarda una
// copia temporal solo mientras espera la respuesta (ver docs/WHATSAPP.md).
//
// Lo que el receptor contesta entra desde AFUERA: la respuesta llega al servidor
// y el teléfono la baja después (ver ../whatsapp.ts). Eso hace que estas
// escrituras tengan un problema que las demás no tienen: pueden llegar dos
// veces, tarde, o en distinto orden del que el receptor las tocó.
//
// Las dos reglas que sostienen eso:
//
//  1. IDEMPOTENCIA POR MENSAJE. Cada respuesta trae el id del mensaje de
//     WhatsApp que la originó, y ese id queda anotado en el aviso. Volver a
//     bajar la misma respuesta —porque la confirmación al servidor se cortó— no
//     la aplica de nuevo.
//  2. LO CERRADO NO SE REABRE. Si el pedido ya se entregó o ya se cerró como No
//     morador, una respuesta que llega después no cambia nada.
//
// "Mañana" es la única respuesta que cierra el pedido (spec 010): queda como No
// morador, con su evento, y deja de ser una parada por visitar. La ruta se
// reordena después (ver ../replanificar.ts).

import type { RespuestaDisponibilidad } from "@/lib/encomiendas/estados";
import { STORES, escribir } from "../idb";
import { nuevoEvento } from "./cola";
import { enFila } from "./fila";
import { leerPedido } from "./lecturas";
import { avisoVacio } from "./migrar";
import type { Aviso, ActividadPorEnviar, Pedido } from "./tipos";

/** Lee el pedido, le aplica `cambio` al aviso y lo guarda. Sin pedido (lo
 *  borraron mientras el envío viajaba) no hace nada. */
function cambiarAviso(pedidoId: string, cambio: (aviso: Aviso) => Aviso): Promise<Aviso | null> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido) return null;
    const aviso = cambio(pedido.aviso);
    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, { ...pedido, aviso }));
    return aviso;
  });
}

/** Anota que el aviso salió. `codigo` y `mensajeId` los devuelve el servidor:
 *  sirven para empatar la respuesta y para no volver a mandar el aviso. */
export function registrarAvisoEnviado({
  pedidoId,
  codigo,
  mensajeId,
}: {
  pedidoId: string;
  codigo: string;
  mensajeId: string | null;
}): Promise<Aviso | null> {
  return cambiarAviso(pedidoId, (previo) => ({
    ...previo,
    codigo,
    mensajeId,
    estado: "enviado",
    enviadoEn: new Date().toISOString(),
    ultimoError: null,
    intentos: previo.intentos + 1,
  }));
}

/** Anota que el aviso NO se pudo mandar. Cuenta el intento igual: es lo que
 *  frena el reintento eterno de un número que no tiene WhatsApp. */
export async function registrarAvisoFallido(pedidoId: string, error: string): Promise<void> {
  await cambiarAviso(pedidoId, (previo) => ({
    ...previo,
    estado: "fallido",
    ultimoError: error,
    intentos: previo.intentos + 1,
  }));
}

/** Anota que ya se le mandó la lista de bloques horarios, para no repetirla. */
export async function marcarHorariosEnviados(pedidoId: string): Promise<void> {
  await cambiarAviso(pedidoId, (previo) => ({ ...previo, horariosEnviados: true }));
}

/** Aplica una respuesta del receptor. Devuelve si CAMBIÓ algo: false significa
 *  que ya estaba aplicada o que el pedido ya estaba cerrado, y en los dos casos
 *  el llamador puede confirmarla al servidor igual (ya está resuelta).
 *
 *  Pedido (con su aviso) y —con "Mañana"— el evento se escriben en la MISMA
 *  transacción: si quedara el evento sin el pedido cerrado, o al revés, las dos
 *  puntas contarían cosas distintas. */
export function registrarDisponibilidad(
  pedidoId: string,
  respuesta: RespuestaDisponibilidad,
  /** Id del mensaje de WhatsApp que trajo la respuesta: la clave de la regla 1. */
  mensajeId: string,
  /** Para el evento de no entrega que deja "Mañana". */
  choferId: string,
): Promise<boolean> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    // El conductor pudo borrar el pedido mientras la respuesta viajaba.
    if (!pedido) return false;

    // Regla 1: idempotencia por mensaje.
    if (pedido.aviso.respuestasAplicadas.includes(mensajeId)) return false;
    const aviso: Aviso = {
      ...pedido.aviso,
      respuestasAplicadas: [...pedido.aviso.respuestasAplicadas, mensajeId],
    };

    // Regla 2: lo cerrado no se reabre. El mensaje se anota como visto igual: si
    // no, cada consulta al servidor lo volvería a bajar y a descartar, para siempre.
    if (pedido.resultado !== "pendiente") {
      await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, { ...pedido, aviso }));
      return false;
    }

    const hora = new Date().toISOString();
    const actualizado: Pedido = {
      ...pedido,
      aviso: { ...aviso, estado: "respondido" },
      disponibilidad: respuesta.tipo,
      // El bloque se limpia con cualquier otra respuesta: un "18:00-20:00" que
      // quedara puesto seguiría ordenando la ruta por una ventana que ya no vale.
      bloqueHorarioId: respuesta.tipo === "horario_indicado" ? respuesta.bloqueHorarioId : null,
      ...(respuesta.tipo === "manana" ? { resultado: "no_entregado" as const, horaResultado: hora } : {}),
    };
    const evento: ActividadPorEnviar | null =
      respuesta.tipo === "manana"
        ? nuevoEvento(choferId, pedido.fecha, "omision", hora)
        : null;

    await escribir([STORES.pedidos, STORES.cola], ({ guardar }) => {
      guardar(STORES.pedidos, actualizado);
      if (evento) guardar(STORES.cola, evento);
    });
    return true;
  });
}

/** Vuelve la disponibilidad y el aviso a cero, para poder volver a avisar.
 *  Existe para un caso concreto: el conductor se dio cuenta de que el teléfono
 *  estaba mal escrito, así que lo que se contestó era de otra persona y no puede
 *  quedar pegado al pedido. No reabre un pedido ya cerrado. */
export function reiniciarDisponibilidad(pedidoId: string): Promise<void> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido) return;

    await escribir([STORES.pedidos], ({ guardar }) =>
      guardar(STORES.pedidos, {
        ...pedido,
        disponibilidad: "pendiente_respuesta",
        bloqueHorarioId: null,
        aviso: avisoVacio(),
      }),
    );
  });
}
