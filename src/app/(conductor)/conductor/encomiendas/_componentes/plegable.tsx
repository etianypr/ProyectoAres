"use client";

// Una fila que se abre: lo que se puede revisar pero no hace falta mirar, como
// los pedidos ya listos o la ruta de un día terminado (spec 027). Plegado, el
// resumen dice lo importante sin abrirlo.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/comun/utils";

export function Plegable({ resumen, children }: { resumen: React.ReactNode; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 rounded-2xl bg-card px-3.5 py-3 text-left text-sm shadow-soft active:bg-background"
      >
        <span className="min-w-0 flex-1 font-medium">{resumen}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto ? children : null}
    </div>
  );
}
