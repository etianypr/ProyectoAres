"use client";

// Paso 2 del día (spec 027): los pedidos de la guía con ⚠, primero y aparte,
// cada uno con su problema escrito; los demás, plegados en una fila. Antes los
// en duda quedaban mezclados entre todos y solo "Sin ubicar" se marcaba.

import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { BotonCorregirIA } from "./corregir-ia";
import { Plegable } from "./plegable";
import { ListaPedidos } from "./pedidos-fuera";
import { Seccion } from "./seccion";

export function PorResolver({
  fecha,
  conProblema,
  listos,
  sinUbicar,
  lecturaIA,
  onEditar,
  onEliminar,
  onRecargar,
}: {
  fecha: string;
  conProblema: Pedido[];
  listos: Pedido[];
  sinUbicar: number;
  lecturaIA: boolean;
  onEditar: (pedido: Pedido) => void;
  onEliminar: (pedidoId: string) => void;
  onRecargar: () => void;
}) {
  return (
    <>
      <Seccion titulo={`Por resolver · ${conProblema.length}`}>
        <ListaPedidos pedidos={conProblema} onEditar={onEditar} onEliminar={onEliminar} />
        <div className="mb-2" />
        {lecturaIA && sinUbicar > 0 ? <BotonCorregirIA fecha={fecha} cuantas={sinUbicar} onAplicada={onRecargar} /> : null}
      </Seccion>
      {listos.length > 0 ? (
        <Seccion titulo={`Listos · ${listos.length}`}>
          <Plegable resumen={listos.length === 1 ? "1 pedido ubicado" : `${listos.length} pedidos ubicados`}>
            <ListaPedidos pedidos={listos} onEditar={onEditar} onEliminar={onEliminar} />
          </Plegable>
        </Seccion>
      ) : null}
    </>
  );
}
