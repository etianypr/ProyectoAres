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
  cerrarRuta,
  deshacerEntrega,
  leerPedidos,
  leerRuta,
  marcarEntrega,
  marcarLlamada,
  moverAlFinal,
  rutaTerminada,
  type EstadoEntregaLocal,
  type EstadoLlamadaLocal,
  type PedidoLocal,
  type RutaLocal,
} from "@/lib/encomiendas/local/almacen";
import { useEnvioActividad } from "@/lib/encomiendas/local/enviar";

/** Cuánto tiempo se puede deshacer lo que se acaba de marcar. Mientras dure, el
 *  evento no sale del teléfono (ver marcarEntrega) y la jornada no se cierra:
 *  las dos cosas son irreversibles del lado del servidor.
 *
 *  Ocho segundos es lo que tarda en leerse el aviso y reaccionar manejando, sin
 *  que la entrega quede colgada tanto como para dudar de si se registró. */
export const MS_DESHACER = 8_000;

/** Una parada lista para mostrar: el pedido (que vive en el teléfono) más cómo
 *  le fue en el día. */
export type ParadaVista = {
  /** Orden de visita, empezando en 1. */
  secuencia: number;
  pedido: PedidoLocal;
  llamada: EstadoLlamadaLocal;
  entrega: EstadoEntregaLocal;
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
  marcarLlamada: (pedidoId: string, resultado: "contesto" | "no_contesto") => Promise<void>;
  /** Cierra una parada y devuelve el identificador para deshacerla, o null si
   *  ya estaba cerrada. El evento queda retenido MS_DESHACER; hasta que venza,
   *  ni sale al servidor ni se cierra la jornada. */
  marcarEntrega: (pedidoId: string, resultado: "entregado" | "omitido") => Promise<string | null>;
  /** Reabre la parada y borra su evento. Solo funciona dentro de la ventana. */
  deshacer: (pedidoId: string, eventoId: string) => Promise<void>;
  /** La parada sigue pendiente pero pasa a ser la última: el chofer va a
   *  reintentarla al terminar el resto. */
  dejarParaElFinal: (pedidoId: string) => Promise<void>;
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

  // Separada de recargar() a propósito: no escribe estado, así que el efecto de
  // abajo puede llamarla y recién después aplicar el resultado. Mezclar las dos
  // cosas hace que cualquier lectura desde un efecto parezca un setState
  // sincrónico, aunque ocurra después de esperar al teléfono.
  const leerTodo = useCallback(() => Promise.all([leerRuta(fecha), leerPedidos()]), [fecha]);

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
      await marcarLlamada({ fecha, pedidoId, choferId }, resultado);
      await recargar();
      intentar();
    },
    [fecha, choferId, recargar, intentar],
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
    const [rutaGuardada] = await leerTodo();
    if (rutaTerminada(rutaGuardada) && !rutaGuardada?.cerradaEn) await cerrarRuta(fecha);
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
    void (async () => {
      await cerrarRuta(fecha);
      await recargar();
      intentar();
    })();
  }, [fecha, fechaCargada, ruta, recargar, intentar]);

  const onEntrega = useCallback(
    async (pedidoId: string, resultado: "entregado" | "omitido") => {
      const eventoId = await marcarEntrega({ fecha, pedidoId, choferId }, resultado, MS_DESHACER);
      await recargar();
      return eventoId;
    },
    [fecha, choferId, recargar],
  );

  const onDeshacer = useCallback(
    async (pedidoId: string, eventoId: string) => {
      await deshacerEntrega({ fecha, pedidoId }, eventoId);
      await recargar();
    },
    [fecha, recargar],
  );

  const onDejarParaElFinal = useCallback(
    async (pedidoId: string) => {
      await moverAlFinal({ fecha, pedidoId });
      await recargar();
    },
    [fecha, recargar],
  );

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
      return pedido
        ? [{ secuencia: i + 1, pedido, llamada: parada.llamada, entrega: parada.entrega }]
        : [];
    });
  }, [ruta, pedidos]);

  // La parada activa es siempre la primera pendiente en orden de visita: no hay
  // que guardar un "puntero" aparte, se recalcula solo al actualizar.
  const activa = useMemo(
    () => paradas.find((p) => p.entrega === "pendiente") ?? null,
    [paradas],
  );

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
    marcarLlamada: onLlamada,
    marcarEntrega: onEntrega,
    deshacer: onDeshacer,
    dejarParaElFinal: onDejarParaElFinal,
    confirmar,
  };
}
