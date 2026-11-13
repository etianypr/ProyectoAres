"use client";

// La cabecera con la ruta terminada (spec 027, paso 6). La pantalla de cierre
// (spec 007) sale sola al cerrar la última parada y se puede dejar para después;
// antes, una vez aplazada, no había cómo volver a ella sin recargar la app.
//
// Spec 033: mientras corre el «Deshacer» de la última parada, el botón dice los
// segundos que faltan (antes quedaba apagado sin decir por qué); y si llegó un
// pedido con la ruta completa, lo primero es sumarlo a la ruta.

import { useEffect, useState } from "react";
import { Check, PackageCheck, Plus, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { BOTON_PRINCIPAL } from "./parada-activa";

export function CabeceraCierre({
  entregadas,
  noEntregadas,
  diaCerrado,
  onCerrarDia,
  fuera = 0,
  deshacerHasta = null,
  onSumar,
}: {
  entregadas: number;
  noEntregadas: number;
  /** El día ya se cerró (pasó la ventana de deshacer la última parada). */
  diaCerrado: boolean;
  onCerrarDia: () => void;
  /** Pedidos pendientes con punto fuera de la ruta (llegaron tarde). */
  fuera?: number;
  /** Cuándo vence el «Deshacer» de lo último cerrado (ms), o null. */
  deshacerHasta?: number | null;
  onSumar?: () => void;
}) {
  const segundos = useSegundosHasta(diaCerrado ? null : deshacerHasta);
  return (
    <div className="space-y-2.5">
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
      {fuera > 0 && onSumar ? (
        <button type="button" onClick={onSumar} className={BOTON_PRINCIPAL}>
          <Plus className="h-4 w-4" />
          {fuera === 1 ? "Sumar 1 a la ruta" : `Sumar ${fuera} a la ruta`}
        </button>
      ) : null}
      <button
        type="button"
        disabled={!diaCerrado}
        onClick={onCerrarDia}
        className={cn(
          BOTON_PRINCIPAL,
          fuera > 0 && "border border-separator bg-card text-foreground shadow-none",
        )}
      >
        <PackageCheck className="h-4 w-4" />
        Cerrar el día
        {segundos != null ? <span className="font-mono tabular-nums opacity-80">· {segundos}</span> : null}
      </button>
    </div>
  );
}

/** Los segundos que faltan hasta `hasta` (ms), contados a la vista; null sin plazo. */
function useSegundosHasta(hasta: number | null): number | null {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta == null) return;
    const reloj = window.setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(reloj);
  }, [hasta]);
  if (hasta == null) return null;
  const s = Math.min(8, Math.ceil((hasta - ahora) / 1000));
  return s > 0 ? s : null;
}
