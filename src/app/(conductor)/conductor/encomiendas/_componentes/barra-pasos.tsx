// En qué paso del día está el conductor, arriba de la cabecera de la hoja (spec
// 027): seis rayas y el paso escrito, para que no dependa del color. No va en el
// reparto: manejando, la cabecera es solo la parada.

import { cn } from "@/lib/comun/utils";
import { PASOS, type Paso } from "../_hooks/paso-del-dia";

export function BarraPasos({ paso }: { paso: Paso }) {
  const actual = PASOS.findIndex((p) => p.paso === paso);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-6 gap-1" aria-hidden="true">
        {PASOS.map((p, i) => (
          <span
            key={p.paso}
            className={cn("h-1 rounded-full", i < actual ? "bg-brand/40" : i === actual ? "bg-brand" : "bg-border")}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brand">
        Paso {actual + 1} de {PASOS.length} · {PASOS[actual].nombre}
      </p>
    </div>
  );
}
