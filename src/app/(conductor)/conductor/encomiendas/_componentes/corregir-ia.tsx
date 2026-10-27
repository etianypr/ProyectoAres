"use client";

// "Corregir con IA" para los pedidos sin ubicar (spec 018), en "Pedidos fuera de
// la ruta". La IA propone y el conductor confirma cada una.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { corregirSinUbicar, type PropuestaCorreccion } from "@/lib/encomiendas/local/corregir-direcciones";
import { ConfirmarCorrecciones } from "./confirmar-correcciones";

export function BotonCorregirIA({
  fecha,
  cuantas,
  onAplicada,
}: {
  fecha: string;
  cuantas: number;
  /** Se confirmó una corrección: la pantalla vuelve a leer los pedidos. */
  onAplicada: () => void;
}) {
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [propuestas, setPropuestas] = useState<PropuestaCorreccion[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  async function corregir() {
    setAviso(null);
    setPropuestas([]);
    setAvance({ hechos: 0, total: cuantas });
    try {
      const r = await corregirSinUbicar(fecha, { alAvanzar: (hechos, total) => setAvance({ hechos, total }) });
      setPropuestas(r.propuestas);
      setAviso(
        r.sinIA
          ? "La IA no está configurada en el servidor."
          : r.propuestas.length === 0
            ? "La IA no encontró cómo corregirlas: corrígelas a mano."
            : r.sinArreglo > 0
              ? `${r.sinArreglo} sin arreglo: corrígelas a mano.`
              : null,
      );
    } catch {
      setAviso("No se pudo corregir. Intenta de nuevo con señal.");
    } finally {
      setAvance(null);
    }
  }

  return (
    <div className="mb-2 space-y-2">
      {propuestas.length === 0 ? (
        <button
          type="button"
          disabled={avance != null}
          onClick={() => void corregir()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft py-3.5 text-sm font-semibold text-brand disabled:opacity-70"
        >
          {avance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {avance
            ? `Corrigiendo con IA: ${avance.hechos} de ${avance.total}`
            : cuantas === 1
              ? "Corregir la dirección con IA"
              : `Corregir las ${cuantas} direcciones con IA`}
        </button>
      ) : null}
      {aviso ? <p className="px-1 text-sm text-muted">{aviso}</p> : null}
      <ConfirmarCorrecciones propuestas={propuestas} onAplicada={onAplicada} />
    </div>
  );
}
