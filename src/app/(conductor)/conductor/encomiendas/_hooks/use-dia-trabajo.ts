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
import { borrarPedido, cerrarDia, purgarFotosCerradas, deshacerResultado, leerPedidos, leerRuta, marcarResultado, marcarLlamada, pedidosEnOrden, restaurarPedido, rutaTerminada, type PedidoEliminado, type Pedido, type Ruta } from "@/lib/encomiendas/local/almacen";
import { estaConfirmado, type ResultadoMarcable } from "@/lib/encomiendas/estados";

import { dejarParaMasTarde, sumarALaRuta } from "@/lib/encomiendas/local/sumar-a-ruta";
import { useEnvioActividad } from "@/lib/encomiendas/local/enviar";
import type { DiaEnCurso, Parada } from "./dia-trabajo-tipos";
import { useWhatsappDia } from "./use-whatsapp-dia";

/** Cuánto tiempo se puede deshacer lo que se acaba de marcar. Mientras dure, el
 *  evento no sale del teléfono (ver marcarResultado) y el día no se cierra:
 *  las dos cosas son irreversibles del lado del servidor.
 *
 *  Ocho segundos es lo que tarda en leerse el aviso y reaccionar manejando, sin
 *  que la entrega quede colgada tanto como para dudar de si se registró. */
export const MS_DESHACER = 8_000;

// Parada y DiaEnCurso viven en dia-trabajo-tipos.ts (spec 002 T041).
export type { DiaEnCurso, Parada } from "./dia-trabajo-tipos";

export function useDiaTrabajo({
  conductorId,
  fecha,
  whatsapp,
}: {
  conductorId: string;
  /** El día en curso. La app del conductor no trabaja días pasados: de los
   *  anteriores solo se muestra el resumen del último (ver use-avisos-del-dia.ts). */
  fecha: string;
  /** false = sin credenciales de Meta en el servidor: no se mandan avisos ni se
   *  consultan respuestas, y no hay error que mostrar (spec 013). */
  whatsapp: boolean;
}): DiaEnCurso {
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  // Qué fecha corresponde a lo que hay ahora en "ruta"/"pedidos". "Cargando" se
  // deduce de acá en vez de guardarse aparte: al cambiar de día, los datos en
  // memoria son del día anterior y no hay que mostrarlos como si fueran de este.
  const [fechaCargada, setFechaCargada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    pendientes: sinEnviar,
    enviando,
    intentar,
    error: errorEnvio,
    rechazados,
  } = useEnvioActividad(true, conductorId, fecha);

  // WhatsApp: avisos, respuestas y el sondeo (ver use-whatsapp-dia.ts). Se
  // engancha más abajo, cuando ya existen recargar y confirmar.

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
  // aviso de deshacer del primero. El conductor perdería la ventana para
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
        await marcarLlamada({ fecha, pedidoId, conductorId }, resultado);
        await recargar();
        intentar();
      });
    },
    [fecha, conductorId, recargar, intentar, unaSolaVez],
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
    // Vencida la ventana, las fotos de lo ya cerrado no hacen falta (spec 003).
    await purgarFotosCerradas(fecha).catch(() => 0);
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
  // día antes de que el conductor pueda arrepentirse, que es lo contrario de lo
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
        const eventoId = await marcarResultado({ fecha, pedidoId, conductorId }, resultado, MS_DESHACER);
        await recargar();
        return eventoId;
      }),
    [fecha, conductorId, recargar, unaSolaVez],
  );

  const onDeshacer = useCallback(
    async (pedidoId: string, eventoId: string) => {
      let deshecho = false;
      await unaSolaVez(`deshacer:${eventoId}`, async () => {
        deshecho = await deshacerResultado({ fecha, pedidoId }, eventoId);
        await recargar();
      });
      return deshecho;
    },
    [fecha, recargar, unaSolaVez],
  );

  const onDejarParaElFinal = useCallback(
    async (pedidoId: string) => {
      return unaSolaVez(`final:${pedidoId}`, async () => {
        const lugar = await dejarParaMasTarde(fecha, pedidoId);
        await recargar();
        return lugar;
      });
    },
    [fecha, recargar, unaSolaVez],
  );

  const onSumarALaRuta = useCallback(
    async () =>
      (await unaSolaVez("sumar", async () => {
        const cuantos = await sumarALaRuta(fecha);
        await recargar();
        return cuantos;
      })) ?? 0,
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

  const { errorWhatsapp, cambiosRuta, avisando, avisarPedidos, vistoCambioRuta } = useWhatsappDia({
    whatsapp,
    conductorId,
    fecha,
    recargar,
    confirmar,
  });

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
    errorEnvio,
    rechazados,
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
    sumarALaRuta: onSumarALaRuta,
    eliminarPedido: onEliminarPedido,
    restaurar: onRestaurar,
    confirmar,
  };
}
