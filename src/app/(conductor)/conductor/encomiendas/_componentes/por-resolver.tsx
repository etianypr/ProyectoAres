"use client";

// Paso 2 del día (spec 027): los pedidos de la guía con ⚠, primero y aparte,
// cada uno con su problema escrito; los demás, plegados en una fila. Antes los
// en duda quedaban mezclados entre todos y solo "Sin ubicar" se marcaba.

import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { porRevisar } from "@/lib/encomiendas/local/corregir-direcciones";
import { BotonCorregirIA } from "./corregir-ia";
import { PorConfirmar, sePuedeResolverAqui } from "./por-confirmar";
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
  // La IA revisa también los de lugar en duda (solo la calle, calle repetida), no solo los sin
  // ubicar (2026-11-16).
  const paraIA = Math.max(sinUbicar, conProblema.filter((p) => porRevisar(p)).length);
  const aqui = conProblema.filter(sePuedeResolverAqui);
  const otros = conProblema.filter((p) => !aqui.includes(p));
  const conPropuesta = conProblema
    .filter((p) => p.propuestaIA)
    .map((p) => p.id)
    .join(",");
  return (
    <>
      <Seccion titulo={`Por resolver · ${conProblema.length}`}>
        {/* Lo de lugar se resuelve aquí mismo, sin abrir el pedido (dueño, 2026-11-16). */}
        {aqui.length > 0 ? <PorConfirmar pedidos={aqui} onResuelto={onRecargar} /> : null}
        {otros.length > 0 ? <ListaPedidos pedidos={otros} onEditar={onEditar} onEliminar={onEliminar} /> : null}
        <div className="mb-2" />
        {lecturaIA && paraIA > 0 ? (
          // La clave cambia cuando llegan propuestas guardadas (las de «Cargar guía», que la IA
          // termina con esta hoja ya armada): sin eso no se mostraban y el botón volvía a pagar.
          <BotonCorregirIA key={conPropuesta} fecha={fecha} cuantas={paraIA} onAplicada={onRecargar} />
        ) : null}
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
