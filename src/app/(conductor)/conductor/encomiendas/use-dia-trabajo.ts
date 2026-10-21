"use client";

// El día de trabajo del conductor, leído del TELÉFONO (ver lib/encomiendas/local): los
// pedidos, la ruta del día y lo que se va marcando sobre ella.
//
// Vive en un hook y no dentro de la pantalla para separar dos cosas que se
// habían mezclado: leer y escribir lo guardado —con sus reglas: qué se puede
// deshacer, cuándo se cierra el día, cuándo sale al servidor— y dibujarlo.
// La pantalla es larga porque el mapa y la hoja lo son; esto no tiene por qué
// crecer con ella.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  borrarPedido,
  cerrarDia,
  deshacerResultado,
  leerPedidos,
  leerRuta,
  marcarResultado,
  marcarLlamada,
  moverAlFinal,
  pedidosEnOrden,
  restaurarPedido,
  rutaTerminada,
  type PedidoEliminado,
  type Pedido,
  type Ruta,
} from "@/lib/encomiendas/local/almacen";
import { estaConfirmado, type ResultadoMarcable } from "@/lib/encomiendas/estados";
import { replanificarRuta } from "@/lib/encomiendas/local/replanificar";
import { useEnvioActividad } from "@/lib/encomiendas/local/enviar";
import {
  pedidosSinAviso,
  pedirAviso,
  pedirListaHorarios,
  sincronizarDisponibilidad,
} from "@/lib/encomiendas/local/whatsapp";

/** Cuánto tiempo se puede deshacer lo que se acaba de marcar. Mientras dure, el
 *  evento no sale del teléfono (ver marcarResultado) y el día no se cierra:
 *  las dos cosas son irreversibles del lado del servidor.
 *
 *  Ocho segundos es lo que tarda en leerse el aviso y reaccionar manejando, sin
 *  que la entrega quede colgada tanto como para dudar de si se registró. */
export const MS_DESHACER = 8_000;

/** Cada cuánto se le pregunta al servidor si llegaron respuestas de WhatsApp.
 *
 *  Más seguido que el reintento de la cola de actividad (60 s, ver enviar.ts) y
 *  a propósito: los eventos de actividad solo tienen que llegar en algún momento,
 *  mientras que acá el chofer está ESPERANDO la respuesta para decidir el orden
 *  de la ruta. Medio minuto es lo que tarda en volver a mirar el teléfono
 *  después de cargar un pedido.
 *
 *  El sondeo existe porque las respuestas hay que ir a buscarlas: un aviso
 *  empujado mientras el teléfono no escucha se pierde y el receptor no lo repite
 *  (ver la Decisión 7 de research.md). */
