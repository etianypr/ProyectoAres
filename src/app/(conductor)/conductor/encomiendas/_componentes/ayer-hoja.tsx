// Cómo terminó ayer, adentro de la hoja con el día vacío (spec 027, paso 1): es
// lo único que hay para mirar antes de cargar la guía.

import { Check, X } from "lucide-react";
import { Seccion } from "./seccion";

export function AyerHoja({ ayer }: { ayer: { entregadas: number; noEntregadas: number } }) {
  const celda = "rounded-2xl bg-card px-3.5 py-3 shadow-soft";
  return (
    <Seccion titulo="Ayer">
      <div className="grid grid-cols-2 gap-2">
        <div className={celda}>
          <p className="font-mono text-2xl font-semibold leading-tight tabular-nums">{ayer.entregadas}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <Check className="h-3.5 w-3.5 text-ok" />
            {ayer.entregadas === 1 ? "entregado" : "entregados"}
          </p>
        </div>
        <div className={celda}>
          <p className="font-mono text-2xl font-semibold leading-tight tabular-nums">{ayer.noEntregadas}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <X className="h-3.5 w-3.5 text-danger" />
            {ayer.noEntregadas === 1 ? "no entregado" : "no entregados"}
          </p>
        </div>
      </div>
    </Seccion>
  );
}
