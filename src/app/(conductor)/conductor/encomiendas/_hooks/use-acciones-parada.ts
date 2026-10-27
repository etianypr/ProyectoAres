"use client";

// Lo que el conductor hace con la parada activa —llamar, contestó o no, las
// salidas, entregar— y las ventanas para deshacer lo marcado o lo eliminado
// (sale de pantalla.tsx, spec 002 T036). Los estados de flujo que no se pueden
// deducir de los datos viven acá.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { retenerEvento, type PedidoEliminado } from "@/lib/encomiendas/local/almacen";
import { esApp } from "@/lib/nativo/entorno";
import { llamar } from "@/lib/nativo/telefono";
import type { Salida } from "./fase-parada";
import { useLlamadaNativa, type LlamadaDetectada } from "./use-llamada-nativa";
import { MS_DESHACER, type DiaEnCurso, type Parada } from "./use-dia-trabajo";

// Cuánto queda a la vista el aviso del resultado de una llamada detectada.
const MS_AVISO_LLAMADA = 8000;

/** Cuánto se queda a la vista la confirmación de "pedido agregado". Suficiente
 *  para leerla de reojo mientras ya se está escribiendo el siguiente nombre, y
 *  poco como para no quedar tapando el botón de guardar. */
const MS_CONFIRMACION = 3_000;