const MS_SONDEO_WHATSAPP = 30_000;

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
  enviando: boolean;
  intentar: () => void;
  recargar: () => Promise<void>;
  /** Último fallo de WhatsApp, mostrable. No es una alarma: el sondeo reintenta
   *  solo y el chofer siempre puede llamar. */
  errorWhatsapp: string | null;
  /** true mientras hay un envío o una sincronización en vuelo. */
  avisando: boolean;
  /** Manda el aviso a los pedidos que entraron en la ruta y todavía no lo
   *  tienen. Se llama al confirmar una ruta (FR-007). */
  avisarPedidos: (pedidoIds: string[]) => Promise<void>;
  marcarLlamada: (pedidoId: string, resultado: "contesto" | "no_contesto") => Promise<void>;
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
  /** Reabre la parada y borra su evento. Solo funciona dentro de la ventana. */
  deshacer: (pedidoId: string, eventoId: string) => Promise<void>;
  /** La parada sigue pendiente pero pasa a ser la última: el chofer va a
   *  reintentarla al terminar el resto. */
  dejarParaElFinal: (pedidoId: string) => Promise<void>;
  /** Saca un pedido del teléfono —esté en la ruta o fuera de ella— y devuelve el
   *  recibo para volver a ponerlo, o null si ya no estaba.
   *
   *  A diferencia de marcar una entrega, esto NO se retiene: se escribe de una,
   *  y arrepentirse es restaurar (ver restaurar). Retenerlo dejaría la pantalla
   *  mostrando ocho segundos un pedido que el chofer ya vio salir volando, y la
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

export function useDiaTrabajo({
  choferId,
  fecha,
}: {
  choferId: string;
  /** El día en curso. La app del chofer no trabaja días pasados: de los
   *  anteriores solo se muestra el resumen del último (ver pantalla.tsx). */
  fecha: string;
}): DiaEnCurso {
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  // Qué fecha corresponde a lo que hay ahora en "ruta"/"pedidos". "Cargando" se
  // deduce de acá en vez de guardarse aparte: al cambiar de día, los datos en
  // memoria son del día anterior y no hay que mostrarlos como si fueran de este.
  const [fechaCargada, setFechaCargada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { pendientes: sinEnviar, enviando, intentar } = useEnvioActividad(true, choferId, fecha);

  const [errorWhatsapp, setErrorWhatsapp] = useState<string | null>(null);
  const [cambiosRuta, setCambiosRuta] = useState<string[]>([]);
  const [avisando, setAvisando] = useState(false);
  // Sin este candado, el sondeo periódico y el disparado por volver a la app
  // mandarían el mismo lote dos veces en paralelo — el mismo problema que ya
  // resuelve enVueloRef en la cola de actividad.
  const whatsappEnVueloRef = useRef(false);

  // ------------------------------------------------------------------------
  // Doble toque
  // ------------------------------------------------------------------------
  //
  // El almacén ya es a prueba de esto: serializa las escrituras y no cierra dos
  // veces la misma parada (ver enFila y la guarda de marcarResultado). Entonces
  // por qué otra guarda acá.
  //
  // Porque las dos protegen cosas distintas. La del almacén protege LA PLATA: no
  // se encolan dos eventos, así que la entrega no se paga dos veces. Esta protege
  // LA PANTALLA: el segundo toque, que en el almacén no hace nada, acá igual
  // devolvería null y la pantalla lo leería como "no se pudo cerrar", borrando el
  // aviso de deshacer del primero. El chofer perdería la ventana para
  // arrepentirse por haber apoyado el pulgar un momento de más.
  //
  // La clave incluye el pedido: dos paradas distintas se pueden marcar en
  // paralelo sin problema, y una pantalla táctil con guantes marca de a una.
  const enVueloRef = useRef(new Set<string>());

  const unaSolaVez = useCallback(
    async <T,>(clave: string, accion: () => Promise<T>): Promise<T | null> => {
      if (enVueloRef.current.has(clave)) return null;
      enVueloRef.current.add(clave);
      try {
        return await accion();
      } finally {
        enVueloRef.current.delete(clave);
      }
    },
    [],
  );

  // Separada de recargar() a propósito: no escribe estado, así que el efecto de
  // abajo puede llamarla y recién después aplicar el resultado. Mezclar las dos
  // cosas hace que cualquier lectura desde un efecto parezca un setState
  // sincrónico, aunque ocurra después de esperar al teléfono.
  const leerTodo = useCallback(
    () => Promise.all([leerRuta(fecha), leerPedidos(fecha)]),
    [fecha],
  );

  const recargar = useCallback(async () => {
    const [rutaGuardada, pedidosGuardados] = await leerTodo();
    setRuta(rutaGuardada);
    setPedidos(pedidosGuardados);
  }, [leerTodo]);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const [rutaGuardada, pedidosGuardados] = await leerTodo();
        if (cancelado) return;
        setRuta(rutaGuardada);
        setPedidos(pedidosGuardados);
        setError(null);
      } catch (e) {
        if (cancelado) return;
        // ErrorAlmacenLocal ya trae un mensaje accionable (instalar la app,
        // salir del modo privado); cualquier otro se muestra tal cual.
        setError(e instanceof Error ? e.message : "No se pudo leer lo guardado en el teléfono.");
      } finally {
        // Marca el intento como terminado, bien o mal: sin esto la pantalla
        // quedaría en "Cargando…" para siempre si el teléfono no puede guardar.
        if (!cancelado) setFechaCargada(fecha);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [leerTodo, fecha]);

  const onLlamada = useCallback(
    async (pedidoId: string, resultado: "contesto" | "no_contesto") => {
      await unaSolaVez(`llamada:${pedidoId}`, async () => {
        await marcarLlamada({ fecha, pedidoId, choferId }, resultado);
        await recargar();
        intentar();
      });
    },
    [fecha, choferId, recargar, intentar, unaSolaVez],
  );

  // Cerrar el día y mandar lo retenido: las dos cosas que NO se pueden
  // deshacer, y por eso las dos esperan a que venza la ventana.
  //
  // Cerrarla es lo que le dice al servidor que ya puede valorar el día (0032):
  // mientras siga abierta no se calcula ni un peso, justamente para que el panel
  // no muestre la liquidación de una ruta que todavía está pasando.
  //
  // Se relee del teléfono en vez de mirar el estado de React: el estado de esta
  // pasada puede no incluir todavía la última parada cerrada.
  const confirmar = useCallback(async () => {
    const [rutaGuardada, pedidosGuardados] = await leerTodo();

    if (rutaTerminada(rutaGuardada, pedidosGuardados) && !rutaGuardada?.cierre) {
      await cerrarDia(fecha);
    }
    await recargar();
    intentar();
  }, [fecha, leerTodo, recargar, intentar]);

  // Red de seguridad: si la app se cerró durante la ventana de deshacer, el
  // día quedó terminado pero abierto y nadie lo va a cerrar. Al volver a
  // entrar se cierra sola.
  //
  // Corre UNA sola vez por fecha, apenas termina la primera lectura. Si mirara
  // cada cambio de la ruta se dispararía también al marcar la última parada del
  // día —que es justo cuando la ventana de deshacer está abierta— y cerraría la
  // día antes de que el chofer pueda arrepentirse, que es lo contrario de lo
  // que se quiso.
  const reparadaRef = useRef<string | null>(null);
  useEffect(() => {
    if (fechaCargada !== fecha || reparadaRef.current === fecha) return;
    reparadaRef.current = fecha;
    if (!rutaTerminada(ruta, pedidos) || ruta?.cierre) return;
    void (async () => {
      await cerrarDia(fecha);
      await recargar();
      intentar();
    })();
  }, [fecha, fechaCargada, ruta, pedidos, recargar, intentar]);

  const onEntrega = useCallback(
    (pedidoId: string, resultado: ResultadoMarcable) =>
      unaSolaVez(`entrega:${pedidoId}`, async () => {
        const eventoId = await marcarResultado({ fecha, pedidoId, choferId }, resultado, MS_DESHACER);
        await recargar();
        return eventoId;
      }),
    [fecha, choferId, recargar, unaSolaVez],
  );

  const onDeshacer = useCallback(
    async (pedidoId: string, eventoId: string) => {
      await unaSolaVez(`deshacer:${eventoId}`, async () => {
        await deshacerResultado({ fecha, pedidoId }, eventoId);
        await recargar();
      });
    },
    [fecha, recargar, unaSolaVez],
  );

  const onDejarParaElFinal = useCallback(
    async (pedidoId: string) => {
      await unaSolaVez(`final:${pedidoId}`, async () => {
        await moverAlFinal({ fecha, pedidoId });
        await recargar();
      });
    },
    [fecha, recargar, unaSolaVez],
  );

  const onEliminarPedido = useCallback(
    (pedidoId: string) =>
      unaSolaVez(`eliminar:${pedidoId}`, async () => {
        const eliminado = await borrarPedido(pedidoId);
        await recargar();
        return eliminado;
      }),
    [recargar, unaSolaVez],
  );

  const onRestaurar = useCallback(
    async (eliminado: PedidoEliminado) => {
      // La clave lleva el id del pedido y no del recibo: lo que hay que evitar
      // es que dos toques en "Deshacer" metan la parada dos veces en la ruta.
      await unaSolaVez(`restaurar:${eliminado.pedido.id}`, async () => {
        await restaurarPedido(eliminado);
        await recargar();
      });
    },
    [recargar, unaSolaVez],
  );

  // ------------------------------------------------------------------------
  // WhatsApp
  // ------------------------------------------------------------------------

  /** Manda los avisos que falten de una lista de pedidos.
   *
   *  Filtra por `pedidosSinAviso` antes de mandar: al receptor le llegaría el
   *  mismo mensaje dos veces, y rehacer la ruta a media mañana vuelve a pasar por
   *  acá con los mismos pedidos. El servidor tiene la misma comprobación —es la
   *  que de verdad garantiza el "una sola vez"—, pero preguntar acá primero
   *  ahorra una consulta por pedido ya avisado.
   *
   *  Va de a uno y en serie: son consultas al servidor que a su vez llama a Meta,
   *  y treinta en paralelo con una conexión mala es la forma de que fallen todas. */
  const avisarPedidos = useCallback(
    async (pedidoIds: string[]) => {
      if (pedidoIds.length === 0) return;
      setAvisando(true);
      try {
        // Se relee del teléfono: el estado de React puede no tener el último aviso.
        const ids = new Set(pedidoIds);
        const faltantes = pedidosSinAviso((await leerPedidos(fecha)).filter((p) => ids.has(p.id)));

        let ultimoError: string | null = null;
        for (const pedido of faltantes) {
          const fallo = await pedirAviso(pedido, fecha);
          // Se sigue con los demás: que un número esté mal no puede dejar sin
          // aviso a los otros veintinueve receptores.
          if (fallo) ultimoError = fallo.error;
        }

        setErrorWhatsapp(ultimoError);
        await recargar();
      } finally {
        setAvisando(false);
      }
    },
    [fecha, recargar],
  );

  /** Baja las respuestas, las aplica, manda las listas de horarios que hagan
   *  falta y reintenta los avisos que no salieron. Es el paso 3-5 del flujo
   *  descrito en local/whatsapp.ts.
   *
   *  El reintento vive ACÁ y no en un botón porque el estado de los avisos no es
   *  trabajo del chofer: él ve, por parada, si al receptor hay que llamarlo
   *  (Parada.hayQueContactar), y que el mensaje saliera al primer intento o
   *  al tercero no cambia nada de lo que hace en la puerta. Antes había una
   *  sección entera con contadores y un botón de reintentar por pedido, y lo que
   *  el chofer hacía con eso era tocar reintentar hasta que el número cambiara de
   *  color.
   *
   *  No insiste para siempre: `pedidosSinAviso` descarta los que ya tienen aviso
   *  —al receptor no le puede llegar dos veces— y los que agotaron los intentos
   *  (MAX_INTENTOS_AVISO), que es el caso del número mal escrito. */
  const sincronizarWhatsapp = useCallback(async () => {
    if (whatsappEnVueloRef.current) return;
    whatsappEnVueloRef.current = true;
    try {
      const r = await sincronizarDisponibilidad(choferId);
      setErrorWhatsapp(r.error);

      // "Mañana" o un bloque elegido: la ruta en curso se reordena sola y el
      // conductor se entera por un aviso (spec 010).
      if (r.cambios.length > 0) {
        const avisos = await replanificarRuta(fecha, r.cambios);
        if (avisos.length > 0) setCambiosRuta((previos) => [...previos, ...avisos]);
      }

      // Los que tocaron "indicar un horario" necesitan el segundo mensaje: la
      // lista con los bloques. Recién ahora se puede mandar, porque tocar el
      // botón fue lo que abrió la ventana de 24 h (ver la Decisión 8).
      if (r.pedirHorarios.length > 0) {
        const guardados = await leerPedidos(fecha);
        const porId = new Map(guardados.map((p) => [p.id, p] as const));
        for (const id of r.pedirHorarios) {
          const pedido = porId.get(id);
          if (pedido) await pedirListaHorarios(pedido, fecha);
        }
      }

      // Los avisos que quedaron sin salir. La ruta se lee del teléfono en vez de
      // usar el estado del hook para no meter `ruta` en las dependencias: sería
      // reiniciar el sondeo con cada recarga.
      const ruta = await leerRuta(fecha);
      const enRuta = new Set(ruta?.orden ?? []);
      const faltantes = pedidosSinAviso(
        (await leerPedidos(fecha)).filter((p) => enRuta.has(p.id) && p.resultado === "pendiente"),
      );
      // De a uno y en serie, por lo mismo que avisarPedidos: son consultas que a
      // su vez llaman a Meta.
      for (const pedido of faltantes) await pedirAviso(pedido, fecha);

      if (r.aplicadas > 0 || r.pedirHorarios.length > 0 || faltantes.length > 0) {
        await recargar();
      }
    } finally {
      whatsappEnVueloRef.current = false;
    }
  }, [fecha, choferId, recargar]);

  const vistoCambioRuta = useCallback(() => setCambiosRuta((previos) => previos.slice(1)), []);

  // Mismo patrón que la cola de actividad: al montar, al volver la conexión, al
  // volver a la app, y cada medio minuto. El chofer no tiene que apretar nada
  // para enterarse de que un receptor contestó.
  useEffect(() => {
    void sincronizarWhatsapp();

    const alVolver = () => void sincronizarWhatsapp();
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    const sondeo = setInterval(alVolver, MS_SONDEO_WHATSAPP);

    return () => {
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(sondeo);
    };
  }, [sincronizarWhatsapp]);

  // La ruta guarda el orden de visita (lo cerrado primero, ver guardarRuta), así
  // que el número de orden es la posición en la lista. Un pedido borrado a mano
  // simplemente no aparece.
  //
  // Memoizado porque de esta lista sale la de marcadores del mapa: si cambiara
  // de identidad en cada render, el mapa borraría y volvería a poner los treinta
  // marcadores cada vez que se re-dibuja la pantalla — que pasa sola cada
  // minuto, cuando el reintento de envío de actividad toca su estado.
  const paradas = useMemo<Parada[]>(
    () =>
      pedidosEnOrden(ruta, pedidos).map((pedido, i) => ({
        secuencia: i + 1,
        pedido,
        // Hay que contactarlo si no dijo que va a estar Y todavía no se lo
        // llamó. Un confirmado no se llama —para eso se le avisó—, y a uno que
        // ya se llamó tampoco: se lo llamó.
        hayQueContactar:
          pedido.resultado === "pendiente" &&
          pedido.llamada === "pendiente" &&
          !estaConfirmado(pedido.disponibilidad),
      })),
    [ruta, pedidos],
  );

  // La parada activa es siempre la primera pendiente en orden de visita: no hay
  // que guardar un "puntero" aparte, se recalcula solo al actualizar.
  const activa = useMemo(
    () => paradas.find((p) => p.pedido.resultado === "pendiente") ?? null,
    [paradas],
  );

  /** Por qué NO se puede cerrar el día todavía (FR-020): quedan paradas sin
   *  marcar.
   *
   *  Un pedido que quedó FUERA de la ruta (sin ubicar, o cargado tarde) no frena
   *  el cierre: nunca se prometió entregarlo hoy. Confundir esas dos cosas
   *  dejaría al conductor sin poder cerrar el día por un pedido que ni salió de
   *  la camioneta. */
  const motivoNoCerrar = useMemo<string | null>(() => {
    const sinMarcar = paradas.filter((p) => p.pedido.resultado === "pendiente").length;
    if (sinMarcar > 0) {
      return sinMarcar === 1
        ? "Queda 1 parada sin marcar. Registra su resultado antes de cerrar."
        : `Quedan ${sinMarcar} paradas sin marcar. Registra su resultado antes de cerrar.`;
    }
    return null;
  }, [paradas]);

  return {
    cargando: fechaCargada !== fecha,
    error,
    ruta,
    pedidos,
    paradas,
    activa,
    sinEnviar,
    enviando,
    intentar,
    recargar,
    errorWhatsapp,
    avisando,
    avisarPedidos,
    marcarLlamada: onLlamada,
    marcarResultado: onEntrega,
    cambiosRuta,
    vistoCambioRuta,
    motivoNoCerrar,
    deshacer: onDeshacer,
    dejarParaElFinal: onDejarParaElFinal,
    eliminarPedido: onEliminarPedido,
    restaurar: onRestaurar,
    confirmar,
  };
}
