"use client";

// "Pedidos fuera de la ruta": los que no entraron, corregir con IA, sumarlos de
// pasada, cargar la guía o uno a mano (sale de pantalla.tsx, spec 002 T037).

import { ClipboardList, Plus } from "lucide-react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { BotonCorregirIA } from "./corregir-ia";
import { FilaPedido } from "./fila-pedido";
import { Seccion } from "./seccion";

export function PedidosFueraDeRuta({
  fecha,
  sinRutear,
  sinUbicar,
  hayRuta,
  lecturaIA,
  guardando,
  onEditar,
  onEliminar,
  onRecargar,
  onSumar,
  onCargarGuia,
  onAgregar,
}: {
  fecha: string;
  sinRutear: Pedido[];
  /** Cuántos de ellos no tienen punto en el mapa. */
  sinUbicar: number;
  hayRuta: boolean;
  lecturaIA: boolean;
  guardando: boolean;
  onEditar: (pedido: Pedido) => void;
  onEliminar: (pedidoId: string) => void;
  /** Se corrigió una dirección: volver a leer los pedidos. */
  onRecargar: () => void;
  /** Sumar los que tienen punto a la ruta en curso (spec 017, R4). */
  onSumar: () => Promise<void>;
  onCargarGuia: () => void;
  onAgregar: () => void;
}) {
  return (
    <Seccion titulo="Pedidos fuera de la ruta">
          {sinRutear.length > 0 ? (
            <>
              <ul className="overflow-hidden rounded-2xl bg-card shadow-soft">
                {sinRutear.map((p, i) => (
                  <FilaPedido
                    key={p.id}
                    pedido={p}
                    primera={i === 0}
                    onEditar={() => onEditar(p)}
                    onEliminar={() => onEliminar(p.id)}
                  />
                ))}
              </ul>
              <p className="mb-2 mt-1.5 px-1 text-xs text-muted">
                {sinUbicar > 0
                  ? `${sinUbicar === 1 ? "Una dirección no se pudo ubicar" : `${sinUbicar} direcciones no se pudieron ubicar`} en el mapa: toca el pedido para corregirla.`
                  : hayRuta
                    ? "Rehaz la ruta para que entren."
                    : "Arma la ruta para que entren."}{" "}
                Desliza uno hacia la izquierda para eliminarlo.
              </p>
              {/* Spec 018: la IA busca en Mapbox, OSM y Google y propone; el
                  conductor confirma cada corrección. */}
              {lecturaIA && sinUbicar > 0 ? (
                <BotonCorregirIA
                  fecha={fecha}
                  cuantas={sinUbicar}
                  onAplicada={onRecargar}
                />
              ) : null}
              {/* Spec 017, R4: un pedido que llega con la ruta andando entra
                  donde menos alarga, sin rehacer todo ni mover la parada activa. */}
              {hayRuta && sinRutear.length > sinUbicar ? (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void onSumar()}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-semibold text-brand-foreground shadow-soft disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {sinRutear.length - sinUbicar === 1
                    ? "Sumarlo a la ruta, donde menos alarga"
                    : `Sumar los ${sinRutear.length - sinUbicar} a la ruta, donde menos alargan`}
                </button>
              ) : null}
            </>
          ) : (
            <p className="mb-2 px-1 text-xs text-muted">
              {hayRuta
                ? "Todos los pedidos cargados están en la ruta."
                : "No hay pedidos cargados para hoy."}
            </p>
          )}
    
          <button
            type="button"
            onClick={onCargarGuia}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3.5 text-sm font-semibold text-brand shadow-soft transition-colors active:bg-brand-soft"
          >
            <ClipboardList className="h-4 w-4" />
            Cargar la guía
          </button>
          <button
            type="button"
            onClick={onAgregar}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-separator bg-card py-3.5 text-sm font-semibold text-brand transition-colors active:bg-brand-soft"
          >
            <Plus className="h-4 w-4" />
            Agregar pedido a mano
          </button>
        </Seccion>
  );
}
