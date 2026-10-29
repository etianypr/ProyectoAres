"use client";

// La lista de paradas de la ruta del día, en la hoja (sale de pantalla.tsx, spec
// 002 T037).

import { Check, Clock, Phone, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { bloquePorId } from "@/lib/encomiendas/config";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { Parada } from "../_hooks/use-dia-trabajo";
import { FilaDeslizable } from "./fila-deslizable";
import { MetaBono } from "./meta-bono";
import { Seccion } from "./seccion";

export function RutaDelDia({
  paradas,
  activaId,
  entregadas,
  porcentaje,
  metaBono,
  entregadasDelDia,
  onEliminar,
  onEditar,
}: {
  paradas: Parada[];
  activaId: string | null;
  /** Entregadas de la ruta y su porcentaje, para la barra. */
  entregadas: number;
  porcentaje: number;
  /** Entregas que dan el bono (spec 006); null = sin bono. */
  metaBono: number | null;
  entregadasDelDia: number;
  onEliminar: (pedidoId: string) => void;
  /** Tocar una parada pendiente abre su edición: con la ruta armada se corrige
   *  ahí la OF, el teléfono o la dirección (terreno 2026-10-29). */
  onEditar: (pedido: Pedido) => void;
}) {
  return (
    <Seccion titulo="Ruta del día">
          <div className="mb-2.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ececef]">
              <div
                className="h-full rounded-full bg-ok transition-[width] duration-500"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
              {entregadas} de {paradas.length}
            </span>
          </div>
          <MetaBono meta={metaBono} entregadas={entregadasDelDia} />
    
          <ol className="overflow-hidden rounded-2xl bg-card shadow-soft">
            {paradas.map((p, i) => {
              const esActiva = p.pedido.id === activaId;
              // Una cerrada es el registro del día (ver el deslizar, abajo): no se edita.
              const editable = p.pedido.resultado === "pendiente";
              return (
                <FilaDeslizable
                  key={p.pedido.id}
                  separador={i > 0}
                  etiqueta={nombreVisible(p.pedido)}
                  onEliminar={() => onEliminar(p.pedido.id)}
                  // Una parada ya cerrada no se desliza. Lo que se ve ahí es
                  // el registro de lo que pasó en el día —cuántas se
                  // entregaron, cuántas no y por qué—, y es lo que el jefe
                  // va a mirar después: sacarlo de la lista con un gesto lo
                  // haría desaparecer de la vista del conductor sin que nada
                  // más cambie. Para eliminar hay que dejarla pendiente.
                  habilitado={p.pedido.resultado === "pendiente"}
                  className={esActiva ? "bg-brand-soft" : "bg-card"}
                >
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => onEditar(p.pedido)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors active:bg-background disabled:active:bg-transparent"
                  >
                    <span
                      className={cn(
                        "w-5 shrink-0 text-center text-xs font-semibold tabular-nums",
                        esActiva ? "text-brand" : "text-muted",
                      )}
                    >
                      {p.secuencia}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate font-medium leading-tight",
                          p.pedido.resultado === "entregado" && "text-muted",
                        )}
                      >
                        {nombreVisible(p.pedido)}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {p.pedido.direccion}
                      </span>
                    </span>
                    {/* Lo que contestó el receptor, en la propia lista: es
                        lo que el conductor mira para decidir el orden real y a
                        quién llamar. Cada estado con icono, no solo color. */}
                    {p.pedido.resultado === "pendiente" ? (
                      p.pedido.bloqueHorarioId ? (
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums text-brand">
                          <Clock className="h-3 w-3" />
                          {bloquePorId(p.pedido.bloqueHorarioId)?.desde ?? ""}
                        </span>
                      ) : p.pedido.disponibilidad === "confirmado" ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-ok" aria-label="Confirmó" />
                      ) : p.hayQueContactar ? (
                        <Phone
                          className="h-3.5 w-3.5 shrink-0 text-muted"
                          aria-label="Hay que llamarlo"
                        />
                      ) : null
                    ) : null}
    
                    {p.pedido.resultado === "entregado" ? (
                      <Check className="h-4 w-4 shrink-0 text-ok" />
                    ) : p.pedido.resultado === "no_entregado" ? (
                      <X className="h-4 w-4 shrink-0 text-danger" aria-label="No entregado" />
                    ) : null}
                  </button>
                </FilaDeslizable>
              );
            })}
          </ol>
        </Seccion>
  );
}
