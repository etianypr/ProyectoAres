"use client";

// La ruta propuesta a la vista: elegir otra alternativa, quitarle pedidos y
// usarla (sale de pantalla.tsx, spec 002 T036).

import { useCallback, useEffect, useRef, useState } from "react";
import { sinEtiquetaEscaneada, type PedidoEliminado } from "@/lib/encomiendas/local/almacen";
import {
  confirmarRutaLocal,
  devolverParada,
  elegirAlternativa,
  quitarParada,
  retrazar,
  type EstrategiaRuta,
  type PedidoUbicado,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import type { DiaEnCurso } from "./use-dia-trabajo";

/** El último pedido eliminado de la propuesta, para "Deshacer". */
export type QuitadoDeLaPropuesta = { recibo: PedidoEliminado; parada: PedidoUbicado; indice: number };

const idsDe = (p: PropuestaRuta) => p.paradas.map((x) => x.id).join();

export function usePropuesta({
  dia,
  alArmar,
}: {
  dia: DiaEnCurso;
  /** Armada la ruta: cuántos paquetes de la guía falta escanear (abre el aviso). */
  alArmar: (faltan: number) => void;
}) {
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

  const onUsarPropuesta = useCallback(async () => {
    if (!propuesta) return;
    const enLaRuta = propuesta.paradas.map((p) => p.id);
    await confirmarRutaLocal(propuesta);
    await dia.recargar();
    setPropuesta(null);
    // Armada la ruta, lo que sigue es cargar el auto: se abre el aviso con el
    // botón para escanear los paquetes (terreno 2026-10-27).
    const faltan = sinEtiquetaEscaneada(propuesta.paradas).length;
    if (faltan > 0) alArmar(faltan);
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
  }, [propuesta, dia, alArmar, setPropuesta]);

  return { propuesta, setPropuesta, onElegirAlternativa, onUsarPropuesta, quitado, onQuitar, onDeshacerQuitar };
}
