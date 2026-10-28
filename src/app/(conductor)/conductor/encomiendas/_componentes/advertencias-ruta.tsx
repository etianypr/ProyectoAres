"use client";

// Lo que quedó dudoso al armar la ruta, guardado CON la ruta (ver
// Ruta.advertencias). Se muestra en terreno y no solo en la previsualización
// porque es tres horas después, mirando la lista, que el conductor se pregunta por
// qué falta un pedido (sale de pantalla.tsx, spec 002 T037).

import { AlertTriangle } from "lucide-react";
import { Seccion } from "./seccion";

export function AdvertenciasRuta({ advertencias }: { advertencias: string[] }) {
  if (advertencias.length === 0) return null;
  return (
    <Seccion titulo="Revisar antes de seguir">
      <ul className="mb-2 grid gap-1.5">
        {advertencias.map((texto) => (
          <li key={texto} className="flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2.5 text-xs text-warn">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{texto}</span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
