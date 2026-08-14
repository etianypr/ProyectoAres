import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";

// Un error de lectura NO es "no hay datos", y en las pantallas de plata la
// diferencia es todo.
//
// Esto existe por un caso real: a encomienda_actividad le faltaba la columna
// "origen" en la base, la consulta de /encomiendas fallaba, la página
// desestructuraba solo { data } —descartando { error }— y mostraba
// "No hay actividad registrada en este periodo" con los cuatro KPI en $0. O
// sea: exactamente lo mismo que un mes en que el conductor no salió nunca.
// Había 16 entregas registradas y nadie podía verlas.
//
// La regla, entonces: si la lectura falló, se dice que falló. Un cero inventado
// en una liquidación es peor que un error a la vista.
export function ErrorDatos({
  titulo,
  detalle,
}: {
  titulo: string;
  /** El mensaje técnico de Postgres/PostgREST. Va a la vista a propósito: sin
   *  él, "algo salió mal" obliga a abrir la consola del servidor para saber si
   *  es una columna que falta, un permiso o la red. */
  detalle?: string | null;
}) {
  return (
    <Card className="border border-danger/20 bg-danger-bg">
      <div className="flex items-start gap-3 px-6 py-5">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="font-semibold text-danger">{titulo}</p>
          <p className="mt-1 text-sm text-danger/90">
            Esto <strong>no</strong> significa que no haya datos, sino que no se pudieron leer.
            No confirmes liquidaciones hasta que se resuelva.
          </p>
          {detalle ? (
            <p className="mt-2 break-words rounded-lg bg-white/60 px-3 py-2 font-mono text-xs text-danger">
              {detalle}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
