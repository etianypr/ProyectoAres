"use client";

// Un pedido fuera de la ruta, en "Pedidos fuera de la ruta" (sale de pantalla.tsx,
// spec 002 T037).

import { MapPin, MapPinOff } from "lucide-react";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { FilaDeslizable } from "./fila-deslizable";

/** Fila de un pedido que todavía no entró en la ruta. Tocarla abre la edición:
 *  es la única forma de arreglar una dirección que no se pudo ubicar.
 *
 *  El estado de ubicación se dice DOS veces a propósito —con el icono tachado y
 *  con la palabra "Corregir"—. Un pedido sin ubicar no entra en ninguna ruta, así
 *  que si el conductor no se entera, ese paquete no sale de la camioneta; y una
 *  marca que solo se distingue por el color no la ve nadie de reojo, a pleno sol,
 *  con el teléfono en una mano (la constitución lo pide explícitamente: los
 *  estados no pueden depender solo del color). */
export function FilaPedido({
  pedido,
  primera,
  onEditar,
  onEliminar,
}: {
  pedido: Pedido;
  primera: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const sinUbicar = pedido.lat == null || pedido.lng == null;
  return (
    <FilaDeslizable
      separador={!primera}
      etiqueta={nombreVisible(pedido)}
      onEliminar={onEliminar}
      className="bg-card"
    >
      <button
        type="button"
        onClick={onEditar}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm transition-colors active:bg-background"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{nombreVisible(pedido)}</p>
          <p className="truncate text-xs text-muted">{pedido.direccion}</p>
          {sinUbicar ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-warn">
              <MapPinOff className="h-3 w-3 shrink-0" />
              Sin ubicar
            </p>
          ) : null}
        </div>
        {sinUbicar ? (
          <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
            Corregir
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted">
            <MapPin className="h-3 w-3 shrink-0 text-ok" />
            Ubicado
          </span>
        )}
      </button>
    </FilaDeslizable>
  );
}
