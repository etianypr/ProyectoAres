"use client";

// "Tu día": por qué el día no se cerró, cómo terminó ayer y lo que falta enviar
// (sale de pantalla.tsx, spec 002 T037).

import { AlertTriangle, CloudOff } from "lucide-react";
import { Seccion } from "./seccion";

export function TuDia({
  motivoNoCerrar,
  ayer,
  sinEnviar,
  errorEnvio,
  enviando,
  onReintentar,
  rechazados,
}: {
  /** FR-020: por qué el día no se cierra, solo con todas las paradas marcadas. */
  motivoNoCerrar: string | null;
  ayer: { entregadas: number; noEntregadas: number } | null;
  sinEnviar: number;
  errorEnvio: string | null;
  enviando: boolean;
  onReintentar: () => void;
  rechazados: number;
}) {
  return (
    <Seccion titulo="Tu día">
          <div className="space-y-2">
            {/* Los tres contadores grandes (entregadas / sin entregar /
                pendientes) se fueron: eso mismo está arriba en el carril, dentro
                del cartel de navegación, y es lo que se mira de reojo manejando.
                Acá abajo queda solo lo que hay que leer parado: por qué el día
                no se cerró y qué falta enviar. */}
    
            {/* FR-020: por qué el día no se puede cerrar todavía. Se muestra
                solo cuando ya no quedan paradas por marcar, que es cuando el
                conductor espera que el día se cierre solo y no entiende por qué no
                lo hace. */}
            {motivoNoCerrar ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">El día no se cerró todavía</p>
                  <p className="mt-0.5 text-xs">{motivoNoCerrar}</p>
                </div>
              </div>
            ) : null}
    
            {ayer ? (
              <p className="px-1 text-xs text-muted">
                Ayer: {ayer.entregadas} {ayer.entregadas === 1 ? "entrega" : "entregas"}
                {ayer.noEntregadas > 0 ? ` y ${ayer.noEntregadas} sin entregar` : ""}.
              </p>
            ) : null}
    
            {sinEnviar > 0 ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {sinEnviar === 1
                      ? "1 registro sin enviar"
                      : `${sinEnviar} registros sin enviar`}
                  </p>
                  <p className="text-xs opacity-90">
                    {/* Un rechazo del servidor no es "falta señal": se dice lo
                        que pasó, para que avise a la oficina (spec 017, E8). */}
                    {errorEnvio && !/fetch|network|red|señal|timeout|abort/i.test(errorEnvio)
                      ? `El servidor no lo aceptó: ${errorEnvio}. Avisa a la oficina.`
                      : "Se envía solo con señal."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onReintentar}
                  disabled={enviando}
                  className="shrink-0 text-xs font-semibold underline disabled:opacity-50"
                >
                  {enviando ? "Enviando…" : "Reintentar"}
                </button>
              </div>
            ) : null}
    
            {rechazados > 0 ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-danger-bg px-3.5 py-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="min-w-0 flex-1">
                  {rechazados === 1
                    ? "1 registro rechazado por el servidor. Avisa a la oficina."
                    : `${rechazados} registros rechazados por el servidor. Avisa a la oficina.`}
                </p>
              </div>
            ) : null}
          </div>
        </Seccion>
  );
}
