"use client";

// La parada activa (spec 003). Arriba la dirección, que es adonde se va, y el nombre, para
// saber a quién se llama; debajo la foto del paquete (para sacarlo de la camioneta sin leer
// etiquetas), la OF y el pago (spec 046, el mismo diseño de la burbuja; dueño, 2026-11-20).

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatDistancia, formatDuracion, formatTime } from "@/lib/comun/format";
import { AlertTriangle, Navigation, Package } from "lucide-react";
import { formatoOf, textoReferencia } from "@/lib/encomiendas/paquete";
import { etiquetasDelPedido } from "@/lib/encomiendas/problemas";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { useFotoGuardada } from "../_hooks/use-foto-paquete";
import { pagoDelPedido } from "../_hooks/por-pagar";
import { FichaOf, FichaPago, FotoPaquete } from "./fichas-parada";

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
  /** Navegar (spec 047): los km de la parada son el botón y ponen a ARES a guiar
   *  (antes abrían Google Maps, spec 020; ahora va en «Abrir en Google Maps»). Sin
   *  distancia aparece igual. */
  onNavegar?: () => void;
}) {
  const referencia = textoReferencia(pedido.referencia);
  const urlFoto = useFotoGuardada(pedido.fotoId);
  const [ampliada, setAmpliada] = useState(false);

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold tabular-nums text-brand-foreground">
          {secuencia}
        </span>
        <div className="min-w-0 flex-1">
          {/* Lo principal es la dirección: siempre hay una y es adonde se va; la OF es el id del
              paquete (dueño, 2026-11-16). Completa, con el depto, en hasta dos renglones. */}
          <p className="line-clamp-2 text-lg font-extrabold leading-tight tracking-tight">{pedido.direccion || "Sin dirección"}</p>
          {/* Sin nombre todavía (llega al escanear la etiqueta) no se dice nada: el
              aviso que había acá estorbaba más de lo que ayudaba (terreno 2026-10-29). */}
          {pedido.nombre ? <p className="mt-0.5 truncate text-sm text-muted">{pedido.nombre}</p> : null}
        </div>
        {(faltan && faltan.metros > 0) || onNavegar ? (
          <div className="flex shrink-0 flex-col items-end">
            <button
              type="button"
              disabled={!onNavegar}
              onClick={onNavegar}
              aria-label="Navegar"
              className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand active:scale-[0.97] disabled:active:scale-100"
            >
              {onNavegar ? <Navigation className="h-3 w-3 shrink-0" /> : null}
              {faltan && faltan.metros > 0 ? formatDistancia(faltan.metros) : "Navegar"}
            </button>
            {faltan?.segundos != null && faltan.segundos > 0 ? (
              <span className="mt-0.5 text-xs tabular-nums text-muted">
                {formatDuracion(faltan.segundos)}
                {faltan.llegada != null ? ` · ${formatTime(new Date(faltan.llegada))}` : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* La foto con medida fija y, a su derecha, la OF y el pago en fichas iguales (spec 046):
          el monto no mueve nada. La foto sirve más que una descripción (dueño, 2026-11-20). */}
      <div className="mt-2 flex gap-2.5">
        <FotoPaquete url={urlFoto} onAmpliar={() => setAmpliada(true)} />
        <div className="flex shrink-0 flex-col gap-1">
          <FichaOf of={pedido.of} />
          <FichaPago pago={pagoDelPedido(pedido)} />
        </div>
      </div>
      {referencia ? <p className="mt-1.5 text-sm font-semibold leading-tight text-brand">{referencia}</p> : null}
      {/* Su ⚠, en palabras (spec 022): al llegar se ve qué estaba en duda. */}
      {etiquetasDelPedido(pedido).map((x) => (
        <p key={x.tipo} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warn">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {x.texto}
        </p>
      ))}
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

      {ampliada && urlFoto && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              onClick={() => setAmpliada(false)}
              aria-label="Cerrar foto"
              className="animate-fade-in fixed inset-0 z-pantalla flex items-center justify-center bg-black/90 p-4"
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
