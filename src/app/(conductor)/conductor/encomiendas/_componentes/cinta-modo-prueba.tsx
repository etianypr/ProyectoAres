"use client";

// "MODO PRUEBA" arriba de todo mientras nada se envía (ver
// lib/encomiendas/local/modo-prueba.ts): que no se confunda con un día real.
// Con el GPS simulado, «Desvío» lo hace tomar otra calle para probar que ARES
// traza de nuevo desde el auto (spec 047).

import { pedirDesvio, useGpsSimulado } from "@/lib/encomiendas/local/gps-simulado";

export function CintaModoPrueba({ visible }: { visible: boolean }) {
  const simulado = useGpsSimulado();
  if (!visible) return null;
  return (
    <div className="fixed left-1/2 top-[max(0.25rem,env(safe-area-inset-top))] z-cinta flex -translate-x-1/2 items-center gap-1 rounded-full border border-warn bg-warn-bg py-0.5 pl-3 pr-0.5 text-xs font-bold tracking-wide text-warn">
      <span className="pointer-events-none">MODO PRUEBA</span>
      {simulado ? (
        <button type="button" onClick={() => pedirDesvio()} className="rounded-full bg-card px-2 py-0.5 font-semibold tracking-normal active:opacity-60">
          Desvío
        </button>
      ) : (
        <span className="pr-2.5" />
      )}
    </div>
  );
}