export function useAccionesParada({
  dia,
  activa,
  paradas,
}: {
  dia: DiaEnCurso;
  activa: Parada | null;
  paradas: Parada[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Ya se marcó el número y falta que el conductor diga si contestó. Es el único
  // estado de flujo que no se puede deducir de los datos.
  const [esperandoResultadoDe, setEsperandoResultadoDe] = useState<string | null>(null);
  // Pedido para el que se está eligiendo QUÉ HACER con la parada que no se pudo
  // entregar: dejarla para el final o tacharla por hoy.
  const [dandoResultadoDe, setDandoResultadoDe] = useState<string | null>(null);
  // Lo último que se cerró, mientras se pueda deshacer.
  const [deshacer, setDeshacer] = useState<{
    pedidoId: string;
    eventoId: string;
    texto: string;
  } | null>(null);
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
    // El evento en la cola sigue la misma cuenta: retenido sin plazo mientras la
    // app está atrás, y con lo que le quedaba al volver. Si no, salía al
    // servidor con el aviso todavía a la vista (spec 017, E2).
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        clearTimeout(temporizador);
        restante = Math.max(0, restante - (Date.now() - desde));
        void retenerEvento(deshacer.eventoId, "9999-12-31T00:00:00.000Z");
      } else {
        void retenerEvento(deshacer.eventoId, new Date(Date.now() + restante).toISOString()).then(arrancar);
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

  // Dentro de la APK (spec 015) la llamada sale directo y, al colgar, la app lee
  // el registro de llamadas y marca sola si contestó. "No contestó" lleva derecho
  // a las salidas, igual que el botón. Si no se puede saber, se pregunta.
  const llamadaNativa = useLlamadaNativa({
    marcar: async (pedidoId, resultado) => {
      await correr(() => dia.marcarLlamada(pedidoId, resultado));
      setEsperandoResultadoDe((actual) => (actual === pedidoId ? null : actual));
      if (resultado === "no_contesto") setDandoResultadoDe(pedidoId);
    },
    alNoSaber: (pedidoId) => setEsperandoResultadoDe(pedidoId),
  });
  const { detectada: llamadaDetectada, olvidarDetectada } = llamadaNativa;

  // El aviso "Contestó · Corregir" queda unos segundos: lo que hay que hacer
  // después (entregar o elegir una salida) ya está en pantalla.
  useEffect(() => {
    if (!llamadaDetectada) return;
    const temporizador = window.setTimeout(olvidarDetectada, MS_AVISO_LLAMADA);
    return () => clearTimeout(temporizador);
  }, [llamadaDetectada, olvidarDetectada]);

  async function onContesto() {
    if (!activa) return;
    const id = activa.pedido.id;
    await correr(() => dia.marcarLlamada(id, "contesto"));
    setEsperandoResultadoDe(null);
  }

  async function onNoContesto() {
    if (!activa) return;
    const id = activa.pedido.id;
    // La llamada se registra igual: es un hecho, y de eso depende el fijo
    // diario. Lo que falta decidir es qué se hace con la parada.
    //
    // Salvo que ya estuviera marcada. Ahora se vuelve a esta pregunta cada vez
    // que el conductor sale de las salidas, y volver a escribirla pisaría la hora
    // real de la llamada con la de ahora.
    if (activa.pedido.llamada !== "no_contesto") {
      await correr(() => dia.marcarLlamada(id, "no_contesto"));
    }
    setEsperandoResultadoDe(null);
    // Derecho a las salidas, sin una pregunta intermedia.
    setDandoResultadoDe(id);
  }

  function onLlamar(parada: Parada) {
    if (esApp()) {
      void llamadaNativa.llamar(parada.pedido.id, parada.pedido.telefono).then((via) => {
        // Sin permiso de llamadas se abrió el marcador: se pregunta como siempre.
        if (via === "marcador") setEsperandoResultadoDe(parada.pedido.id);
      });
      return;
    }
    void llamar(parada.pedido.telefono);
    setEsperandoResultadoDe(parada.pedido.id);
  }

  /** El resultado detectado estaba mal (un buzón de voz que "contestó", por
   *  ejemplo): un toque lo da vuelta (spec 015, FR-006). */
  async function onCorregirLlamada(llamada: LlamadaDetectada) {
    olvidarDetectada();
    const correcto = llamada.resultado === "contesto" ? "no_contesto" : "contesto";
    await correr(() => dia.marcarLlamada(llamada.pedidoId, correcto));
    if (correcto === "no_contesto") setDandoResultadoDe(llamada.pedidoId);
    else setDandoResultadoDe((actual) => (actual === llamada.pedidoId ? null : actual));
  }

  async function onSalida(salida: Salida) {
    if (!activa) return;
    const id = activa.pedido.id;

    if (salida.clave === "pendiente") {
      const lugar = await correr(() => dia.dejarParaElFinal(id));
      setDandoResultadoDe(null);
      setEsperandoResultadoDe(null);
      // Sin evento no hay deshacer, pero la parada desaparece de arriba de la
      // lista: sin un aviso, parece que se perdió. Se dice DÓNDE quedó.
      const texto =
        lugar == null ? "Se reintenta al final de la ruta" : `Se reintenta más tarde: quedó ${lugar}.ª en la fila`;
      setConfirmacion((c) => ({ texto, n: (c?.n ?? 0) + 1 }));
      return;
    }

    const eventoId = await correr(() => dia.marcarResultado(id, salida.clave));
    setDandoResultadoDe(null);
    setEsperandoResultadoDe(null);
    if (eventoId) setDeshacer({ pedidoId: id, eventoId, texto: salida.aviso });
  }

  async function onPedidoFinalizado() {
    if (!activa) return;
    const id = activa.pedido.id;
    // Antes de escribir (lo que recalcula "activa") ubicamos a quién sigue, para
    // poder marcar su número de una vez.
    const siguiente = paradas.find(
      (p) => p.secuencia > activa.secuencia && p.pedido.resultado === "pendiente",
    );

    const eventoId = await correr(() => dia.marcarResultado(id, "entregado"));
    // La OF sigue a la vista mientras se puede deshacer: es el número que se
    // anota al entregar (spec 003).
    const of = activa.pedido.of;
    if (eventoId) {
      setDeshacer({ pedidoId: id, eventoId, texto: of ? `Entrega registrada · OF ${formatoOf(of)}` : "Entrega registrada" });
    }

    // En la APK la llamada saldría sin tocar nada, con el conductor quizás todavía
    // en la puerta: ahí la parada siguiente queda con "Llamar" como botón
    // principal (spec 015, FR-008). En el navegador se abre el marcador, que
    // igual espera el toque de llamar.
    if (siguiente && siguiente.pedido.telefono && !esApp()) {
      void llamar(siguiente.pedido.telefono);
      setEsperandoResultadoDe(siguiente.pedido.id);
    } else {
      setEsperandoResultadoDe(null);
    }
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
    const { pedidoId, eventoId } = deshacer;
    setDeshacer(null);
    const deshecho = await correr(() => dia.deshacer(pedidoId, eventoId));
    if (deshecho === false) setError("Ya se había enviado: no se puede deshacer. Si fue un error, avisa a la oficina.");
    // Volver a la parada reabierta como si no hubiera pasado nada: si venía de
    // "contestó", el paso que corresponde es finalizar; si no, llamar.
    setEsperandoResultadoDe(null);
  }

  return {
    error,
    setError,
    guardando,
    esperandoResultadoDe,
    setEsperandoResultadoDe,
    dandoResultadoDe,
    setDandoResultadoDe,
    deshacer,
    eliminado,
    confirmacion,
    setConfirmacion,
    correr,
    llamadaDetectada,
    onContesto,
    onNoContesto,
    onLlamar,
    onCorregirLlamada,
    onSalida,
    onPedidoFinalizado,
    onEliminarPedido,
    onDeshacerEliminado,
    onDeshacer,
  };
}
