"use client";

// La capa sobre la cámara al barrer la nómina («Cargar la guía» → «Barrer la nómina» y
// Diagnóstico → «Probar barrido de nómina»; hook use-barrido-nomina): si está leyendo, cuántas OF
// van confirmadas y la última, con su dirección (dueño, 2026-11-11: «necesito feedback
// de qué lee»). Los recuadros sobre el texto no van aquí: los dibuja Android
// (MarcasEscaner.java), porque cada redibujo de la WebView con la cámara encendida
// traba la pantalla.
//
// Spec 034 (dueño, 2026-11-15): arriba, bajo la barra, las OF que falta confirmar (una
// lista abierta tapaba la cámara y se quitó), sin consejos; y «Terminar» con encargos a
// medias pregunta antes de salir.

import { useState } from "react";
import { createPortal } from "react-dom";
import { Flashlight, FlashlightOff, Loader2, X } from "lucide-react";
import type { LineaNomina } from "@/lib/encomiendas/lectura/barrido-nomina";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { linternaViva } from "@/lib/nativo/escaner-vivo";
import { FranjaConfirmar } from "./franja-confirmar";

export type EstadoBarrido = "sinTexto" | "sinBloques" | "leyendo";

const ESTADOS: Record<EstadoBarrido, string> = {
  sinTexto: "No veo texto",
  sinBloques: "Veo texto, pero ninguna OF",
  leyendo: "Leyendo la nómina",
};

/** Cuántas OF por confirmar caben arriba sin tapar la cámara. */
const FALTAN_A_LA_VISTA = 6;

export type VistaBarrido = {
  estado: EstadoBarrido;
  /** Leídas: el número firme y con su dirección. */
  firmes: number;
  porConfirmar: number;
  total: number | null;
  ultima: Pick<LineaNomina, "of" | "destino"> | null;
  /** Las OF leídas: sus encargos van en verde y con ✓ sobre la cámara. */
  confirmadas: Set<string>;
  /** Cada número leído → la OF que quedó (resultadoNomina). */
  deLectura: Record<string, string>;
  /** Las OF que hay que volver a pasar: el número sin firmar o el encargo a medias (sin
   *  su dirección o visto una vez), en el orden de la nómina. */
  faltan: string[];
  /** Cuántas quedaron a medias. */
  aMedias: number;
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
  const [preguntaMedias, setPreguntaMedias] = useState(false);
  const aMedias = vista?.aMedias ?? 0;
  const faltan = vista?.faltan ?? [];

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
      {faltan.length > 0 ? (
        <div role="status" className="bg-black/60 px-4 pb-2 text-white">
          <p className="text-xs font-semibold text-amber-200">⚠ Falta confirmar {faltan.length}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums">
            {faltan.slice(0, FALTAN_A_LA_VISTA).map((of) => (
              <span key={of}>{formatoOf(of)}</span>
            ))}
            {faltan.length > FALTAN_A_LA_VISTA ? <span>+{faltan.length - FALTAN_A_LA_VISTA}</span> : null}
          </p>
        </div>
      ) : null}
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
                {aMedias > 0 ? ` · ${aMedias} a medias` : ""}
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
        {pregunta ??
          (preguntaMedias ? (
            <FranjaConfirmar
              texto={`${aMedias} a medias: se suman sin dirección para completarlas`}
              si="Terminar igual"
              no="Seguir barriendo"
              onSi={() => {
                setPreguntaMedias(false);
                onDetener();
              }}
              onNo={() => setPreguntaMedias(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => (aMedias > 0 ? setPreguntaMedias(true) : onDetener())}
              className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground"
            >
              Terminar
            </button>
          ))}
      </div>
    </div>,
    document.body,
  );
}
