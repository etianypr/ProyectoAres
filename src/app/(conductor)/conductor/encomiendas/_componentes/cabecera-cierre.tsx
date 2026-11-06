"use client";

// La cabecera con la ruta terminada (spec 027, paso 6). La pantalla de cierre
// (spec 007) sale sola al cerrar la última parada y se puede dejar para después;
// antes, una vez aplazada, no había cómo volver a ella sin recargar la app.

import { Check, PackageCheck, X } from "lucide-react";
import { BarraPasos } from "./barra-pasos";
import { BOTON_PRINCIPAL } from "./parada-activa";

export function CabeceraCierre({
  entregadas,
  noEntregadas,
  diaCerrado,
  onCerrarDia,
}: {
  entregadas: number;
  noEntregadas: number;
  /** El día ya se cerró (pasó la ventana de deshacer la última parada). */
  diaCerrado: boolean;
  onCerrarDia: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <BarraPasos paso="cierre" />
      <div className="space-y-1">
        <p className="text-[21px] font-extrabold leading-tight tracking-tight">Ruta completa</p>
        <p className="flex gap-4 text-sm font-semibold">
          <span className="flex items-center gap-1">
            <Check className="h-4 w-4 text-ok" />
            <span className="font-mono tabular-nums">{entregadas}</span>
            {entregadas === 1 ? "entregado" : "entregados"}
          </span>
          {noEntregadas > 0 ? (
            <span className="flex items-center gap-1">
              <X className="h-4 w-4 text-danger" />
              <span className="font-mono tabular-nums">{noEntregadas}</span>
              {noEntregadas === 1 ? "no entregado" : "no entregados"}
            </span>
          ) : null}
        </p>
      </div>
      <button type="button" disabled={!diaCerrado} onClick={onCerrarDia} className={BOTON_PRINCIPAL}>
        <PackageCheck className="h-4 w-4" />
        Cerrar el día
      </button>
    </div>
  );
}
