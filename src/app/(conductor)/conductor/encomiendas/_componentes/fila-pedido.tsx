"use client";

// Un pedido que todavía no está en la ruta: en "Por resolver", en "Pedidos" o en
// "Pedidos fuera de la ruta" (sale de pantalla.tsx, spec 002 T037).

import { AlertTriangle, MapPinOff } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { problemasDelPedido, type TipoProblema } from "@/lib/encomiendas/problemas";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { FilaDeslizable } from "./fila-deslizable";

/** Qué se hace con cada ⚠ al tocar la fila (siempre abre la edición). */
const ACCION: Record<TipoProblema, string> = {
  sin_ubicar: "Corregir",
  of_distinta: "Revisar",
  sin_of: "Escribir",
};

/** Tocarla abre la edición: es como se arregla un ⚠.
 *
 *  Un ⚠ se dice DOS veces a propósito —con el problema escrito y con la acción
 *  al lado—. Un pedido sin ubicar no entra en ninguna ruta, así que si el
 *  conductor no se entera, ese paquete no sale de la camioneta; y una marca que
 *  solo se distingue por el color no la ve nadie de reojo, a pleno sol (la
 *  constitución lo pide: los estados no pueden depender solo del color).
 *
 *  Sin ⚠ la fila no lleva marca (spec 027): "Ubicado" en cada fila no decía nada
 *  cuando todos lo estaban. */
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
  const problemas = problemasDelPedido(pedido);
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
          <p className={cn("truncate font-medium leading-tight", !pedido.nombre && "font-mono tabular-nums")}>
            {nombreVisible(pedido)}
          </p>
          <p className="truncate text-xs text-muted">{pedido.direccion}</p>
          {problemas.map((p) => {
            const Icono = p.tipo === "sin_ubicar" ? MapPinOff : AlertTriangle;
            return (
              <p key={p.tipo} className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-warn">
                <Icono className="h-3 w-3 shrink-0" />
                {p.texto}
              </p>
            );
          })}
        </div>
        {problemas.length > 0 ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
            {ACCION[problemas[0].tipo]}
          </span>
        ) : null}
      </button>
    </FilaDeslizable>
  );
}
