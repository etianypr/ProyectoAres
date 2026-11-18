"use client";

// La ruta propuesta a la vista: elegir otra alternativa, quitarle pedidos y
// usarla (sale de pantalla.tsx, spec 002 T036).

import { useCallback, useEffect, useRef, useState } from "react";
import { hastaAbortar } from "@/lib/comun/hasta-abortar";
import { leerPedidos, type PedidoEliminado } from "@/lib/encomiendas/local/almacen";
import {
  calcularRutaLocal,
  conPedidoCorregido,
  confirmarRutaLocal,
  devolverParada,
  elegirAlternativa,
  guardarPropuestaVista,
  invertirOrden,
  mantenerLejana,
  olvidarPropuesta,
  propuestaGuardada,
  quitarParada,
  retrazar,
  type EstrategiaRuta,
  type PedidoUbicado,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import { useAtrasPropio } from "./use-atras-propio";
import type { DiaEnCurso } from "./use-dia-trabajo";

/** El último pedido eliminado de la propuesta, para "Deshacer". */
export type QuitadoDeLaPropuesta = { recibo: PedidoEliminado; parada: PedidoUbicado; indice: number };

const idsDe = (p: PropuestaRuta) => p.paradas.map((x) => x.id).join();

export function usePropuesta({ dia, fecha }: { dia: DiaEnCurso; fecha: string }) {
  const [propuesta, setPropuestaEstado] = useState<PropuestaRuta | null>(null);
  const [quitado, setQuitado] = useState<QuitadoDeLaPropuesta | null>(null);
  // La última propuesta, para lo que termina después de un await: dos pedidos
  // eliminados seguidos no pueden pisarse.
  const actualRef = useRef<PropuestaRuta | null>(null);
  useEffect(() => {
    actualRef.current = propuesta;
  }, [propuesta]);

  const setPropuesta = useCallback((p: PropuestaRuta | null) => {
    actualRef.current = p;
    setPropuestaEstado(p);
    setQuitado(null);
  }, []);

  // La propuesta a la vista queda guardada en el teléfono: si la app se cierra antes
  // de usarla, al abrir vuelve sola, sin armarla de nuevo ni consultar a ORS (dueño,
  // 2026-11-09; generar-ruta/propuesta-guardada.ts). También la de «Rehacer la ruta»
  // a mitad del día. Se busca una vez por día, con el día ya leído.
  const revisadaRef = useRef<string | null>(null);
  useEffect(() => {
    if (dia.cargando || revisadaRef.current === fecha) return;
    revisadaRef.current = fecha;
    void propuestaGuardada(fecha, dia.pedidos)
      .then((guardada) => {
        if (guardada && !actualRef.current) setPropuesta(guardada);
      })
      .catch(() => {});
  }, [dia.cargando, dia.pedidos, fecha, setPropuesta]);

  // Cada cambio a la vista se guarda; al usarla o descartarla, se olvida. Solo al
  // pasar de haber una a no haber ninguna: al abrir todavía no hay y no se borra.
  // La firma se calcula con lo guardado en el teléfono; `dia.pedidos` queda en las
  // dependencias para volver a guardarla cuando un pedido cambia.
  const habiaRef = useRef(false);
  useEffect(() => {
    if (propuesta) {
      habiaRef.current = true;
      void guardarPropuestaVista(fecha, propuesta).catch(() => {});
    } else if (habiaRef.current) {
      habiaRef.current = false;
      void olvidarPropuesta(fecha).catch(() => {});
    }
  }, [propuesta, dia.pedidos, fecha]);

  // Cambiar de alternativa pide el trazado de la nueva (una consulta), así que
  // la propuesta se reemplaza recién cuando llega. Si la consulta falla, la
  // pantalla se queda con la que estaba: mejor eso que un mapa en blanco.
  const onElegirAlternativa = useCallback(
    async (estrategia: EstrategiaRuta) => {
      if (!propuesta) return;
      setPropuesta(await elegirAlternativa(propuesta, estrategia));
    },
    [propuesta, setPropuesta],
  );

  /** Cambia las paradas a la vista ya, y el trazado cuando llega (si para
   *  entonces las paradas siguen siendo esas). */
  const ponerParadas = useCallback((nueva: PropuestaRuta) => {
    actualRef.current = nueva;
    setPropuestaEstado(nueva);
    const ids = idsDe(nueva);
    void retrazar(nueva).then((conTrazado) => {
      const actual = actualRef.current;
      if (!actual || idsDe(actual) !== ids) return;
      actualRef.current = conTrazado;
      setPropuestaEstado(conTrazado);
    });
  }, []);

  /** Eliminar un pedido al revisar la ruta (terreno 2026-10-28): sale del
   *  teléfono como en la lista, y de la propuesta. */
  const onQuitar = useCallback(
    async (pedidoId: string) => {
      const antes = actualRef.current;
      const indice = antes ? antes.paradas.findIndex((p) => p.id === pedidoId) : -1;
      if (!antes || indice < 0) return;
      const parada = antes.paradas[indice];
      const recibo = await dia.eliminarPedido(pedidoId);
      const actual = actualRef.current;
      if (!recibo || !actual) return;
      ponerParadas(quitarParada(actual, pedidoId));
      setQuitado({ recibo, parada, indice });
    },
    [dia, ponerParadas],
  );

  const onDeshacerQuitar = useCallback(async () => {
    if (!quitado) return;
    setQuitado(null);
    await dia.restaurar(quitado.recibo);
    const actual = actualRef.current;
    if (actual) ponerParadas(devolverParada(actual, quitado.parada, quitado.indice));
  }, [quitado, dia, ponerParadas]);

  /** «Invertir orden de ruta» (spec 024): la primera vez pide el trazado del
   *  orden al revés; después, ir y volver no consulta (las dos quedan guardadas).
   *  Mientras llega, la propuesta queda `esperaTrazado` y el panel no deja tocar
   *  nada. Lo eliminado se deshace en su mismo lugar, contado desde el otro extremo. */
  const onInvertir = useCallback(async () => {
    const actual = actualRef.current;
    if (!actual) return;
    const nueva = invertirOrden(actual);
    if (nueva === actual) return;
    setQuitado((q) => (q ? { ...q, indice: actual.paradas.length - q.indice } : q));
    actualRef.current = nueva;
    setPropuestaEstado(nueva);
    if (!nueva.esperaTrazado) return;
    // Si falla, queda sin trazado (y sin esperarlo): no se traba el panel ni se reintenta.
    const conTrazado = await retrazar(nueva).catch(() => ({
      ...nueva,
      trazado: null,
      tramos: null,
      distanciaM: null,
      duracionS: null,
      sinTrazado: true,
      esperaTrazado: undefined,
    }));
    if (actualRef.current !== nueva) return;
    actualRef.current = conTrazado;
    setPropuestaEstado(conTrazado);
  }, []);

  /** Se guardó la corrección de un pedido con la propuesta a la vista (spec 037): su
   *  punto nuevo entra a la propuesta sin mover el orden, y el trazado se rehace
   *  aparte. El orden nuevo lo pide el conductor con «Recalcular ruta». */
  const onPedidoCorregido = useCallback(
    async (pedidoId: string) => {
      const actual = actualRef.current;
      if (!actual) return;
      const pedido = (await leerPedidos(fecha)).find((p) => p.id === pedidoId);
      const vigente = actualRef.current;
      if (!pedido || !vigente) return;
      ponerParadas(conPedidoCorregido(vigente, pedido));
    },
    [fecha, ponerParadas],
  );

  /** «Mantener»: la lejana se queda en la ruta tal como está (spec 037). */
  const onMantenerLejana = useCallback((pedidoId: string) => {
    const actual = actualRef.current;
    if (!actual) return;
    actualRef.current = mantenerLejana(actual, pedidoId);
    setPropuestaEstado(actualRef.current);
  }, []);

  // «Recalcular ruta» se cancela como «Optimizar ruta» (spec 033, buscando-trabado):
  // atrás u onCancelarRecalculo cortan la búsqueda con AbortError, vuelve al tiro y la
  // propuesta a la vista queda como estaba (spec 038: sin conexión no hay que esperarla).
  const recalculoRef = useRef<AbortController | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const onCancelarRecalculo = useCallback(() => {
    recalculoRef.current?.abort();
  }, []);
  useAtrasPropio(recalculando, onCancelarRecalculo);

  /** «Recalcular ruta» (spec 037): vuelve a optimizar con los puntos corregidos, desde
   *  y hasta donde estaba la propuesta. Lee los pedidos del teléfono, así que no hace
   *  falta pasarle nada. Si falla, la propuesta a la vista queda como estaba. */
  const onRecalcular = useCallback(async () => {
    const actual = actualRef.current;
    if (!actual) return;
    recalculoRef.current?.abort();
    const control = new AbortController();
    recalculoRef.current = control;
    setRecalculando(true);
    try {
      const desde = { tipo: "gps", lat: actual.partida.lat, lng: actual.partida.lng } as const;
      const hasta = actual.llegada ? ({ tipo: "gps", lat: actual.llegada.lat, lng: actual.llegada.lng } as const) : undefined;
      // Cancelado, null al tiro: no espera el próximo paso de la búsqueda.
      const nueva = await hastaAbortar(calcularRutaLocal(fecha, desde, hasta, control.signal), control.signal);
      if (nueva && !control.signal.aborted) setPropuesta(nueva);
    } finally {
      if (recalculoRef.current === control) {
        recalculoRef.current = null;
        setRecalculando(false);
      }
    }
  }, [fecha, setPropuesta]);

  const onUsarPropuesta = useCallback(async () => {
    if (!propuesta) return;
    const enLaRuta = propuesta.paradas.map((p) => p.id);
    await confirmarRutaLocal(propuesta);
    await dia.recargar();
    setPropuesta(null);
    // Armada la ruta, lo que sigue es cargar el auto: lo pide la cabecera de la
    // hoja (spec 027), sin una ventana encima que se cierra por error.
    // Acá se cumple FR-007: el aviso sale en cuanto el pedido queda ubicado
    // DENTRO de una ruta, no al cargarlo. Antes de eso no hay nada que
    // prometerle al receptor — todavía podía caerse por una dirección que no se
    // pudo ubicar.
    //
    // No se espera el resultado: son treinta consultas al servidor y el conductor no
    // tiene por qué mirar una pantalla trabada mientras salen. Lo que salió y lo
    // que falló queda en el estado de cada pedido (dia.whatsapp), con su
    // botón de reintentar al lado.
    void dia.avisarPedidos(enLaRuta);
  }, [propuesta, dia, setPropuesta]);

  return {
    propuesta, setPropuesta, onElegirAlternativa, onUsarPropuesta, quitado, onQuitar, onDeshacerQuitar, onInvertir,
    onPedidoCorregido, onMantenerLejana, onRecalcular, recalculando, onCancelarRecalculo,
  };
}
