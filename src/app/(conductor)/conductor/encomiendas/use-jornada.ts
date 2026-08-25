"use client";

// La jornada del chofer, leída del TELÉFONO (ver lib/encomiendas/local): los
// pedidos, la ruta del día y lo que se va marcando sobre ella.
//
// Vive en un hook y no dentro de la pantalla para separar dos cosas que se
// habían mezclado: leer y escribir lo guardado —con sus reglas: qué se puede
// deshacer, cuándo se cierra la jornada, cuándo sale al servidor— y dibujarlo.
// La pantalla es larga porque el mapa y la hoja lo son; esto no tiene por qué
// crecer con ella.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  borrarPedido,
  cerrarRuta,
  deshacerEntrega,
  leerCoordinaciones,
  leerPedidos,
  leerRuta,
  marcarEntrega,
  marcarLlamada,
  moverAlFinal,
  registrarDisponibilidad,
  registrarRechazo,
  restaurarPedido,
  rutaTerminada,
  type CoordinacionWhatsApp,
  type EstadoEntregaLocal,
  type EstadoLlamadaLocal,
  type PedidoEliminado,
  type PedidoLocal,
  type ResultadoEntrega,
  type RutaLocal,
} from "@/lib/encomiendas/local/almacen";
import { useEnvioActividad } from "@/lib/encomiendas/local/enviar";
import {
  pedidosSinAviso,
  pedirAviso,
  pedirListaHorarios,
  sincronizarDisponibilidad,
} from "@/lib/encomiendas/local/whatsapp";

/** Cuánto tiempo se puede deshacer lo que se acaba de marcar. Mientras dure, el
 *  evento no sale del teléfono (ver marcarEntrega) y la jornada no se cierra:
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

/** Una parada lista para mostrar: el pedido (que vive en el teléfono) más cómo
 *  le fue en el día. */
export type ParadaVista = {
  /** Orden de visita, empezando en 1. */
  secuencia: number;
  pedido: PedidoLocal;
  llamada: EstadoLlamadaLocal;
  entrega: EstadoEntregaLocal;
  /** Si hay que contactar al receptor antes de llegar: no contestó el WhatsApp
   *  y tampoco se lo llamó todavía. Es lo que dispara el aviso de aproximación
   *  (FR-017). */
  hayQueContactar: boolean;
};

export type Jornada = {
  /** Todavía no se sabe qué hay guardado para esta fecha. */
  cargando: boolean;
  /** El teléfono no pudo entregar lo guardado (modo privado, sin espacio). */
  error: string | null;
  ruta: RutaLocal | null;
  pedidos: PedidoLocal[];
  /** Las paradas de la ruta, en orden de visita. */
  paradas: ParadaVista[];
  /** La primera pendiente: a la que hay que ir ahora. */
  activa: ParadaVista | null;
  /** Cuántas entregas quedaron guardadas sin llegar al servidor. */
  sinEnviar: number;
  enviando: boolean;
  intentar: () => void;
  recargar: () => Promise<void>;
  /** Estado del aviso de WhatsApp de cada pedido, por id. Es lo que la pantalla
   *  usa para mostrar "avisado", "sin respuesta" o "no se pudo avisar". */
  whatsapp: Map<string, CoordinacionWhatsApp>;
  /** Último fallo de WhatsApp, mostrable. No es una alarma: el sondeo reintenta
   *  solo y el chofer siempre puede llamar. */
  errorWhatsapp: string | null;
  /** true mientras hay un envío o una sincronización en vuelo. */
  avisando: boolean;
  /** Manda el aviso a los pedidos que entraron en la ruta y todavía no lo
   *  tienen. Se llama al confirmar una ruta (FR-007). */
  avisarPedidos: (pedidoIds: string[]) => Promise<void>;
  /** Reintento manual de un aviso que falló. */
  reintentarAviso: (pedidoId: string) => Promise<void>;
  marcarLlamada: (pedidoId: string, resultado: "contesto" | "no_contesto") => Promise<void>;
  /** Cierra una parada con uno de los cuatro resultados y devuelve el
   *  identificador para deshacerla, o null si ya estaba cerrada (o si el toque
   *  llegó mientras el anterior estaba en vuelo).
   *
   *  El evento queda retenido MS_DESHACER; hasta que venza, ni sale al servidor
   *  ni se cierra la jornada. */
  marcarEntrega: (pedidoId: string, resultado: ResultadoEntrega) => Promise<string | null>;
  /** Cierra como rechazado un pedido que NO tiene parada en la ruta: el receptor
   *  lo rechazó por WhatsApp antes de que entrara. El jefe igual tiene que
   *  contarlo (FR-021) y el pedido tiene que dejar de proponerse (FR-012). */
  registrarRechazoSuelto: (pedidoId: string) => Promise<string | null>;
  /** Marca que un receptor no contestó el WhatsApp. La pone el teléfono al
   *  aproximarse a la parada; no pisa una respuesta que ya había llegado. */
  marcarSinRespuesta: (pedidoId: string) => Promise<void>;
  /** Los rechazados por WhatsApp que todavía nadie registró. Hay que cerrarlos
   *  antes de poder terminar la jornada. */
  rechazadosPendientes: PedidoLocal[];
  /** null = se puede cerrar la jornada. Si no, el motivo, mostrable. */
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
  /** Vuelve a poner lo que devolvió eliminarPedido, parada y lugar incluidos. */
  restaurar: (eliminado: PedidoEliminado) => Promise<void>;
  /** Vencida la ventana de deshacer: cierra la jornada si ya no queda nada
   *  pendiente y manda lo que estaba retenido. */
  confirmar: () => Promise<void>;
};

