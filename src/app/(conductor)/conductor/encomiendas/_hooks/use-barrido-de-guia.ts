"use client";

// El barrido de la nómina dentro de «Cargar la guía» (sale de cargar-guia.tsx, spec 034):
// una sola lectura por guía. «Terminar» pasa las líneas a la guía y la lectura sigue: al
// barrer otra vez se continúa, con lo ya leído en verde, y entran solo las OF nuevas o las
// que quedaron firmes. Los votos se guardan con el borrador (use-borrador-guia.ts) para
// seguir aunque el celular se bloquee o Android cierre ARES (dueño, 2026-11-15).

import { useRef, useState } from "react";
import { ajusteDelBarrido } from "@/lib/encomiendas/lectura/ajustes-barrido";
import { lineasDelBarrido, type BarridoGuardado, type VotosBarrido } from "@/lib/encomiendas/lectura/barrido-a-guia";
import { resultadoDelBarrido } from "@/lib/encomiendas/lectura/votos-barrido";
import type { ZonaViva } from "@/lib/nativo/escaner-vivo";
import { useBarridoDisponible, useBarridoNomina, type Barrido } from "./use-barrido-nomina";

export function useBarridoDeGuia({
  alSumar,
  alSobrar,
  alVacio,
  guardarYa,
  zona,
}: {
  /** La parte libre del recuadro, para las flechas (spec 036; visor-guia.tsx). */
  zona?: () => ZonaViva | null;
  /** Las líneas nuevas del barrido, para sumarlas a la guía (con sus bultos, si se leyeron). */
  alSumar: (
    lineas: { of: string; destino: string; bultos?: number; porPagar?: boolean }[],
    total: number | null,
    porConfirmar: Set<string>,
    orden: string[],
  ) => void;
  /** OF entregadas por confirmar que resultaron ser una mala lectura de otra. */
  alSobrar: (ofs: string[]) => void;
  /** Se terminó sin leer ninguna OF. */
  alVacio: () => void;
  /** Escribe el borrador al tiro (el celular se está bloqueando). */
  guardarYa: (b: BarridoGuardado) => void;
}) {
  /** Lo que va al borrador: los votos y lo ya entregado a la guía. */
  const [guardado, setGuardado] = useState<BarridoGuardado | null>(null);
  const ultimo = useRef<BarridoGuardado | null>(null);
  const disponible = useBarridoDisponible();

  function anotar(votos: VotosBarrido, entregadas = ultimo.current?.entregadas ?? {}): BarridoGuardado | null {
    // Solo los votos (OF y direcciones): el cuadro crudo del barrido trae nombres y no se
    // guarda, y tampoco los números sueltos de cada cuadro, que son solo para Diagnóstico.
    const soloVotos = (v: VotosBarrido["porFilas"]) => ({ ...v, numeros: {} });
    const b = votos.porFilas.cuadros > 0 ? { porFilas: soloVotos(votos.porFilas), comoLlegan: soloVotos(votos.comoLlegan), entregadas } : null;
    ultimo.current = b;
    setGuardado(b);
    return b;
  }

  /** Lo barrido se suma a lo que ya hay, como una foto más; lo que no quedó firme llega
   *  por confirmar. Lo leyó el teléfono: origen `guia_foto`. */
  function agregar(b: Barrido) {
    // Con «Botar fantasmas» (Diagnóstico, spec 036), lo que se bota en vivo tampoco pasa a la guía.
    const r = resultadoDelBarrido(b, { fantasmas: ajusteDelBarrido("botarFantasmas") });
    const leido = lineasDelBarrido(r, ultimo.current?.entregadas);
    anotar(b, leido.entregadas);
    alSobrar(leido.sobran);
    if (leido.lineas.length > 0) alSumar(leido.lineas, leido.total, leido.porConfirmar, leido.orden);
    else if (Object.keys(leido.entregadas).length === 0) alVacio();
  }

  const barrer = useBarridoNomina(agregar, {
    conAtras: false,
    seguir: true,
    zona,
    previo: () => ultimo.current,
    alGuardar: (votos, urgente) => {
      const b = anotar(votos);
      if (urgente && b) guardarYa(b);
    },
  });

  return {
    barrer,
    guardado,
    onBarrer: disponible ? () => void barrer.iniciar() : undefined,
    /** Al abrir la app con un borrador que traía un barrido. */
    restaurar: (b: BarridoGuardado | undefined) => {
      ultimo.current = b ?? null;
      setGuardado(b ?? null);
    },
    /** Se crearon los pedidos o se descartó la guía: la lectura parte de cero. */
    olvidar: () => {
      barrer.olvidar();
      ultimo.current = null;
      setGuardado(null);
    },
  };
}
