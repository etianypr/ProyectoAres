"use client";

// La ruta propuesta a la vista: elegir otra alternativa y usarla (sale de
// pantalla.tsx, spec 002 T036).

import { useCallback, useState } from "react";
import { sinEtiquetaEscaneada } from "@/lib/encomiendas/local/almacen";
import {
  confirmarRutaLocal,
  elegirAlternativa,
  type EstrategiaRuta,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import type { DiaEnCurso } from "./use-dia-trabajo";

export function usePropuesta({
  dia,
  alArmar,
}: {
  dia: DiaEnCurso;
  /** Armada la ruta: cuántos paquetes de la guía falta escanear (abre el aviso). */
  alArmar: (faltan: number) => void;
}) {
  const [propuesta, setPropuesta] = useState<PropuestaRuta | null>(null);

  // Cambiar de alternativa pide el trazado de la nueva (una consulta), así que
  // la propuesta se reemplaza recién cuando llega. Si la consulta falla, la
  // pantalla se queda con la que estaba: mejor eso que un mapa en blanco.
  const onElegirAlternativa = useCallback(
    async (estrategia: EstrategiaRuta) => {
      if (!propuesta) return;
      setPropuesta(await elegirAlternativa(propuesta, estrategia));
    },
    [propuesta],
  );

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
  }, [propuesta, dia, alArmar]);

  return { propuesta, setPropuesta, onElegirAlternativa, onUsarPropuesta };
}
