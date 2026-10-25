"use client";

// Paquetes de la guía sin etiqueta escaneada (spec 005, US5). Se muestra con la
// ruta armada y hasta la primera parada cerrada: es el momento de buscarlos en
// el auto. No bloquea nada; si no aparecen, quedan en "No entregados" al cerrar
// el día y vuelven a Starken.

import { AlertTriangle } from "lucide-react";
import { sinEtiquetaEscaneada, type Pedido } from "@/lib/encomiendas/local/almacen";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { Seccion } from "./seccion";

export function AvisoSinEtiqueta({ pedidos }: { pedidos: Pedido[] }) {
  const faltan = sinEtiquetaEscaneada(pedidos);
  const empezo = pedidos.some((p) => p.resultado !== "pendiente");
  if (faltan.length === 0 || empezo) return null;

  return (
    <Seccion titulo={`Sin etiqueta escaneada (${faltan.length})`}>
      <p className="mb-2 flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2.5 text-xs text-warn">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Están en la guía y su etiqueta no se escaneó. Búscalos en el auto; si no vienen, avísale a
        Starken.
      </p>
      <ul className="mb-2 flex flex-wrap gap-1.5">
        {faltan.map((p) => (
          <li key={p.id} className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold tabular-nums shadow-soft">
            OF {p.of ? formatoOf(p.of) : "sin OF"}
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
