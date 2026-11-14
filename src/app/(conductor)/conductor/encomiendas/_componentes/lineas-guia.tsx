"use client";

// La lista de las líneas leídas de la guía (revision-guia.tsx). Cada línea se lee
// como texto y se abre tocándola (versión simple, dueño 2026-11-14; antes llevaba
// un lápiz y un basurero, terreno 2026-10-27); las que tienen un problema se abren
// ya editables. Las del barrido de la nómina que no quedaron firmes
// (`porConfirmar`) también, y se confirman después de mirarlas en el papel (dueño,
// 2026-11-11). Abierta, la línea trae el teléfono del receptor y «Llamar» (dueño,
// 2026-11-13), «Quitar» y «Listo».

import { useState } from "react";
import { AlertTriangle, Check, Phone, Plus, Trash2 } from "lucide-react";
import { BotonTelefono, CampoTelefono } from "./campo-telefono";
import { cn } from "@/lib/comun/utils";
import { Campo } from "@/components/ui/campo";
import { normalizarTelefono } from "@/lib/comun/telefono";
import type { LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { formatoOf, ofValida } from "@/lib/encomiendas/paquete";

/** Sin OF o sin destino: frena «Crear». */
export const lineaMala = (l: LineaGuia) => !ofValida(l.of) || !l.destino.trim();
/** Hay que mirarla: mala o por confirmar. */
export const lineaConProblema = (l: LineaGuia) => lineaMala(l) || Boolean(l.porConfirmar);

/** OF y destino de una línea, editables. */
export function CamposLinea({ linea, onCambiar }: { linea: LineaGuia; onCambiar: (cambio: Partial<LineaGuia>) => void }) {
  const of = ofValida(linea.of);
  // Mientras se escribe, el campo muestra lo escrito tal cual: darle formato en
  // cada tecla («123 456 789») mandaba el cursor al final y no dejaba borrar un
  // dígito del medio; había que escribir la OF entera de nuevo (terreno
  // 2026-11-14). El formato vuelve al salir del campo.
  const [escrita, setEscrita] = useState<string | null>(null);
  /** «Teléfono · opcional» se abre con el botón; con uno ya anotado, de entrada. */
  const [conTelefono, setConTelefono] = useState(() => (linea.telefono ?? "").trim() !== "");
  return (
    <>
      <Campo
        compacto
        etiqueta="OF"
        inputMode="numeric"
        value={escrita !== null && escrita === linea.of ? escrita : of ? formatoOf(of) : linea.of}
        onChange={(e) => {
          setEscrita(e.target.value);
          onCambiar({ of: e.target.value });
        }}
        onBlur={() => setEscrita(null)}
        tono={of ? "normal" : "aviso"}
        className="font-mono font-semibold tabular-nums"
      />
      <div className="flex items-stretch gap-2">
        <Campo
          compacto
          etiqueta="Destino"
          value={linea.destino}
          onChange={(e) => onCambiar({ destino: e.target.value })}
          tono={linea.destino.trim() ? "normal" : "aviso"}
          cajaClassName="min-w-0 flex-1"
        />
        <BotonTelefono abierto={conTelefono} onClick={() => setConTelefono((a) => !a)} />
      </div>
      {conTelefono ? <CampoTelefono valor={linea.telefono ?? ""} onCambiar={(telefono) => onCambiar({ telefono })} /> : null}
    </>
  );
}

export function LineasGuia({
  lineas,
  onCambiar,
  onQuitar,
  onAgregar,
}: {
  lineas: LineaGuia[];
  onCambiar: (i: number, cambio: Partial<LineaGuia>) => void;
  onQuitar: (i: number) => void;
  onAgregar: () => void;
}) {
  /** Las líneas abiertas con el lápiz. */
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const alternar = (i: number) =>
    setAbiertas((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(i)) nuevo.delete(i);
      else nuevo.add(i);
      return nuevo;
    });

  return (
    <>
      <ul className="divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-soft">
        {lineas.map((l, i) => {
          const of = ofValida(l.of);
          const mala = lineaMala(l);
          const porConfirmar = !mala && l.porConfirmar;
          const editando = mala || porConfirmar || abiertas.has(i);
          const telefono = normalizarTelefono(l.telefono);
          if (!editando) {
            // Cerrada: la fila entera es el botón que la abre (sin lápiz ni basurero).
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => alternar(i)}
                  aria-label={`Corregir la línea ${of ? formatoOf(of) : l.of}`}
                  className="block w-full px-3 py-2.5 text-left active:bg-background"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    {/* Una OF de otro largo vale igual y no lleva ⚠: hay OF de distintos
                        largos (dueño, 2026-11-06; antes, terreno 2026-10-28). */}
                    <span className="font-mono text-sm font-semibold tabular-nums">{of ? formatoOf(of) : l.of}</span>
                    {telefono.ok ? (
                      <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted">
                        <Phone className="h-3 w-3" />
                        {telefono.telefono.legible}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-sm text-muted">{l.destino}</span>
                </button>
              </li>
            );
          }
          return (
            <li key={i} className={cn("space-y-1.5 px-3 py-2.5", (mala || porConfirmar) && "bg-warn-bg")}>
              {porConfirmar ? (
                <p className="flex items-center gap-1 text-xs font-semibold text-warn">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Por confirmar
                </p>
              ) : null}
              <CamposLinea linea={l} onCambiar={(c) => onCambiar(i, c)} />
              {/* Abierta: «Quitar» y, si no le falta nada, cerrarla (o confirmarla). */}
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setAbiertas(new Set());
                    onQuitar(i);
                  }}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-separator bg-card text-sm font-semibold text-brand active:scale-[0.97]"
                >
                  <Trash2 className="h-4 w-4" />
                  Quitar
                </button>
                {!mala ? (
                  <button
                    type="button"
                    onClick={() => (porConfirmar ? onCambiar(i, { porConfirmar: false }) : alternar(i))}
                    className="flex h-10 flex-[2] items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-brand-foreground active:scale-[0.97]"
                  >
                    <Check className="h-4 w-4" />
                    {porConfirmar ? "Confirmar" : "Listo"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onAgregar}
        className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted active:bg-card"
      >
        <Plus className="h-4 w-4" />
        Agregar una línea
      </button>
    </>
  );
}
