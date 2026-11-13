"use client";

// Lo que el conductor hace con la parada activa —llamar, las salidas,
// entregar— y las ventanas para deshacer lo marcado o lo eliminado
// (sale de pantalla.tsx, spec 002 T036). Los estados de flujo que no se pueden
// deducir de los datos viven acá.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { retenerEvento, type PedidoEliminado } from "@/lib/encomiendas/local/almacen";
import { llamar } from "@/lib/nativo/telefono";
import type { Salida } from "./fase-parada";
import { MS_DESHACER, type DiaEnCurso, type Parada } from "./use-dia-trabajo";
import { useReordenar } from "./use-reordenar";

/** Lo cerrado que se puede deshacer. Varias paradas cerradas dentro de la misma
 *  ventana (un doble toque, «Los 2») se deshacen juntas (spec 033). */
export type PorDeshacer = {
  eventos: { pedidoId: string; eventoId: string }[];
  texto: string;
  /** Cuándo vence (ms), para la cuenta de «Cerrar el día» (spec 033). */
  hasta: number;
};

function textoVarias(textos: string[]): string {
  if (textos.length === 1) return textos[0];
  return textos.every((t) => t.startsWith("Entrega")) ? `${textos.length} entregas registradas` : `${textos.length} paradas cerradas`;
}

/** Otro "Llamar" al mismo pedido dentro de este plazo es el mismo toque repetido
 *  (o la pantalla que tarda en pasar a la llamada): no vuelve a llamar. */
const MS_DOBLE_TOQUE = 5_000;

/** Cuánto se queda a la vista la confirmación de "pedido agregado". Suficiente
 *  para leerla de reojo mientras ya se está escribiendo el siguiente nombre, y
 *  poco como para no quedar tapando el botón de guardar. */
const MS_CONFIRMACION = 3_000;

