"use client";

// La capa sobre la cámara al barrer la nómina («Cargar la guía» → «Barrer la nómina» y
// Diagnóstico → «Probar barrido de nómina»; hook use-barrido-nomina): si está leyendo, cuántas OF
// van confirmadas y la última, con su dirección (dueño, 2026-11-11: «necesito feedback
// de qué lee»). Los recuadros sobre el texto no van aquí: los dibuja Android
// (MarcasEscaner.java), porque cada redibujo de la WebView con la cámara encendida
// traba la pantalla.

import { useState } from "react";
import { createPortal } from "react-dom";
import { Flashlight, FlashlightOff, Loader2, X } from "lucide-react";
import type { LineaNomina } from "@/lib/encomiendas/lectura/barrido-nomina";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { linternaViva } from "@/lib/nativo/escaner-vivo";

export type EstadoBarrido = "sinTexto" | "sinBloques" | "leyendo";

const ESTADOS: Record<EstadoBarrido, string> = {
  sinTexto: "No veo texto: acerca el teléfono o dale más luz",
  sinBloques: "Veo texto, pero ningún encargo entero: más despacio",
  leyendo: "Leyendo la nómina",
};

export type VistaBarrido = {
  estado: EstadoBarrido;
  firmes: number;
  porConfirmar: number;
  total: number | null;
  ultima: Pick<LineaNomina, "of" | "destino"> | null;
  /** Las OF confirmadas: sus encargos van en verde y con ✓ sobre la cámara. */
  confirmadas: Set<string>;
  /** Cada número leído → la OF que quedó (resultadoNomina). */
  deLectura: Record<string, string>;
};

export function CamaraBarrido({
  vista,
  conLinterna,
  onDetener,
  onCerrar = onDetener,
  pregunta,
}: {
  /** null mientras prende la cámara. */
  vista: VistaBarrido | null;
  conLinterna: boolean;
  /** «Terminar»: suma lo barrido. */
  onDetener: () => void;
  /** La ✕ (spec 033): en «Cargar la guía» descarta lo barrido, no lo suma. */
  onCerrar?: () => void;
  /** «¿Descartar lo barrido?» en el lugar de «Terminar». */
  pregunta?: React.ReactNode;
}) {
  // Se monta con la cámara: al apagarla, la linterna se apaga con ella.
  const [linterna, setLinterna] = useState(false);

  return createPortal(
    <div className="capa-camara fixed inset-0 z-[60] flex flex-col">
      <div className="flex items-center gap-2 bg-black/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <p className="flex-1 text-sm font-semibold">Barrido de nómina</p>
        {conLinterna ? (
          <button
            type="button"
            aria-label={linterna ? "Apagar la linterna" : "Prender la linterna"}
            aria-pressed={linterna}
            onClick={() => {
              const prender = !linterna;
              void linternaViva(prender).then((ok) => ok && setLinterna(prender));
            }}
            className="flex h-11 w-11 items-center justify-center"
          >
            {linterna ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        ) : null}
        <button type="button" onClick={onCerrar} aria-label="Detener" className="flex h-11 w-11 items-center justify-center">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1" />
      <div className="space-y-2 bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {vista ? (
          <>
            <p className={vista.estado === "leyendo" ? "text-sm font-semibold" : "text-sm font-semibold text-warn"}>
              {vista.estado === "leyendo" ? "● " : "⚠ "}
              {ESTADOS[vista.estado]}
            </p>
            <p>
              <span className="font-mono text-3xl font-bold tabular-nums">{vista.firmes}</span>
              <span className="ml-2 text-sm text-muted">
                OF confirmadas · {vista.porConfirmar} por confirmar
                {vista.total != null ? ` · la nómina dice ${vista.total}` : ""}
              </span>
            </p>
            <div className="rounded-xl border border-separator px-3 py-2">
              <p className="text-xs text-muted">Última OF confirmada</p>
              {vista.ultima ? (
                <>
                  <p className="font-mono text-xl font-bold tabular-nums">{formatoOf(vista.ultima.of)}</p>
                  <p className="text-sm">{vista.ultima.destino ?? "sin dirección"}</p>
                </>
              ) : (
                <p className="text-sm text-muted">Ninguna todavía</p>
              )}
            </div>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Prendiendo la cámara…
          </p>
        )}
        {pregunta ?? (
          <button
            type="button"
            onClick={onDetener}
            className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground"
          >
            Terminar
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
