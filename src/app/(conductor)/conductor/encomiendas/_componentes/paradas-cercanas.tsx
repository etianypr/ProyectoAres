"use client";

// «◎ N cerca» (spec 023; dueño, 2026-11-08): las paradas a menos de 300 m de la
// activa, abajo a la derecha del mapa, a la izquierda de «Centrar» (dueño,
// 2026-11-09). Al tocarla se abre una lista compacta —una línea por parada, para
// tapar poco el mapa— y esas paradas se marcan en el mapa; tocar una fila lleva
// el mapa a ella (use-vista-cercanas.ts). «Ahora» la deja como la próxima, con
// «Deshacer» y el aviso por su OF (spec 033, use-reordenar.ts). Elegirlas no
// consulta nada: línea recta y el orden guardado. Solo en ARES: la burbuja es
// nativa y sumarla obligaría a otra APK.

import { Phone, Radar } from "lucide-react";
import { formatDistancia } from "@/lib/comun/format";
import { cn } from "@/lib/comun/utils";
import { formatoOf } from "@/lib/encomiendas/paquete";
import type { Cercana } from "../_hooks/paradas-cercanas";

export function ParadasCercanas({
  cercanas,
  abierta,
  setAbierta,
  enfocar,
  guardando,
  onLlamar,
  onHacerAhora,
}: {
  cercanas: Cercana[];
  abierta: boolean;
  setAbierta: (abierta: boolean) => void;
  /** Lleva el mapa a esa parada. */
  enfocar: (c: Cercana) => void;
  guardando: boolean;
  onLlamar: (c: Cercana) => void;
  /** La deja como la próxima y lo avisa (el error, si falla, ya queda a la vista). */
  onHacerAhora: (c: Cercana) => Promise<unknown>;
}) {
  if (cercanas.length === 0) return null;

  async function hacerAhora(c: Cercana) {
    setAbierta(false);
    await onHacerAhora(c);
  }

  return (
    // Sin `relative`: la lista se ancla a la fila de controles (ControlesMapa), que
    // llega al borde derecho; anclada a la píldora se salía por la izquierda.
    <div>
      {abierta ? (
        <>
          {/* Tocar fuera de la lista la cierra. */}
          <button type="button" aria-label="Cerrar" onClick={() => setAbierta(false)} className="fixed inset-0 cursor-default" />
          <ul className="absolute bottom-full right-0 mb-2 w-[calc(100vw-1.5rem)] max-w-sm divide-y divide-divider rounded-2xl bg-card px-1 shadow-md">
            {cercanas.map((c) => (
              <li key={c.pedido.id} className="flex items-center gap-1.5 py-1">
                <button
                  type="button"
                  onClick={() => enfocar(c)}
                  aria-label={`Ver en el mapa: ${c.secuencia == null ? "fuera de la ruta" : `parada ${c.secuencia}`}`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1.5 text-left active:bg-background"
                >
                  <span
                    className={cn(
                      "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-brand px-1 text-xs font-semibold text-brand",
                      c.secuencia != null && "font-mono",
                    )}
                  >
                    {c.secuencia ?? "+"}
                  </span>
                  <span className="min-w-0 truncate text-sm">
                    {c.pedido.of ? <span className="font-mono font-medium">OF {formatoOf(c.pedido.of)}</span> : c.pedido.direccion}
                    <span className="text-muted">
                      {" · "}
                      <span className="font-mono">{formatDistancia(c.metros)}</span>
                    </span>
                  </span>
                </button>
                {c.pedido.telefono ? (
                  <button
                    type="button"
                    onClick={() => onLlamar(c)}
                    aria-label="Llamar"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand active:bg-background"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void hacerAhora(c)}
                  className="h-10 shrink-0 rounded-full border border-brand px-3 text-xs font-semibold text-brand active:scale-[0.97] disabled:opacity-50"
                >
                  Ahora
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
        className="relative flex h-11 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-semibold shadow-md active:scale-[0.97]"
      >
        <Radar className="h-4 w-4 text-brand" aria-hidden />
        {cercanas.length} cerca
      </button>
    </div>
  );
}
