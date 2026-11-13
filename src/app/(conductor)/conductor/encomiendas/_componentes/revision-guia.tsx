"use client";

// Paso 2 de «Cargar la guía», versión simple (dueño, 2026-11-14): con ⚠ se ve solo
// la tarjeta de la línea que hay que mirar —sin OF, sin destino o por confirmar—,
// de a una, con el teléfono del receptor y «Llamar» para resolverla antes de crear
// (AGENTS.md, paso 2); sin ⚠, solo la lista. El número grande, el folio y las
// pestañas «⚠ / Todas» de la maqueta C salieron: la cantidad va en el botón de
// abajo y «Ver las n líneas» abre la lista aunque queden ⚠.

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Trash2 } from "lucide-react";
import type { LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { CamposLinea, LineasGuia, lineaConProblema, lineaMala } from "./lineas-guia";

const ENLACE = "mx-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-muted active:bg-card";

export function RevisionGuia({
  lineas,
  avisos,
  onCambiar,
  onQuitar,
  onAgregar,
  arriba,
}: {
  lineas: LineaGuia[];
  avisos: string[];
  onCambiar: (i: number, cambio: Partial<LineaGuia>) => void;
  onQuitar: (i: number) => void;
  onAgregar: () => void;
  /** Lo que va arriba («Línea quitada · Deshacer»). */
  arriba?: React.ReactNode;
}) {
  /** La lista entera a la vista aunque queden ⚠. */
  const [verTodas, setVerTodas] = useState(false);
  /** La línea a la vista en la tarjeta: queda fija mientras se corrige, aunque deje
   *  de tener problema con el primer carácter, hasta «Confirmar» o «Siguiente». */
  const [actual, setActual] = useState<number | null>(null);

  const conProblema = (i: number) => lineaConProblema(lineas[i]);
  const indices = lineas.map((_, i) => i);
  const fija = actual != null && actual < lineas.length ? actual : null;
  const cola = indices.filter((i) => conProblema(i) || i === fija);
  const problemas = indices.filter(conProblema).length;
  // Por `cola` y no por `problemas`: la última línea con ⚠ deja de tenerlo al
  // primer carácter, y la tarjeta se iba a la lista a medio escribir.
  const enTarjeta = !verTodas && cola.length > 0;
  const mostrada = fija ?? cola[0];
  // «Sin OF o sin destino» ya lo dice la tarjeta; quedan el total y las repetidas.
  const otrosAvisos = avisos.filter((a) => !/sin OF o sin destino/.test(a));

  /** La próxima con problema después de `i` (sin contar `i`), o la primera. */
  function siguienteDe(i: number) {
    const resto = indices.filter((j) => j !== i && conProblema(j));
    return resto.find((j) => j > i) ?? resto[0] ?? null;
  }

  return (
    <div className="space-y-3">
      {otrosAvisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {a}
        </p>
      ))}
      {arriba}

      {enTarjeta && mostrada != null ? (
        <>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-2.5 py-1 text-xs font-bold text-warn">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-mono">
                {cola.indexOf(mostrada) + 1} de {cola.length}
              </span>
            </span>
            {cola.length > 1 ? (
              <button
                type="button"
                onClick={() => setActual(siguienteDe(mostrada))}
                className="flex items-center gap-0.5 rounded-full px-2 py-1 text-sm font-semibold text-brand active:bg-card"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <TarjetaProblema
            linea={lineas[mostrada]}
            onCambiar={(c) => {
              setActual(mostrada);
              onCambiar(mostrada, c);
            }}
            onQuitar={() => {
              // La que sigue corre un lugar al quitar esta.
              const sig = siguienteDe(mostrada);
              setActual(sig == null ? null : sig > mostrada ? sig - 1 : sig);
              onQuitar(mostrada);
            }}
            onConfirmar={() => {
              if (lineas[mostrada].porConfirmar) onCambiar(mostrada, { porConfirmar: false });
              setActual(siguienteDe(mostrada));
            }}
          />
          <button type="button" onClick={() => setVerTodas(true)} className={ENLACE}>
            {lineas.length === 1 ? "Ver la línea" : `Ver las ${lineas.length} líneas`}
          </button>
        </>
      ) : (
        <>
          {problemas > 0 ? (
            <button
              type="button"
              onClick={() => {
                setActual(null);
                setVerTodas(false);
              }}
              className="flex items-center gap-1 rounded-full bg-warn-bg px-2.5 py-1 text-xs font-bold text-warn active:opacity-70"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-mono">{problemas}</span> por revisar
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <LineasGuia lineas={lineas} onCambiar={onCambiar} onQuitar={onQuitar} onAgregar={onAgregar} />
        </>
      )}
    </div>
  );
}

/** Una línea con ⚠: qué le pasa, sus campos con el teléfono, «Quitar» y «Confirmar». */
function TarjetaProblema({
  linea,
  onCambiar,
  onQuitar,
  onConfirmar,
}: {
  linea: LineaGuia;
  onCambiar: (cambio: Partial<LineaGuia>) => void;
  onQuitar: () => void;
  onConfirmar: () => void;
}) {
  const mala = lineaMala(linea);
  // Una OF con letras (un 0 leído como O) no es «sin OF»: se leyó mal (spec 033).
  const ofConLetras = /[a-z]/i.test(linea.of);
  const motivo = mala
    ? ofConLetras
      ? "OF mal leída"
      : linea.destino.trim()
        ? "Sin OF"
        : linea.of.replace(/\D/g, "")
          ? "Sin destino"
          : "Sin OF ni destino"
    : linea.porConfirmar
      ? "Por confirmar"
      : null;
  return (
    <div className="space-y-2 rounded-2xl bg-card p-3 shadow-soft">
      {motivo ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-bold text-warn">
          {motivo}
          {/* En Plex Mono la O y el 0 casi no se distinguen: lo que no es dígito va
              marcado, para ver cuál hay que cambiar (visto en Chrome, 2026-11-14). */}
          {mala && ofConLetras ? (
            <span className="font-mono text-sm font-semibold tracking-wide text-muted" aria-label={`Se leyó ${linea.of}`}>
              {[...linea.of].map((c, i) =>
                /\d/.test(c) ? (
                  c
                ) : (
                  <mark key={i} className="rounded bg-warn px-0.5 text-card">
                    {c}
                  </mark>
                ),
              )}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-xs font-bold text-ok">
          <Check className="h-3.5 w-3.5" />
          Lista
        </p>
      )}
      <CamposLinea linea={linea} onCambiar={onCambiar} />
      <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
        <button
          type="button"
          onClick={onQuitar}
          className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-separator bg-card text-sm font-semibold text-brand active:scale-[0.97]"
        >
          <Trash2 className="h-4 w-4" />
          Quitar
        </button>
        <button
          type="button"
          disabled={mala}
          onClick={onConfirmar}
          className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-brand-foreground active:scale-[0.97] disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Confirmar
        </button>
      </div>
    </div>
  );
}
