"use client";

// "Tu día": por qué el día no se cerró y lo que falta enviar (sale de
// pantalla.tsx, spec 002 T037). Cómo terminó ayer pasó a AyerHoja, con el día
// vacío (spec 027). Sin nada que decir no se dibuja: un título solo, sin nada
// debajo, hacía buscar qué faltaba.

import { AlertTriangle, CloudOff } from "lucide-react";
import { Seccion } from "./seccion";

export function TuDia({
  motivoNoCerrar,
  sinEnviar,
  errorEnvio,
  enviando,
  onReintentar,
  rechazados,
  correccionesRechazadas = 0,
}: {
  /** FR-020: por qué el día no se cierra, solo con todas las paradas marcadas. */
  motivoNoCerrar: string | null;
  sinEnviar: number;
  errorEnvio: string | null;
  enviando: boolean;
  onReintentar: () => void;
  rechazados: number;
  /** Correcciones que el servidor no aceptó: pasó el plazo de 12 h (spec 033, G5). */
  correccionesRechazadas?: number;
}) {
  if (!motivoNoCerrar && sinEnviar === 0 && rechazados === 0 && correccionesRechazadas === 0) return null;
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

            {/* La corrección no llegó: la entrega sigue contada como estaba. */}
            {correccionesRechazadas > 0 ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-danger-bg px-3.5 py-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="min-w-0 flex-1">
                  {correccionesRechazadas === 1
                    ? "No se pudo corregir: pasó el plazo. Avisa a la oficina."
                    : `${correccionesRechazadas} correcciones no se pudieron hacer: pasó el plazo. Avisa a la oficina.`}
                </p>
              </div>
            ) : null}
          </div>
        </Seccion>
  );
}
