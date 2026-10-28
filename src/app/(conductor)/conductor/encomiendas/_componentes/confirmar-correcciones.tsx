"use client";

// Las correcciones de la IA, una por una, para que el conductor las confirme
// (spec 018; terreno 2026-10-27). Cada una muestra lo que decía, lo que propone
// la IA, por qué y DÓNDE queda en el mapa: el conductor conoce Arica, y eso es lo
// que le permite decir "sí, es ahí". Nada se aplica sin su toque.

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { MapaPunto } from "@/components/direccion/mapa-punto";
import { aplicarCorreccion, type PropuestaCorreccion } from "@/lib/encomiendas/local/corregir-direcciones";

type Estado = "pendiente" | "confirmada" | "descartada";

export function ConfirmarCorrecciones({
  propuestas,
  onAplicada,
}: {
  propuestas: PropuestaCorreccion[];
  /** Se confirmó una: la pantalla vuelve a leer los pedidos. */
  onAplicada: () => void;
}) {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const estado = (p: PropuestaCorreccion) => estados[p.pedidoId] ?? "pendiente";
  const pendientes = propuestas.filter((p) => estado(p) === "pendiente");

  async function confirmar(lista: PropuestaCorreccion[]) {
    setError(null);
    for (const p of lista) {
      setGuardando(p.pedidoId);
      try {
        await aplicarCorreccion(p);
        setEstados((e) => ({ ...e, [p.pedidoId]: "confirmada" }));
      } catch {
        setError("No se pudo guardar una corrección. Intenta de nuevo.");
        break;
      }
    }
    setGuardando(null);
    onAplicada();
  }

  if (propuestas.length === 0) return null;
  const seguras = pendientes.filter((p) => p.segura);

  return (
    <div className="space-y-2.5 text-left">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Sparkles className="h-4 w-4" />
        {pendientes.length === 0
          ? "Correcciones revisadas"
          : pendientes.length === 1
            ? "La IA corrigió 1 dirección: confírmala"
            : `La IA corrigió ${pendientes.length} direcciones: confírmalas`}
      </p>
      {seguras.length > 1 ? (
        <button
          type="button"
          disabled={guardando != null}
          onClick={() => void confirmar(seguras)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-brand text-sm font-semibold text-brand disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Confirmar las {seguras.length} seguras
        </button>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {propuestas.map((p) => {
        const e = estado(p);
        if (e !== "pendiente") {
          return (
            <p key={p.pedidoId} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm shadow-soft">
              {e === "confirmada" ? <Check className="h-4 w-4 shrink-0 text-ok" /> : <X className="h-4 w-4 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 truncate">
                {e === "confirmada" ? p.direccion : `${p.original} · queda sin ubicar, corrígela a mano`}
              </span>
            </p>
          );
        }
        return (
          <div key={p.pedidoId} className="space-y-2 rounded-2xl bg-card p-3 shadow-soft">
            <p className="text-xs text-muted">{p.nombre}</p>
            <p className="text-xs text-muted">
              Decía: <span className="line-through">{p.original}</span>
            </p>
            <p className="text-base font-semibold leading-tight">{p.direccion}</p>
            <div className="flex flex-wrap gap-1.5">
              {p.enLaCuadra ? (
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium">En la cuadra</span>
              ) : null}
              {!p.segura ? (
                <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">Dudosa</span>
              ) : null}
            </div>
            <MapaPunto lat={p.lat} lng={p.lng} etiqueta={p.direccion} alto={130} />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={guardando != null}
                onClick={() => setEstados((s) => ({ ...s, [p.pedidoId]: "descartada" }))}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-separator bg-card text-sm font-semibold text-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Descartar
              </button>
              <button
                type="button"
                disabled={guardando != null}
                onClick={() => void confirmar([p])}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                {guardando === p.pedidoId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
