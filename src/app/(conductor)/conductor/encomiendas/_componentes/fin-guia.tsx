"use client";

// El final de "Cargar la guía": ubicando las direcciones, corrigiendo con IA las
// que no se ubicaron (spec 018) y el resumen.

import { Loader2, Sparkles } from "lucide-react";

export type FinGuia =
  | { tipo: "ubicando"; hechos: number; total: number }
  | { tipo: "corrigiendo"; hechos: number; total: number }
  | {
      tipo: "listo";
      creados: number;
      ubicados: number;
      yaEstaban: number;
      /** Ubicadas por la IA (ya contadas en `ubicados`). */
      corregidas: number;
      /** Lo que la IA sugiere y el conductor tiene que confirmar. */
      sugerencias: string[];
    };

export function VistaFinGuia({ paso, hayRuta }: { paso: FinGuia; hayRuta: boolean }) {
  if (paso.tipo !== "listo") {
    const corrigiendo = paso.tipo === "corrigiendo";
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium">
          {corrigiendo ? "Corrigiendo con IA las direcciones que no se ubicaron" : "Ubicando direcciones"}:{" "}
          {paso.hechos} de {paso.total}
        </p>
        <p className="text-xs text-muted">Los pedidos ya están guardados en el teléfono.</p>
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
        {paso.corregidas > 0 ? ` (${paso.corregidas} corregidos con IA)` : ""}
        {faltan > 0 ? ` · ${faltan} por revisar (aparecen como "Sin ubicar" en la lista)` : ""}
        {paso.yaEstaban > 0 ? ` · ${paso.yaEstaban} ya estaban cargados` : ""}.
      </p>
      {paso.sugerencias.length > 0 ? (
        <div className="space-y-1.5 rounded-2xl bg-brand-soft px-3 py-2.5 text-left text-sm text-brand">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-4 w-4" />
            La IA sugiere (confírmalas al corregir el pedido):
          </p>
          {paso.sugerencias.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
      ) : null}
      <p className="text-sm text-muted">
        {hayRuta
          ? "Sigue: escanea cada paquete para saber su parada."
          : "Sigue: arma la ruta del día y después escanea cada paquete para saber su parada."}
      </p>
    </div>
  );
}
