"use client";

// "Corregir con IA" para los pedidos sin ubicar (spec 018), en "Pedidos fuera de
// la ruta". La IA propone y el conductor confirma cada una.
//
// Spec 033: el botón vuelve apenas hay una dirección sin ubicar que no tenga
// propuesta a la vista (antes se escondía mientras quedara alguna en la lista,
// aunque ya estuviera confirmada); y sin señal lo dice, en vez de «no encontró
// cómo corregirlas».

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { corregirSinUbicar, type PropuestaCorreccion } from "@/lib/encomiendas/local/corregir-direcciones";
import { ConfirmarCorrecciones } from "./confirmar-correcciones";

export function BotonCorregirIA({
  fecha,
  cuantas,
  onAplicada,
  excluir = [],
  solo,
  onConfirmada,
}: {
  fecha: string;
  cuantas: number;
  /** Se confirmó una corrección: la pantalla vuelve a leer los pedidos. */
  onAplicada: () => void;
  /** Los que ya tienen una propuesta a la vista en otro lado (no se vuelve a pagar). */
  excluir?: string[];
  /** Solo estos pedidos (el resumen de «Cargar la guía» pregunta por los de esa
   *  carga, que son los que cuenta el botón; sin esto iban todos los del día). */
  solo?: string[];
  /** Cada confirmada (el resumen de «Cargar la guía» la cuenta como ubicada). */
  onConfirmada?: (pedidoId: string) => void;
}) {
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  /** Las propuestas sin confirmar todavía. */
  const [propuestas, setPropuestas] = useState<PropuestaCorreccion[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const sinPropuesta = Math.max(0, cuantas - propuestas.length);

  async function corregir() {
    setAviso(null);
    setAvance({ hechos: 0, total: sinPropuesta });
    try {
      const r = await corregirSinUbicar(fecha, {
        ids: solo,
        excluir: [...excluir, ...propuestas.map((p) => p.pedidoId)],
        alAvanzar: (hechos, total) => setAvance({ hechos, total }),
      });
      setPropuestas((antes) => [...antes, ...r.propuestas]);
      setAviso(
        r.sinIA
          ? "IA apagada en el servidor."
          : r.sinSenal > 0
            ? `Sin señal: ${r.sinSenal === 1 ? "1 sin preguntar" : `${r.sinSenal} sin preguntar`} a la IA.`
            : r.propuestas.length === 0
              ? "La IA no encontró cómo corregirlas."
              : r.sinArreglo > 0
                ? `${r.sinArreglo} sin arreglo.`
                : null,
      );
    } catch {
      setAviso("Sin señal: no se preguntó a la IA.");
    } finally {
      setAvance(null);
    }
  }

  return (
    <div className="mb-2 space-y-2">
      {sinPropuesta > 0 || avance ? (
        <button
          type="button"
          disabled={avance != null}
          onClick={() => void corregir()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft py-3.5 text-sm font-semibold text-brand disabled:opacity-70"
        >
          {avance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {avance
            ? `Corrigiendo con IA: ${avance.hechos} de ${avance.total}`
            : sinPropuesta === 1
              ? "Corregir la dirección con IA"
              : `Corregir las ${sinPropuesta} direcciones con IA`}
        </button>
      ) : null}
      {aviso ? <p className="px-1 text-sm text-muted">{aviso}</p> : null}
      <ConfirmarCorrecciones
        propuestas={propuestas}
        onAplicada={onAplicada}
        onConfirmada={(id) => {
          setPropuestas((ps) => ps.filter((p) => p.pedidoId !== id));
          onConfirmada?.(id);
        }}
      />
    </div>
  );
}