export function useAccionesParada({
  dia,
  activa,
  fecha,
  juntas = [],
}: {
  dia: DiaEnCurso;
  activa: Parada | null;
  fecha: string;
  /** Las paradas en el mismo punto que la activa (misma-direccion.ts). */
  juntas?: Parada[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Pedido para el que se está eligiendo QUÉ HACER con la parada que no se pudo
  // entregar: dejarla para el final o tacharla por hoy.
  const [dandoResultadoDe, setDandoResultadoDe] = useState<string | null>(null);
  // «Pidió otra hora» abierto, y «¿Los 2?» de «Pedido entregado» (spec 033).
  const [eligiendoHoraDe, setEligiendoHoraDe] = useState<string | null>(null);
  const [juntasDe, setJuntasDe] = useState<string | null>(null);
  // Lo último que se cerró, mientras se pueda deshacer, con sus textos.
  const [deshacer, setDeshacer] = useState<(PorDeshacer & { textos: string[] }) | null>(null);
  // Lo último que se eliminó deslizándolo, mientras se pueda volver a poner. A
  // diferencia de `deshacer`, acá la escritura YA ocurrió: esto es el recibo
  // para revertirla, no un evento retenido.
  const [eliminado, setEliminado] = useState<PedidoEliminado | null>(null);
  // La confirmación de que un pedido se guardó. El contador es lo que hace que
  // la segunda seguida se vuelva a animar: cambia la clave del cartel, así que
  // React lo monta de nuevo en vez de dejar el de la primera quieto ahí.
  //
  // Vive acá y no en el formulario que lo produce porque todos los avisos de esta
  // pantalla salen del mismo lugar (ver PilaNotificaciones).
  const [confirmacion, setConfirmacion] = useState<{ texto: string; n: number } | null>(null);
  /** Una confirmación que se va sola (ver MS_CONFIRMACION). */
  const avisar = useCallback(
    (texto: string) => setConfirmacion((c) => ({ texto, n: (c?.n ?? 0) + 1 })),
    [],
  );

  // ------------------------------------------------------------------------
  // La ventana para deshacer
  // ------------------------------------------------------------------------
  // Se cuenta con reloj propio y se PAUSA con la app en segundo plano: al
  // finalizar un pedido se marca solo el teléfono del siguiente, así que el
  // conductor se va a la app de llamadas y volvería con la ventana vencida sin
  // haber tenido oportunidad de ver el aviso.
  //
  // `confirmar` se lee de un ref: la función cambia de identidad en cada
  // dibujado, y como dependencia reiniciaría la cuenta una y otra vez —el aviso
  // no se iría nunca y la entrega no saldría del teléfono.
  const confirmarRef = useRef(dia.confirmar);
  useEffect(() => {
    confirmarRef.current = dia.confirmar;
  });

  useEffect(() => {
    if (!deshacer) return;

    let restante = MS_DESHACER;
    let desde = Date.now();
    let temporizador = 0;

    const vencer = () => {
      setDeshacer(null);
      void confirmarRef.current();
    };
    const arrancar = () => {
      desde = Date.now();
      temporizador = window.setTimeout(vencer, restante);
    };
    // Todos los eventos de la ventana con el mismo plazo: uno cerrado antes no
    // puede salir mientras el «Deshacer» que lo incluye sigue a la vista.
    const retener = (hasta: string) => Promise.all(deshacer.eventos.map((e) => retenerEvento(e.eventoId, hasta)));
    if (deshacer.eventos.length > 1) void retener(new Date(Date.now() + restante).toISOString());
    // El evento en la cola sigue la misma cuenta: retenido sin plazo mientras la
    // app está atrás, y con lo que le quedaba al volver. Si no, salía al
    // servidor con el aviso todavía a la vista (spec 017, E2).
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        clearTimeout(temporizador);
        restante = Math.max(0, restante - (Date.now() - desde));
        void retener("9999-12-31T00:00:00.000Z");
      } else {
        void retener(new Date(Date.now() + restante).toISOString()).then(arrancar);
      }
    };

    arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [deshacer]);

  // La ventana para volver a poner un pedido eliminado. Es un temporizador
  // simple, sin la pausa en segundo plano que necesita el de arriba: acá no hay
  // nada retenido esperando salir —el pedido ya se borró— así que vencer solo
  // quiere decir que la oferta de restaurarlo se retira. El recibo se pierde con
  // la app cerrada y eso es correcto: un pedido que reapareciera solo sería peor
  // que uno que se fue.
  useEffect(() => {
    if (!eliminado) return;
    // Vencida la ventana, si el borrado dejó la ruta sin pendientes el día se
    // cierra como cuando se marca la última parada (spec 017, E7).
    const temporizador = window.setTimeout(() => {
      setEliminado(null);
      void confirmarRef.current();
    }, MS_DESHACER);
    return () => clearTimeout(temporizador);
  }, [eliminado]);

  useEffect(() => {
    if (!confirmacion) return;
    const temporizador = window.setTimeout(() => setConfirmacion(null), MS_CONFIRMACION);
    return () => clearTimeout(temporizador);
  }, [confirmacion]);

  // Envuelve una escritura del conductor: apaga los botones mientras corre y deja
  // el mensaje a la vista si falla.
  const correr = useCallback(async <T,>(accion: () => Promise<T>): Promise<T | null> => {
    setError(null);
    setGuardando(true);
    try {
      return await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  }, []);

  // Llamar es solo para coordinar la entrega (el dueño, 2026-11-06): no se anota
  // si contestó ni se pregunta. Dentro de la APK sale directo (spec 015); queda
  // la hora de la primera llamada, que dice que ya se lo llamó.
  const ultimaLlamada = useRef<{ pedidoId: string; ms: number } | null>(null);
  // Solo usa el pedido: también llama a uno de afuera de la ruta (spec 023).
  function onLlamar(parada: Pick<Parada, "pedido">) {
    const { id, telefono } = parada.pedido;
    const previa = ultimaLlamada.current;
    if (previa?.pedidoId === id && Date.now() - previa.ms < MS_DOBLE_TOQUE) return;
    ultimaLlamada.current = { pedidoId: id, ms: Date.now() };
    void llamar(telefono);
    // Uno de afuera de la ruta no tiene parada donde anotar la llamada: se llama
    // igual, sin el error rojo «no está en la ruta» (auditoría, 2026-11-10).
    if (dia.ruta?.orden.includes(id)) void correr(() => dia.registrarLlamada(id));
  }

  const reordenar = useReordenar({ fecha, dia, correr, avisar });

  /** Suma lo recién cerrado al «Deshacer» a la vista, o abre uno nuevo. */
  function ofrecerDeshacer(nuevos: { pedidoId: string; eventoId: string }[], textos: string[]) {
    if (nuevos.length === 0) return;
    setDeshacer((d) => {
      const todos = d ? [...d.textos, ...textos] : textos;
      return { eventos: [...(d?.eventos ?? []), ...nuevos], textos: todos, texto: textoVarias(todos), hasta: Date.now() + MS_DESHACER };
    });
  }

  async function onSalida(salida: Salida) {
    if (!activa) return;
    const id = activa.pedido.id;

    if (salida.clave === "pendiente") {
      // Dice DÓNDE quedó, con «Deshacer» (use-reordenar.ts).
      await reordenar.dejarPendiente(id);
      setDandoResultadoDe(null);
      return;
    }

    const eventoId = await correr(() => dia.marcarResultado(id, salida.clave));
    setDandoResultadoDe(null);
    if (eventoId) ofrecerDeshacer([{ pedidoId: id, eventoId }], [salida.aviso]);
  }

  /** «Pidió otra hora» con el bloque elegido (spec 033, otra-hora). */
  async function onHora(bloqueId: string) {
    if (!activa) return;
    await reordenar.otraHora(activa.pedido.id, bloqueId);
    setEligiendoHoraDe(null);
    setDandoResultadoDe(null);
  }

  /** «Pedido entregado». Con paradas en el mismo punto, primero pregunta «¿Los
   *  2?» (spec 033, misma-dir); `todos` entrega también esas, un evento cada una. */
  async function onPedidoFinalizado(todos?: boolean) {
    if (!activa) return;
    if (todos === undefined && juntas.length > 0) {
      setJuntasDe(activa.pedido.id);
      return;
    }
    setJuntasDe(null);
    const nuevos: { pedidoId: string; eventoId: string }[] = [];
    const textos: string[] = [];
    for (const p of [activa, ...(todos ? juntas : [])]) {
      const eventoId = await correr(() => dia.marcarResultado(p.pedido.id, "entregado"));
      if (!eventoId) continue;
      nuevos.push({ pedidoId: p.pedido.id, eventoId });
      // La OF sigue a la vista mientras se puede deshacer: es el número que se
      // anota al entregar (spec 003).
      textos.push(p.pedido.of ? `Entrega registrada · OF ${formatoOf(p.pedido.of)}` : "Entrega registrada");
    }
    ofrecerDeshacer(nuevos, textos);
  }

  /** Un pedido que el conductor deslizó hacia la izquierda y eliminó.
   *
   *  Sirve tanto para los que están fuera de la ruta como para las paradas de la
   *  ruta del día: el almacén saca las dos cosas en una transacción y devuelve el
   *  recibo con el lugar que ocupaba, así que deshacer la deja donde estaba y no
   *  al final. */
  async function onEliminarPedido(pedidoId: string) {
    const recibo = await correr(() => dia.eliminarPedido(pedidoId));
    // null = ya no estaba (dos gestos sobre la misma fila). Sin recibo no hay
    // nada que ofrecer deshacer.
    if (recibo) setEliminado(recibo);
  }

  async function onDeshacerEliminado() {
    if (!eliminado) return;
    const recibo = eliminado;
    setEliminado(null);
    await correr(() => dia.restaurar(recibo));
  }

  async function onDeshacer() {
    if (!deshacer) return;
    const { eventos } = deshacer;
    setDeshacer(null);
    // Del último al primero: la ruta vuelve a quedar como antes del primer toque.
    let todos = true;
    for (const { pedidoId, eventoId } of [...eventos].reverse()) {
      if ((await correr(() => dia.deshacer(pedidoId, eventoId))) === false) todos = false;
    }
    if (!todos) setError("No se pudo deshacer.");
  }

  return {
    error,
    setError,
    guardando,
    dandoResultadoDe,
    setDandoResultadoDe,
    eligiendoHoraDe,
    setEligiendoHoraDe,
    juntasDe,
    setJuntasDe,
    deshacer,
    eliminado,
    confirmacion,
    avisar,
    correr,
    onLlamar,
    onSalida,
    onHora,
    onPedidoFinalizado,
    reordenar,
    onEliminarPedido,
    onDeshacerEliminado,
    onDeshacer,
  };
}
