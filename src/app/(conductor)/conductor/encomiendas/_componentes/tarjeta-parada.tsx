"use client";

// La parada activa (spec 003): lo primero, en la letra más grande, es lo que hace
// falta para sacar el paquete de la camioneta sin leer etiquetas —su OF y cómo
// es—; debajo, a quién y dónde. Sin OF ni referencia, el nombre vuelve a ser el
// título, sin dejar espacio vacío.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/comun/utils";
import { formatCLP, formatDistancia, formatDuracion, formatTime } from "@/lib/comun/format";
import { AlertTriangle, Navigation, Package } from "lucide-react";
import { formatoOf, textoReferencia } from "@/lib/encomiendas/paquete";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { useFotoGuardada } from "../_hooks/use-foto-paquete";
import { porPagarPorRevisar } from "../_hooks/por-pagar";

export function TarjetaParada({
  secuencia,
  pedido,
  faltan,
  estado,
  onNavegar,
  juntas = [],
}: {
  secuencia: number;
  pedido: Pedido;
  /** Los otros pedidos en el mismo punto, que siguen (spec 033, misma-dir). */
  juntas?: Pedido[];
  /** Lo que falta hasta ESTA parada (spec 017, N4): por el tramo de la línea del
   *  día, o en línea recta si el auto no va por él (spec 020; entonces sin
   *  segundos). */
  faltan: { metros: number; segundos: number | null; llegada: number | null } | null;
  /** El renglón de lo que contestó el receptor (lo arma la pantalla). */
  estado: ReactNode;
  /** Navegar con Google Maps y la burbuja de ARES (spec 020): los km de la parada
   *  son el botón, y sin distancia aparece igual. */
  onNavegar?: () => void;
}) {
  const referencia = textoReferencia(pedido.referencia);
  const conPaquete = pedido.of != null || referencia != null;
  const urlFoto = useFotoGuardada(pedido.fotoId);
  const [ampliada, setAmpliada] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold tabular-nums text-brand-foreground">
        {secuencia}
      </span>
      <div className="min-w-0 flex-1">
        {pedido.of ? (
          <p className="font-mono text-[22px] font-semibold leading-tight tracking-tight">
            OF {formatoOf(pedido.of)}
          </p>
        ) : null}
        {referencia ? (
          <p className={cn("font-semibold leading-tight text-brand", pedido.of ? "text-base" : "text-lg")}>
            {referencia}
          </p>
        ) : null}
        {/* Sin nombre todavía (llega al escanear la etiqueta) no se dice nada: el
            aviso que había acá estorbaba más de lo que ayudaba (terreno 2026-10-29). */}
        {pedido.nombre ? (
          <p
            className={cn(
              "truncate",
              conPaquete ? "mt-0.5 text-sm font-medium" : "text-lg font-semibold leading-tight",
            )}
          >
            {pedido.nombre}
          </p>
        ) : null}
        <p className="truncate text-sm text-muted">{pedido.direccion}</p>
        {/* Su ⚠, en palabras (spec 022): al llegar se ve qué estaba en duda. */}
        {problemasDelPedido(pedido).map((x) => (
          <p key={x.tipo} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {x.texto}
          </p>
        ))}
        {/* Spec 005: lo que hay que cobrar, en palabras y no solo en color. */}
        {pedido.porPagar ? (
          <p className="mt-1 inline-block rounded-lg bg-danger-bg px-2 py-0.5 text-sm font-bold text-danger">
            POR PAGAR {pedido.montoPorPagar != null ? formatCLP(pedido.montoPorPagar) : "· monto por revisar"}
          </p>
        ) : porPagarPorRevisar(pedido) ? (
          // Sin leer si se cobra (spec 033): nunca se supone que no.
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            POR PAGAR por revisar
          </p>
        ) : null}
        {juntas.length > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-brand">
            <Package className="h-4 w-4 shrink-0" />
            {juntas.length + 1} paquetes aquí
            <span className="min-w-0 truncate font-mono text-xs font-medium text-muted">
              {juntas.map((p) => (p.of ? ` · OF ${formatoOf(p.of)}` : "")).join("")}
            </span>
          </p>
        ) : null}
        {pedido.bultos != null && pedido.bultos > 1 ? (
          <p className="mt-0.5 text-xs font-medium text-muted">
            {pedido.bultos} bultos
            {pedido.bultosEscaneados.length < pedido.bultos
              ? ` · escaneados ${pedido.bultosEscaneados.length}`
              : ""}
          </p>
        ) : null}
        {estado}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {(faltan && faltan.metros > 0) || onNavegar ? (
          <div className="flex flex-col items-end">
            <button
              type="button"
              disabled={!onNavegar}
              onClick={onNavegar}
              aria-label="Navegar con Google Maps"
              className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand active:scale-[0.97] disabled:active:scale-100"
            >
              {onNavegar ? <Navigation className="h-3 w-3 shrink-0" /> : null}
              {faltan && faltan.metros > 0 ? formatDistancia(faltan.metros) : "Navegar"}
            </button>
            {faltan?.segundos != null && faltan.segundos > 0 ? (
              <span className="mt-0.5 text-[11px] tabular-nums text-muted">
                {formatDuracion(faltan.segundos)}
                {faltan.llegada != null ? ` · ${formatTime(new Date(faltan.llegada))}` : ""}
              </span>
            ) : null}
          </div>
        ) : null}
        {urlFoto ? (
          <button type="button" onClick={() => setAmpliada(true)} aria-label="Ver la foto del paquete">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL local del teléfono */}
            <img src={urlFoto} alt="" className="h-14 w-14 rounded-xl object-cover shadow-soft" />
          </button>
        ) : null}
      </div>

      {ampliada && urlFoto && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              onClick={() => setAmpliada(false)}
              aria-label="Cerrar la foto"
              className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL local del teléfono */}
              <img src={urlFoto} alt="Foto del paquete" className="max-h-full max-w-full rounded-xl object-contain" />
            </button>,
            document.body,
          )
        : null}
    </div>
  );
}
