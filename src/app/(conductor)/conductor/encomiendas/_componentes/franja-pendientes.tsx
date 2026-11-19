"use client";

// La franja de lo que falta corregir en la ruta propuesta (spec 037). Una dirección
// quedó lejos de las demás, o sin ubicar, y con varias a la vez se olvida cuál es:
// la franja la deja siempre a la vista, pegada a los botones, con «Editar» y
// «Mantener». Con ediciones hechas ofrece «Recalcular ruta»: el orden se rehace
// cuando el conductor lo pide, no con cada corrección.

import { MapPinOff, Pencil, RefreshCw } from "lucide-react";
import { formatDistancia } from "@/lib/comun/format";
import { cn } from "@/lib/comun/utils";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { PedidoUbicado } from "@/lib/encomiendas/local/generar-ruta";
import type { ParadaLejana } from "@/lib/encomiendas/local/generar-ruta/lejanas";

type PendienteDeCorregir = {
  pedidoId: string;
  direccion: string;
  /** Qué tiene: «A 3,2 km del resto · agrega 4,1 km», «Sin ubicar». */
  motivo: string;
  /** Una lejana se puede dejar en la ruta; una sin ubicar no tiene punto adonde ir. */
  sePuedeMantener: boolean;
};

/** Lo que falta corregir, en el orden de la ruta y con los sin ubicar al final. Un
 *  pedido sin ubicar al que ya se le puso punto deja de ser pendiente: entra a la
 *  ruta al recalcular. */
export function pendientesDeCorregir(
  paradas: PedidoUbicado[],
  lejanas: ParadaLejana[],
  sinUbicar: Pedido[],
  numero: (i: number) => number,
): PendienteDeCorregir[] {
  return [
    ...lejanas.flatMap((l) => {
      const i = paradas.findIndex((p) => p.id === l.pedidoId);
      if (i < 0) return [];
      return [
        {
          pedidoId: l.pedidoId,
          direccion: l.direccion,
          motivo: `Parada ${numero(i)} · a ${formatDistancia(l.metrosAlResto)} del resto, agrega ${formatDistancia(l.metrosQueSuma)}`,
          sePuedeMantener: true,
        },
      ];
    }),
    ...sinUbicar
      .filter((p) => p.lat == null || p.lng == null)
      .map((p) => ({ pedidoId: p.id, direccion: p.direccion, motivo: "Sin ubicar · queda fuera de la ruta", sePuedeMantener: false })),
  ];
}

const BOTON ="flex h-9 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export function FranjaPendientes({
  pendientes,
  conCambios,
  ocupada,
  recalculando,
  onEditar,
  onMantener,
  onRecalcular,
}: {
  pendientes: PendienteDeCorregir[];
  /** Hubo ediciones y el orden sigue siendo el de antes. */
  conCambios: boolean;
  /** Algo está pasando (guardando, invirtiendo): no se toca nada. */
  ocupada: boolean;
  recalculando: boolean;
  onEditar: (pedidoId: string) => void;
  onMantener: (pedidoId: string) => void;
  onRecalcular: () => void;
}) {
  if (pendientes.length === 0 && !conCambios) return null;
  const primera = pendientes[0];
  const bloqueada = ocupada || recalculando;

  const recalcular = (
    <button
      type="button"
      onClick={onRecalcular}
      disabled={bloqueada}
      className={cn(BOTON, "ml-auto", primera ? "border border-warn/30 text-warn" : "bg-brand text-brand-foreground")}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", recalculando && "animate-spin")} />
      {recalculando ? "Recalculando…" : "Recalcular ruta"}
    </button>
  );

  // Sin pendientes: lo único que queda es aplicar lo corregido.
  if (!primera) {
    return (
      <div className="mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-background px-3 py-1.5 text-xs">
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">Direcciones corregidas</span>
        {recalcular}
      </div>
    );
  }

  return (
    <div className="mt-2 shrink-0 rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn" data-franja-pendientes>
      <p className="flex items-center gap-2">
        <MapPinOff className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {pendientes.length > 1 ? `Corregir 1 de ${pendientes.length} · ` : "Corregir · "}
          {primera.direccion || "Sin dirección"}
        </span>
      </p>
      <p className="mt-0.5 truncate pl-[22px] text-[11px]">{primera.motivo}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onEditar(primera.pedidoId)} disabled={bloqueada} className={cn(BOTON, "bg-warn text-white")}>
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
        {primera.sePuedeMantener ? (
          <button
            type="button"
            onClick={() => onMantener(primera.pedidoId)}
            disabled={bloqueada}
            className={cn(BOTON, "border border-warn/30")}
          >
            Mantener
          </button>
        ) : null}
        {conCambios ? recalcular : null}
      </div>
    </div>
  );
}
