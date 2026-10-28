"use client";

// El final de "Cargar la guía": ubicando las direcciones, corrigiendo con IA las
// que no se ubicaron (spec 018), el resumen y las correcciones a confirmar.

import { Loader2 } from "lucide-react";
import type { PropuestaCorreccion } from "@/lib/encomiendas/local/corregir-direcciones";
import { ConfirmarCorrecciones } from "./confirmar-correcciones";

export type FinGuia =
  | { tipo: "ubicando"; hechos: number; total: number }
  | { tipo: "corrigiendo"; hechos: number; total: number }
  | {
      tipo: "listo";
      creados: number;
      ubicados: number;
      yaEstaban: number;
      /** Lo que la IA propone; el conductor confirma cada una. */
      propuestas: PropuestaCorreccion[];
    };

export function VistaFinGuia({
  paso,
  onAplicada,
}: {
  paso: FinGuia;
  /** Se confirmó una corrección: la pantalla vuelve a leer los pedidos. */
  onAplicada: () => void;
}) {
  if (paso.tipo !== "listo") {
    const corrigiendo = paso.tipo === "corrigiendo";
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium">
          {corrigiendo ? "Corrigiendo con IA las direcciones que no se ubicaron" : "Ubicando direcciones"}:{" "}
          {paso.hechos} de {paso.total}
        </p>
      </div>
    );
  }

  const faltan = paso.creados - paso.ubicados;
  return (
    <div className="space-y-3 py-6 text-center">
      <p className="text-lg font-semibold">
        {paso.creados} {paso.creados === 1 ? "pedido cargado" : "pedidos cargados"}
      </p>
      <p className="text-sm text-muted">
        {paso.ubicados} ubicados en el mapa
        {faltan > 0 ? ` · ${faltan} sin ubicar (aparecen como "Sin ubicar" en la lista)` : ""}
        {paso.yaEstaban > 0 ? ` · ${paso.yaEstaban} ya estaban cargados` : ""}.
      </p>
      <ConfirmarCorrecciones propuestas={paso.propuestas} onAplicada={onAplicada} />
    </div>
  );
}
