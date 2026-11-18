"use client";

// «Tiempos» (spec 038): cuánto esperó el conductor en cada tramo de este dispositivo, para
// comparar el día real con la línea base sin gastar cuota. Solo cifras (lib/comun/cronometro):
// «Copiar cifras» copia tramos y números, nunca una dirección.

import { useMemo, useState, useSyncExternalStore } from "react";
import { Timer } from "lucide-react";
import { borrarTiempos, leerTiempos, resumenTiempos, suscribirTiempos, tiemposCrudos, tiemposEnTexto } from "@/lib/comun/cronometro";

function cifra(valor: number, unidad: string): string {
  if (unidad === "ms") return valor >= 10_000 ? `${(valor / 1000).toFixed(1)} s` : `${valor} ms`;
  return String(valor);
}

export function Tiempos() {
  // En el servidor no hay localStorage: null hasta que se dibuja en el dispositivo.
  const crudo = useSyncExternalStore(suscribirTiempos, tiemposCrudos, () => null);
  const resumen = useMemo(() => (crudo === null ? null : resumenTiempos(leerTiempos(crudo))), [crudo]);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(tiemposEnTexto());
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="space-y-2 rounded-2xl bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 shrink-0 text-muted" />
        <h2 className="flex-1 text-sm font-semibold">Tiempos</h2>
        <span className="text-xs text-muted">mediana · p90 · último</span>
      </div>
      {resumen === null ? null : resumen.length === 0 ? (
        <p className="text-xs text-muted">Sin mediciones en este dispositivo.</p>
      ) : (
        <ul className="divide-y divide-divider text-xs">
          {resumen.map((r) => (
            <li key={r.tramo} className="flex items-baseline gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                {r.titulo} <span className="text-muted">({r.n})</span>
              </span>
              <span className="shrink-0 font-mono">
                {cifra(r.mediana, r.unidad)} · {cifra(r.p90, r.unidad)} · {cifra(r.ultimo, r.unidad)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resumen && resumen.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copiar()}
            className="h-11 rounded-full border border-separator bg-card text-sm font-semibold"
          >
            {copiado ? "Cifras copiadas" : "Copiar cifras"}
          </button>
          <button
            type="button"
            onClick={() => {
              borrarTiempos();
              setCopiado(false);
            }}
            className="h-11 rounded-full border border-separator bg-card text-sm font-semibold text-muted"
          >
            Borrar
          </button>
        </div>
      ) : null}
    </section>
  );
}
