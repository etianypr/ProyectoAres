"use client";

// La parada activa (spec 003): lo primero, en la letra más grande, es lo que hace
// falta para sacar el paquete de la camioneta sin leer etiquetas —su OF y cómo
// es—; debajo, a quién y dónde. Sin OF ni referencia, el nombre vuelve a ser el
// título, sin dejar espacio vacío.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/comun/utils";
import { formatCLP, formatDistancia, formatDuracion, formatTime } from "@/lib/comun/format";
import { AlertTriangle } from "lucide-react";
import { formatoOf, ofDistinta, textoReferencia } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { useFotoGuardada } from "../_hooks/use-foto-paquete";

export function TarjetaParada({
  secuencia,
  pedido,
  faltan,
  estado,
}: {
  secuencia: number;
  pedido: Pedido;
  /** Lo que falta hasta ESTA parada por calle (spec 017, N4). Antes acá iban
   *  los metros a la próxima maniobra, que ya están en el cartel de arriba y
   *  no dicen cuánto queda para entregar. */
  faltan: { metros: number; segundos: number | null; llegada: number | null } | null;
  /** El renglón de lo que contestó el receptor (lo arma la pantalla). */
  estado: ReactNode;
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
            {ofDistinta(pedido.of) ? (
              <AlertTriangle aria-label="OF distinta" className="ml-1.5 inline h-5 w-5 align-[-3px] text-warn" />
            ) : null}
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
        {/* Spec 005: lo que hay que cobrar, en palabras y no solo en color. */}
        {pedido.porPagar ? (
          <p className="mt-1 inline-block rounded-lg bg-danger-bg px-2 py-0.5 text-sm font-bold text-danger">
            POR PAGAR {pedido.montoPorPagar != null ? formatCLP(pedido.montoPorPagar) : "· monto por revisar"}
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
        {faltan && faltan.metros > 0 ? (
          <div className="flex flex-col items-end">
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">
              {formatDistancia(faltan.metros)}
            </span>
            {faltan.segundos != null && faltan.segundos > 0 ? (
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
