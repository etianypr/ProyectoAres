"use client";

// El final de "Cargar la guía": ubicando las direcciones, corrigiendo con IA las
// que no se ubicaron (spec 018) y el paso 3, versión simple (dueño, 2026-11-14): una
// línea («27 pedidos · ⚠ 3 no ubicados»), la IA en su bloque (lo que propuso para
// confirmar y «Corregir con IA» para volver a intentarlo con señal), los no
// ubicados —la fila abre el pedido— y «Deshacer esta carga» mientras nadie la haya
// tocado (spec 033). Lo confirmado sale de los no ubicados.

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Loader2, Undo2 } from "lucide-react";
import type { ResumenCarga } from "@/lib/encomiendas/local/cargar-lineas";
import { ConfirmarCorrecciones } from "./confirmar-correcciones";
import { BotonCorregirIA } from "./corregir-ia";

export type FinGuia =
  | { tipo: "ubicando"; hechos: number; total: number }
  | { tipo: "corrigiendo"; hechos: number; total: number }
  | ({ tipo: "listo" } & ResumenCarga);

export function VistaFinGuia({
  paso,
  fecha,
  lecturaIA,
  onAplicada,
  onDejar,
  onDeshacer,
  onCorregir,
}: {
  paso: FinGuia;
  fecha: string;
  /** La IA está encendida en el servidor: sin ella no hay «Corregir con IA». */
  lecturaIA: boolean;
  /** Se confirmó una corrección: la pantalla vuelve a leer los pedidos. */
  onAplicada: () => void;
  /** «Dejar de ubicar»: lo que falta queda sin ubicar. */
  onDejar: () => void;
  /** «Deshacer esta carga» (pregunta antes). */
  onDeshacer: () => void;
  /** «Corregir» una sin ubicar: abre su pedido. */
  onCorregir: (pedidoId: string) => void;
}) {
  /** Las que la IA propuso y el conductor confirmó: ya están ubicadas. */
  const [confirmadas, setConfirmadas] = useState<Set<string>>(new Set());

  if (paso.tipo !== "listo") {
    const corrigiendo = paso.tipo === "corrigiendo";
    const avance = paso.total > 0 ? Math.round((paso.hechos / paso.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          {corrigiendo ? "Corrigiendo con IA" : "Ubicando direcciones"}
        </p>
        <p className="font-mono text-4xl font-semibold tabular-nums">
          {paso.hechos}
          <span className="text-xl text-muted"> de {paso.total}</span>
        </p>
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-divider" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${avance}%` }} />
        </div>
        <button
          type="button"
          onClick={onDejar}
          className="flex h-11 items-center justify-center rounded-full border border-separator bg-card px-5 text-sm font-semibold text-brand active:scale-[0.97]"
        >
          Dejar de ubicar
        </button>
      </div>
    );
  }

  const creados = paso.ids.length;
  const noUbicados = paso.sinUbicar.filter((s) => !confirmadas.has(s.id));
  const faltan = noUbicados.length;
  // Las propuestas de esta carga que siguen a la vista no se vuelven a pagar.
  const conPropuesta = paso.propuestas.map((p) => p.pedidoId).filter((id) => !confirmadas.has(id));
  const sinPropuesta = noUbicados.filter((s) => !conPropuesta.includes(s.id)).length;
  const confirmar = (id: string) => setConfirmadas((c) => new Set(c).add(id));

  return (
    <div className="space-y-3">
      {/* Una línea en vez de tres cajas (versión simple, dueño 2026-11-14). */}
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] font-bold">
        <span className="flex items-baseline gap-1.5">
          {faltan === 0 && creados > 0 ? <Check aria-label="todos ubicados" className="h-4 w-4 self-center text-ok" /> : null}
          <span className="font-mono text-xl font-semibold tabular-nums">{creados}</span>
          {creados === 1 ? "pedido" : "pedidos"}
        </span>
        {faltan > 0 ? (
          <span className="flex items-baseline gap-1.5 text-warn">
            <span aria-hidden className="text-muted">
              ·
            </span>
            <AlertTriangle className="h-4 w-4 self-center" />
            <span className="font-mono text-xl font-semibold tabular-nums">{faltan}</span>
            {faltan === 1 ? "no ubicado" : "no ubicados"}
          </span>
        ) : null}
      </p>
      {paso.yaEstaban > 0 ? (
        <p className="text-xs text-muted">
          <span className="font-mono">{paso.yaEstaban}</span> {paso.yaEstaban === 1 ? "ya estaba cargado" : "ya estaban cargados"}
        </p>
      ) : null}

      {/* La IA, en su propio bloque: lo que propuso para confirmar y, si quedaron
          no ubicados sin propuesta, volver a preguntarle (dueño, 2026-11-13). */}
      <ConfirmarCorrecciones propuestas={paso.propuestas} onAplicada={onAplicada} onConfirmada={confirmar} />
      {lecturaIA && sinPropuesta > 0 ? (
        <BotonCorregirIA
          fecha={fecha}
          cuantas={sinPropuesta}
          solo={noUbicados.map((s) => s.id)}
          excluir={conPropuesta}
          onAplicada={onAplicada}
          onConfirmada={confirmar}
        />
      ) : null}

      {faltan > 0 ? (
        // Los no ubicados: la fila entera abre el pedido para corregirlo.
        <ul aria-label="No ubicados" className="divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-soft">
          {noUbicados.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onCorregir(s.id)}
                aria-label={`Corregir ${s.direccion || "el pedido sin dirección"}`}
                className="flex w-full items-center gap-2 px-3.5 py-3 text-left active:bg-background"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{s.direccion || "Sin dirección"}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {creados > 0 ? (
        <button
          type="button"
          onClick={onDeshacer}
          className="mx-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted active:bg-card"
        >
          <Undo2 className="h-4 w-4" />
          Deshacer esta carga
        </button>
      ) : null}
    </div>
  );
}
