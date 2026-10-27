"use client";

// "Corregir con IA" para los pedidos sin ubicar (spec 018), en "Pedidos fuera de
// la ruta". Las seguras quedan ubicadas; las dudosas, como sugerencia a la vista.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { corregirSinUbicar } from "@/lib/encomiendas/local/corregir-direcciones";

export function BotonCorregirIA({
  fecha,
  cuantas,
  onCorregidas,
}: {
  fecha: string;
  cuantas: number;
  onCorregidas: (corregidas: number) => void;
}) {
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<{ sugerencias: string[]; texto: string | null } | null>(null);

  async function corregir() {
    setAviso(null);
    setAvance({ hechos: 0, total: cuantas });
    try {
      const r = await corregirSinUbicar(fecha, { alAvanzar: (hechos, total) => setAvance({ hechos, total }) });
      onCorregidas(r.corregidas);
      setAviso({
        sugerencias: r.sugerencias,
        texto: r.sinIA
          ? "La IA no está configurada en el servidor."
          : r.corregidas === 0 && r.sugerencias.length === 0
            ? "La IA no encontró cómo corregirlas: corrígelas a mano."
            : null,
      });
    } catch {
      setAviso({ sugerencias: [], texto: "No se pudo corregir. Intenta de nuevo con señal." });
    } finally {
      setAvance(null);
    }
  }

  return (
    <div className="mb-2 space-y-2">
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
      {aviso && (aviso.texto || aviso.sugerencias.length > 0) ? (
        <div className="space-y-1 rounded-2xl bg-card px-3 py-2.5 text-sm shadow-soft">
          {aviso.texto ? <p className="text-muted">{aviso.texto}</p> : null}
          {aviso.sugerencias.length > 0 ? (
            <>
              <p className="font-medium text-brand">La IA sugiere (toca el pedido para confirmarla):</p>
              {aviso.sugerencias.map((s) => (
                <p key={s} className="text-muted">
                  {s}
                </p>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