export function useJornada({
  choferId,
  fecha,
}: {
  choferId: string;
  /** El día en curso. La app del chofer no trabaja días pasados: de los
   *  anteriores solo se muestra el resumen del último (ver pantalla.tsx). */
  fecha: string;
}): Jornada {
  const [ruta, setRuta] = useState<RutaLocal | null>(null);
  const [pedidos, setPedidos] = useState<PedidoLocal[]>([]);
  // Qué fecha corresponde a lo que hay ahora en "ruta"/"pedidos". "Cargando" se
  // deduce de acá en vez de guardarse aparte: al cambiar de día, los datos en
  // memoria son del día anterior y no hay que mostrarlos como si fueran de este.
  const [fechaCargada, setFechaCargada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { pendientes: sinEnviar, enviando, intentar } = useEnvioActividad(true, choferId, fecha);

  const [whatsapp, setWhatsapp] = useState<Map<string, CoordinacionWhatsApp>>(new Map());
  const [errorWhatsapp, setErrorWhatsapp] = useState<string | null>(null);
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
  // veces la misma parada (ver enFila y la guarda de marcarEntrega). Entonces
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
    () => Promise.all([leerRuta(fecha), leerPedidos(), leerCoordinaciones()]),
    [fecha],
  );

  const recargar = useCallback(async () => {
    const [rutaGuardada, pedidosGuardados, coordinaciones] = await leerTodo();
    setRuta(rutaGuardada);
    setPedidos(pedidosGuardados);
    setWhatsapp(new Map(coordinaciones.map((c) => [c.pedidoId, c] as const)));
  }, [leerTodo]);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const [rutaGuardada, pedidosGuardados, coordinaciones] = await leerTodo();
        if (cancelado) return;
        setRuta(rutaGuardada);
        setPedidos(pedidosGuardados);
        setWhatsapp(new Map(coordinaciones.map((c) => [c.pedidoId, c] as const)));
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

  /** El receptor no contestó el WhatsApp. Es una disponibilidad, no un resultado
   *  de entrega: el pedido sigue pendiente y lo que cambia es que el chofer sabe
   *  que tiene que llamar. No pisa un "sí" que hubiera llegado mientras tanto
   *  (esa regla vive en registrarDisponibilidad). */
  const onSinRespuesta = useCallback(
    async (pedidoId: string) => {
      await unaSolaVez(`sinrespuesta:${pedidoId}`, async () => {
        await registrarDisponibilidad(pedidoId, { tipo: "disponibilidad_sin_respuesta" });
        await recargar();
      });
    },
    [recargar, unaSolaVez],
  );

  // Cerrar la jornada y mandar lo retenido: las dos cosas que NO se pueden
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

    // FR-020 aplicado también acá y no solo en el botón: un rechazo sin registrar
    // deja la jornada abierta. Si se cerrara, el servidor valoraría un día al que
    // le falta un resultado, y ese rechazo no llegaría nunca al panel del jefe.
    //
    // Se relee del teléfono en vez de mirar el estado de React: el estado de esta
    // pasada puede no incluir todavía la última parada cerrada.
    const rechazosSinRegistrar = pedidosGuardados.some(
      (p) => p.estado === "pendiente" && p.disponibilidad === "rechazado",
    );

    if (rutaTerminada(rutaGuardada) && !rutaGuardada?.cerradaEn && !rechazosSinRegistrar) {
      await cerrarRuta(fecha);
    }
    await recargar();
    intentar();
  }, [fecha, leerTodo, recargar, intentar]);

  // Red de seguridad: si la app se cerró durante la ventana de deshacer, la
  // jornada quedó terminada pero abierta y nadie la va a cerrar. Al volver a
  // entrar se cierra sola.
  //
  // Corre UNA sola vez por fecha, apenas termina la primera lectura. Si mirara
  // cada cambio de la ruta se dispararía también al marcar la última parada del
  // día —que es justo cuando la ventana de deshacer está abierta— y cerraría la
  // jornada antes de que el chofer pueda arrepentirse, que es lo contrario de lo
  // que se quiso.
  const reparadaRef = useRef<string | null>(null);
  useEffect(() => {
    if (fechaCargada !== fecha || reparadaRef.current === fecha) return;
    reparadaRef.current = fecha;
    if (!rutaTerminada(ruta) || ruta?.cerradaEn) return;
    // Misma regla que confirmar(): la red de seguridad no puede cerrar una
    // jornada a la que le falta registrar un rechazo. Se calcula acá sobre
    // `pedidos` en vez de usar el memo de más abajo, que todavía no existe en
    // este punto del archivo.
    if (pedidos.some((p) => p.estado === "pendiente" && p.disponibilidad === "rechazado")) {
      return;
    }
    void (async () => {
      await cerrarRuta(fecha);
      await recargar();
      intentar();
    })();
  }, [fecha, fechaCargada, ruta, pedidos, recargar, intentar]);

  const onEntrega = useCallback(
    (pedidoId: string, resultado: ResultadoEntrega) =>
      unaSolaVez(`entrega:${pedidoId}`, async () => {
        const eventoId = await marcarEntrega({ fecha, pedidoId, choferId }, resultado, MS_DESHACER);
        await recargar();
        return eventoId;
      }),
    [fecha, choferId, recargar, unaSolaVez],
  );

  const onRechazoSuelto = useCallback(
    (pedidoId: string) =>
      unaSolaVez(`rechazo:${pedidoId}`, async () => {
        // Sin retención: no hay una parada en pantalla desde la cual deshacer,
        // así que la ventana de arrepentimiento no tendría dónde mostrarse. Para
        // corregirlo está reiniciarDisponibilidad (el teléfono estaba mal).
        const eventoId = await registrarRechazo({ fecha, pedidoId, choferId });
        await recargar();
        intentar();
        return eventoId;
      }),
    [fecha, choferId, recargar, intentar, unaSolaVez],
  );

  const onDeshacer = useCallback(
    async (pedidoId: string, eventoId: string) => {
      await unaSolaVez(`deshacer:${eventoId}`, async () => {
        await deshacerEntrega({ fecha, pedidoId }, eventoId);
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
        const eliminado = await borrarPedido(pedidoId, fecha);
        await recargar();
        return eliminado;
      }),
    [fecha, recargar, unaSolaVez],
  );

  const onRestaurar = useCallback(
    async (eliminado: PedidoEliminado) => {
      // La clave lleva el id del pedido y no del recibo: lo que hay que evitar
      // es que dos toques en "Deshacer" metan la parada dos veces en la ruta.
      await unaSolaVez(`restaurar:${eliminado.pedido.id}`, async () => {
        await restaurarPedido(eliminado, fecha);
        await recargar();
      });
    },
    [fecha, recargar, unaSolaVez],
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
        const porId = new Map(pedidos.map((p) => [p.id, p] as const));
        const faltantes = await pedidosSinAviso(pedidoIds);

        let ultimoError: string | null = null;
        for (const id of faltantes) {
          const pedido = porId.get(id);
          if (!pedido) continue;
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
    [pedidos, fecha, recargar],
  );

  const reintentarAviso = useCallback(
    async (pedidoId: string) => {
      const pedido = pedidos.find((p) => p.id === pedidoId);
      if (!pedido) return;
      setAvisando(true);
      try {
        const fallo = await pedirAviso(pedido, fecha);
        setErrorWhatsapp(fallo?.error ?? null);
        await recargar();
      } finally {
        setAvisando(false);
      }
    },
    [pedidos, fecha, recargar],
  );

  /** Baja las respuestas, las aplica y manda las listas de horarios que hagan
   *  falta. Es el paso 3-5 del flujo descrito en local/whatsapp.ts. */
  const sincronizarWhatsapp = useCallback(async () => {
    if (whatsappEnVueloRef.current) return;
    whatsappEnVueloRef.current = true;
    try {
      const r = await sincronizarDisponibilidad();
      setErrorWhatsapp(r.error);

      // Los que tocaron "indicar un horario" necesitan el segundo mensaje: la
      // lista con los bloques. Recién ahora se puede mandar, porque tocar el
      // botón fue lo que abrió la ventana de 24 h (ver la Decisión 8).
      if (r.pedirHorarios.length > 0) {
        const guardados = await leerPedidos();
        const porId = new Map(guardados.map((p) => [p.id, p] as const));
        for (const id of r.pedirHorarios) {
          const pedido = porId.get(id);
          if (pedido) await pedirListaHorarios(pedido, fecha);
        }
      }

      if (r.aplicadas > 0 || r.pedirHorarios.length > 0) await recargar();
    } finally {
      whatsappEnVueloRef.current = false;
    }
  }, [fecha, recargar]);

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

  // Las paradas ya vienen guardadas en orden de visita (lo cerrado primero, ver
  // guardarRuta), así que el número de orden es la posición en la lista. Un
  // pedido borrado a mano simplemente no aparece.
  //
  // Memoizado porque de esta lista sale la de marcadores del mapa: si cambiara
  // de identidad en cada render, el mapa borraría y volvería a poner los treinta
  // marcadores cada vez que se re-dibuja la pantalla — que pasa sola cada
  // minuto, cuando el reintento de envío de actividad toca su estado.
  const paradas = useMemo<ParadaVista[]>(() => {
    const porId = new Map(pedidos.map((p) => [p.id, p] as const));
    return (ruta?.paradas ?? []).flatMap((parada, i) => {
      const pedido = porId.get(parada.pedidoId);
      if (!pedido) return [];
      return [
        {
          secuencia: i + 1,
          pedido,
          llamada: parada.llamada,
          entrega: parada.entrega,
          // Hay que contactarlo si no dijo que va a estar Y todavía no se lo
          // llamó. Un confirmado no se llama —para eso se le avisó—, y a uno que
          // ya se llamó tampoco: se lo llamó.
          hayQueContactar:
            parada.entrega === "pendiente" &&
            parada.llamada === "pendiente" &&
            pedido.disponibilidad !== "confirmado" &&
            pedido.disponibilidad !== "horario_indicado",
        },
      ];
    });
  }, [ruta, pedidos]);

  // La parada activa es siempre la primera pendiente en orden de visita: no hay
  // que guardar un "puntero" aparte, se recalcula solo al actualizar.
  const activa = useMemo(
    () => paradas.find((p) => p.entrega === "pendiente") ?? null,
    [paradas],
  );

  /** Los que el receptor rechazó por WhatsApp y todavía nadie registró.
   *
   *  Están fuera de la ruta a propósito (FR-012), así que no tienen parada que
   *  marcar. Pero el jefe necesita contarlos, y si la jornada se cerrara sin
   *  registrarlos ese rechazo no llegaría nunca al panel: el pedido se
   *  arrastraría a mañana con la disponibilidad puesta, y nadie sabría por qué no
   *  se entregó. */
  const rechazadosPendientes = useMemo(
    () =>
      pedidos.filter((p) => p.estado === "pendiente" && p.disponibilidad === "rechazado"),
    [pedidos],
  );

  /** Por qué NO se puede cerrar la jornada todavía (FR-020).
   *
   *  La regla del producto es que no se cierre sin informar el resultado de cada
   *  pedido. Se traduce en dos cosas concretas: no quedan paradas sin marcar, y
   *  no quedan rechazos sin registrar.
   *
   *  Un pedido que quedó FUERA de la ruta (sin ubicar, o cargado tarde) no frena
   *  el cierre: nunca se prometió entregarlo hoy y sigue pendiente para mañana.
   *  Confundir esas dos cosas dejaría al chofer sin poder cerrar el día por un
   *  pedido que ni salió de la camioneta. */
  const motivoNoCerrar = useMemo<string | null>(() => {
    const sinMarcar = paradas.filter((p) => p.entrega === "pendiente").length;
    if (sinMarcar > 0) {
      return sinMarcar === 1
        ? "Queda 1 parada sin marcar. Registra su resultado antes de cerrar."
        : `Quedan ${sinMarcar} paradas sin marcar. Registra su resultado antes de cerrar.`;
    }
    if (rechazadosPendientes.length > 0) {
      return rechazadosPendientes.length === 1
        ? `${rechazadosPendientes[0].nombre} rechazó la entrega y no está registrado. Regístralo para que el jefe lo sepa.`
        : `Hay ${rechazadosPendientes.length} rechazos sin registrar. Regístralos para que el jefe los vea.`;
    }
    return null;
  }, [paradas, rechazadosPendientes]);

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
    whatsapp,
    errorWhatsapp,
    avisando,
    avisarPedidos,
    reintentarAviso,
    marcarLlamada: onLlamada,
    marcarEntrega: onEntrega,
    registrarRechazoSuelto: onRechazoSuelto,
    marcarSinRespuesta: onSinRespuesta,
    rechazadosPendientes,
    motivoNoCerrar,
    deshacer: onDeshacer,
    dejarParaElFinal: onDejarParaElFinal,
    eliminarPedido: onEliminarPedido,
    restaurar: onRestaurar,
    confirmar,
  };
}
