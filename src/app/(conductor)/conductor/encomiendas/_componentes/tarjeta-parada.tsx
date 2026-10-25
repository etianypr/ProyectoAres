"use client";

// La parada activa (spec 003): lo primero, en la letra más grande, es lo que hace
// falta para sacar el paquete de la camioneta sin leer etiquetas —su OF y cómo
// es—; debajo, a quién y dónde. Sin OF ni referencia, el nombre vuelve a ser el
// título, sin dejar espacio vacío.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/comun/utils";
import { formatCLP, formatDistancia } from "@/lib/comun/format";
import { formatoOf, textoReferencia } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { useFotoGuardada } from "../_hooks/use-foto-paquete";

export function TarjetaParada({
  secuencia,
  pedido,
  metrosAManiobra,
  estado,
}: {
  secuencia: number;
  pedido: Pedido;
  metrosAManiobra: number | null;
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
          <p className="text-xl font-bold leading-tight tabular-nums tracking-wide">OF {formatoOf(pedido.of)}</p>
        ) : null}
        {referencia ? (
          <p className={cn("font-semibold leading-tight text-brand", pedido.of ? "text-base" : "text-lg")}>
            {referencia}
          </p>
        ) : null}
        <p
          className={cn(
            "truncate",
            conPaquete ? "mt-0.5 text-sm font-medium" : "text-lg font-semibold leading-tight",
          )}
        >
          {pedido.nombre || "Escanea la etiqueta para ver el destinatario"}
        </p>
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
        {metrosAManiobra != null && metrosAManiobra > 0 ? (
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">
            {formatDistancia(metrosAManiobra)}
          </span>
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
