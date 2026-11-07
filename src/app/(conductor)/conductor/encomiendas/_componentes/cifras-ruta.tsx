"use client";

// Los km y el tiempo de la ruta propuesta, y «Invertir orden de ruta» (spec 024;
// dueño, 2026-11-07: hacerla en el orden de ARES o al revés). Al revés puede medir
// distinto por los sentidos únicos, así que el estado dice cuánto: el conductor ve
// lo que cuesta antes de usarla.

import { ArrowUpDown, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { formatDistancia, formatDuracion } from "@/lib/comun/format";

/** Menos que esto de diferencia no se muestra: es ruido del trazado. */
const METROS_DIFERENCIA_VISIBLE = 50;

export function CifrasRuta({
  distanciaM,
  duracionS,
  invertida,
  distanciaDeAresM,
  invirtiendo,
  bloqueado,
  onInvertir,
}: {
  distanciaM: number | null;
  duracionS: number | null;
  /** El orden está al revés del que propuso ARES. */
  invertida: boolean;
  /** Lo que medía el orden de ARES (con su trazado). */
  distanciaDeAresM: number | null;
  /** Llega el trazado del orden invertido: las cifras todavía son las de antes. */
  invirtiendo: boolean;
  /** Se está guardando la ruta. */
  bloqueado: boolean;
  onInvertir: () => Promise<void>;
}) {
  const diferencia = invertida && distanciaM != null && distanciaDeAresM != null ? distanciaM - distanciaDeAresM : null;

  return (
    <>
      {distanciaM != null && duracionS != null ? (
        <div className={cn("mt-2.5 flex shrink-0 items-stretch gap-2", invirtiendo && "opacity-50")}>
          <span className="rounded-2xl bg-background px-3.5 py-2">
            <span className="block font-mono text-[22px] font-semibold leading-tight tracking-tight">
              {formatDistancia(distanciaM)}
            </span>
            <span className="text-xs text-muted">con la vuelta</span>
          </span>
          {/* El tiempo de ruta, con su reloj (terreno 2026-10-28). Es manejando,
              sin las entregas: lo dice la Ayuda, no la pantalla. Ocupa el resto,
              centrado en su tarjeta (dueño, 2026-11-07). */}
          <span className="flex-1 rounded-2xl bg-background px-3.5 py-2 text-center">
            <span className="block font-mono text-[22px] font-semibold leading-tight tracking-tight">
              {formatDuracion(duracionS)}
            </span>
            <span className="flex items-center justify-center gap-1 text-xs text-muted">
              <Clock className="h-3 w-3" aria-hidden />
              tiempo de ruta
            </span>
          </span>
        </div>
      ) : null}

      {invertida ? (
        <p className="mt-1.5 flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <ArrowUpDown className="h-3 w-3" aria-hidden />
          Orden invertido
          {diferencia != null && Math.abs(diferencia) >= METROS_DIFERENCIA_VISIBLE ? (
            <span className="font-mono">
              · {diferencia > 0 ? "+" : "−"}
              {formatDistancia(Math.abs(diferencia))}
            </span>
          ) : null}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void onInvertir()}
        disabled={invirtiendo || bloqueado}
        aria-busy={invirtiendo}
        className="mt-2 flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand transition-transform active:scale-[0.97] disabled:opacity-50"
      >
        {invirtiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpDown className="h-4 w-4" />}
        {invirtiendo ? "Invirtiendo…" : "Invertir orden de ruta"}
      </button>
    </>
  );
}
