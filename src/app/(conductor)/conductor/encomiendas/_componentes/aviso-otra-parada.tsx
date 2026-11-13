"use client";

// El aviso del escáner abierto desde la parada cuando el paquete es de otra (spec
// 033, escanear-parada; la lógica en _hooks/otra-parada.ts). El escáner no se
// cierra: se escanea el que corresponde.

import { AlertTriangle } from "lucide-react";
import type { ResultadoEscaneo } from "@/lib/encomiendas/local/almacen";
import { textoOtraParada, type PaqueteEsperado } from "../_hooks/otra-parada";

export { tituloEsperado, type PaqueteEsperado } from "../_hooks/otra-parada";

export function AvisoOtraParada({ esperado, r }: { esperado: PaqueteEsperado | null; r: Pick<ResultadoEscaneo, "pedido" | "parada"> }) {
  const texto = textoOtraParada(esperado, r);
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {texto}
    </p>
  );
}
