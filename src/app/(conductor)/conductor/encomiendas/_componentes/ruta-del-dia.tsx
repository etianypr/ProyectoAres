"use client";

// La lista de paradas de la ruta del día, en la hoja (sale de pantalla.tsx, spec
// 002 T037).

import { memo, useState } from "react";
import { AlertTriangle, Check, Clock, Phone, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { bloquePorId } from "@/lib/encomiendas/config";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import { sePuedeCambiar, type Pedido } from "@/lib/encomiendas/local/almacen";
import type { ResultadoVisita } from "@/lib/encomiendas/estados";
import type { Parada } from "../_hooks/use-dia-trabajo";
import { FilaDeslizable } from "./fila-deslizable";
import { MetaBono } from "./meta-bono";
import { Seccion } from "./seccion";

// Memorizada: con 60 paradas es lo más pesado de la hoja, y la pantalla se
// vuelve a dibujar con cada lectura del GPS. Solo se redibuja si cambia algo
// suyo (las acciones llegan estables, ver use-evento.ts).
export const RutaDelDia = memo(function RutaDelDia({
  paradas,
  activaId,
  entregadas,
  porcentaje,
  metaBono,
  entregadasDelDia,
  onEliminar,
  onEditar,
  onCambiar,
  soloLista = false,
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
  /** Tocar una parada cerrada ofrece pasarla a otro estado (spec 033, G5; dueño
   *  2026-11-13), mientras su evento se pueda borrar en el servidor (< 12 h). */
  onCambiar: (pedidoId: string, nuevo: ResultadoVisita) => void;
  /** Sin título ni barra: la ruta plegada de un día terminado (spec 027). */
  soloLista?: boolean;
}) {
  // La parada cerrada con las opciones a la vista (una a la vez).
  const [abierta, setAbierta] = useState<string | null>(null);
  const lista = (
          <ol className="overflow-hidden rounded-2xl bg-card shadow-soft">
            {paradas.map((p, i) => {
              const esActiva = p.pedido.id === activaId;
              // Una cerrada es el registro del día (ver el deslizar, abajo): no se edita.
              const editable = p.pedido.resultado === "pendiente";
              const cambiable = !editable && sePuedeCambiar(p.pedido);
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
                    disabled={!editable && !cambiable}
                    aria-expanded={cambiable ? abierta === p.pedido.id : undefined}
                    onClick={() =>
                      editable ? onEditar(p.pedido) : setAbierta((a) => (a === p.pedido.id ? null : p.pedido.id))
                    }
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
                      {/* El ⚠ de la parada, en palabras (spec 027). */}
                      {editable
                        ? problemasDelPedido(p.pedido).map((x) => (
                            <span key={x.tipo} className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-warn">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {x.texto}
                            </span>
                          ))
                        : null}
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
                  {cambiable && abierta === p.pedido.id ? (
                    <CambiarEstado
                      actual={p.pedido.resultado}
                      onElegir={(nuevo) => {
                        setAbierta(null);
                        onCambiar(p.pedido.id, nuevo);
                      }}
                    />
                  ) : null}
                </FilaDeslizable>
              );
            })}
          </ol>
  );
  if (soloLista) return lista;
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
          {lista}
        </Seccion>
  );
});

const OPCIONES: { valor: ResultadoVisita; texto: string; Icono: typeof Check }[] = [
  { valor: "entregado", texto: "Entregado", Icono: Check },
  { valor: "no_entregado", texto: "No entregado", Icono: X },
  { valor: "pendiente", texto: "Pendiente", Icono: RotateCcw },
];

/** Los tres estados de una parada cerrada; el actual queda marcado y sin acción. */
function CambiarEstado({ actual, onElegir }: { actual: ResultadoVisita; onElegir: (nuevo: ResultadoVisita) => void }) {
  return (
    <div className="flex gap-1.5 px-3.5 pb-2.5">
      {OPCIONES.map(({ valor, texto, Icono }) => (
        <button
          key={valor}
          type="button"
          disabled={valor === actual}
          aria-pressed={valor === actual}
          onClick={() => onElegir(valor)}
          className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-separator bg-card text-xs font-semibold text-foreground active:scale-[0.97] disabled:border-transparent disabled:bg-background disabled:text-muted"
        >
          <Icono className="h-3.5 w-3.5 shrink-0" />
          {texto}
        </button>
      ))}
    </div>
  );
}
