"use client";

// Pedidos que no están en la ruta: "Pedidos" antes de armarla (spec 027, paso 3)
// y "Pedidos fuera de la ruta" con la ruta andando, con corregir con IA y
// sumarlos de pasada (sale de pantalla.tsx, spec 002 T037). Sin pedidos no se
// dibuja: cargar la guía o uno a mano están en la cabecera o al pie de la hoja.

import { Plus } from "lucide-react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { BotonCorregirIA } from "./corregir-ia";
import { FilaPedido } from "./fila-pedido";
import { Seccion } from "./seccion";

export function PedidosFueraDeRuta({
  titulo,
  fecha,
  pedidos,
  sinUbicar,
  hayRuta,
  lecturaIA,
  guardando,
  onEditar,
  onEliminar,
  onRecargar,
  onSumar,
}: {
  titulo: string;
  fecha: string;
  pedidos: Pedido[];
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
}) {
  if (pedidos.length === 0) return null;
  return (
    <Seccion titulo={titulo}>
      <ListaPedidos pedidos={pedidos} onEditar={onEditar} onEliminar={onEliminar} />
      <div className="mb-2" />
      {/* Spec 018: la IA busca en OSM y Google y propone; el conductor confirma
          cada corrección. */}
      {lecturaIA && sinUbicar > 0 ? <BotonCorregirIA fecha={fecha} cuantas={sinUbicar} onAplicada={onRecargar} /> : null}
      {/* Spec 017, R4: un pedido que llega con la ruta andando entra donde menos
          alarga, sin rehacer todo ni mover la parada activa. */}
      {hayRuta && pedidos.length > sinUbicar ? (
        <button
          type="button"
          disabled={guardando}
          onClick={() => void onSumar()}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-semibold text-brand-foreground shadow-soft disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {pedidos.length - sinUbicar === 1 ? "Sumar a la ruta" : `Sumar ${pedidos.length - sinUbicar} a la ruta`}
        </button>
      ) : null}
    </Seccion>
  );
}

export function ListaPedidos({
  pedidos,
  onEditar,
  onEliminar,
}: {
  pedidos: Pedido[];
  onEditar: (pedido: Pedido) => void;
  onEliminar: (pedidoId: string) => void;
}) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-card shadow-soft">
      {pedidos.map((p, i) => (
        <FilaPedido key={p.id} pedido={p} primera={i === 0} onEditar={() => onEditar(p)} onEliminar={() => onEliminar(p.id)} />
      ))}
    </ul>
  );
}
