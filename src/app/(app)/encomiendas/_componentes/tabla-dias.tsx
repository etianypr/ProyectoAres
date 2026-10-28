// "Detalle por día" del panel de encomiendas: una fila por día y conductor, con
// sus cifras congeladas, el origen de los datos y el acceso a corregirlo (sale de
// page.tsx, spec 002 T039).

import Link from "next/link";
import { CalendarRange, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Vacio } from "@/components/ui/vacio";
import { formatCLP, formatDate, formatNumber, formatTime } from "@/lib/comun/format";
import { hoyChile } from "@/lib/comun/fechas";
import { tarifaDelDia } from "@/lib/encomiendas/pago";
import type { ReglaDePago as Regla } from "@/types/db";
import { AgregarDia, type ConductorOpcion } from "../agregar-dia";
import { enCurso, type Dia } from "../_resumen";

export function TablaDias({
  dias,
  conductores,
  errorConductores,
  regla,
}: {
  dias: Dia[];
  conductores: ConductorOpcion[];
  errorConductores: string | null;
  regla: Regla | null;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Detalle por día</CardTitle>
        <div className="flex flex-wrap items-start justify-end gap-2">
          {/* Va acá y no en la cabecera de la página porque es esta tabla
              la que va a cambiar: se carga un día y aparece una fila. */}
          <AgregarDia
            conductores={conductores}
            // Sin esto, una consulta fallida deja la lista vacía y el botón
            // se desactiva diciendo "ningún conductor tiene la categoría",
            // que es una afirmación sobre datos que no se pudieron leer.
            errorConductores={errorConductores}
            regla={regla}
            hoy={hoyChile()}
            diasConocidos={dias.map((d) => ({
              fecha: d.fecha,
              conductorId: d.conductorId,
              entregados: d.conteo.entregados,
              omitidos: d.conteo.omitidos,
              manuales: d.manuales,
              total: d.total,
              tarifa: tarifaDelDia(d.cifras),
            }))}
          />
          {/* Acá estaba "Confirmar pagos del periodo". No queda nada que
              confirmar: las cifras de cada día las escribe la base cuando
              el día se registra (0031), así que la columna "A pagar" ya es
              la definitiva desde el primer momento. */}
        </div>
      </CardHeader>
      {dias.length === 0 ? (
        <CardBody>
          <Vacio
            titulo="No hay actividad registrada en este periodo."
            icono={<CalendarRange className="h-7 w-7" />}
            accion={
              <Link href="/encomiendas/dia" className={buttonClass({ size: "sm" })}>
                Ver actividad por día
              </Link>
            }
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Día</th>
                <th className="px-4 py-2.5 font-medium">Conductor</th>
                <th className="px-4 py-2.5 font-medium">Día de trabajo</th>
                <th className="px-4 py-2.5 text-right font-medium">Entregados</th>
                <th className="px-4 py-2.5 text-right font-medium">No entreg.</th>
                <th className="px-4 py-2.5 text-right font-medium">Ingresos</th>
                <th className="px-4 py-2.5 text-right font-medium">A pagar</th>
                <th className="px-4 py-2.5 text-right font-medium">Margen</th>
                <th className="px-4 py-2.5 font-medium">Origen</th>
                <th className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Editar</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dias.map((d) => {
                return (
                  <tr key={`${d.fecha}-${d.conductorId ?? "sin"}`} className="hover:bg-background">
                    {/* La fecha ya no es un enlace: era el único acceso a
                        la vista del día y no lo parecía —texto negro, sin
                        ícono— así que la mitad de la tabla se veía como
                        algo en lo que se puede hacer clic y no lo era.
                        Ahora hay un botón que lo dice, al final de la fila. */}
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {formatDate(d.fecha)}
                    </td>
                    <td className="px-4 py-3 text-muted">{d.conductorNombre}</td>
                    {/* De cuándo a cuándo salió la ruta. Reemplaza a la
                        lista de horas de cada entrega: con la ruta hecha de
                        corrido, ese par es todo lo que dice algo. */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {enCurso(d) ? (
                        <Badge tone="amber">En curso</Badge>
                      ) : d.diaTrabajo?.inicio && d.diaTrabajo.cerrada_en ? (
                        <span className="tabular-nums">
                          {formatTime(d.diaTrabajo.inicio)} – {formatTime(d.diaTrabajo.cerrada_en)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(d.conteo.entregados)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {d.conteo.omitidos > 0 ? formatNumber(d.conteo.omitidos) : "—"}
                    </td>
                    {/* Un guion y no un $0: que un día no tenga cifras no
                        significa que no valga nada, significa que no se
                        pudo calcular. Un cero ahí sería una afirmación. */}
                    <td className="px-4 py-3 text-right tabular-nums text-ok">
                      {d.cifras ? formatCLP(d.cifras.ingresos_totales) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-semibold tabular-nums"
                      title={
                        d.cifras
                          ? `Por pedidos ${formatCLP(d.cifras.pago_base)} · por día ${formatCLP(d.cifras.pago_dia)} · bono ${formatCLP(d.cifras.pago_bono)}`
                          : undefined
                      }
                    >
                      {d.cifras ? (
                        formatCLP(d.cifras.pago_total)
                      ) : enCurso(d) ? (
                        // No es un problema: la ruta todavía está pasando y
                        // se cuenta cuando termine.
                        <span className="font-normal text-muted">Al terminar</span>
                      ) : (
                        <Badge tone="red">
                          {d.conductorId ? "Sin regla" : "Sin conductor"}
                        </Badge>
                      )}
                    </td>
                    {/* Lo que deja el día: ingreso estimado menos lo que se
                        le paga al conductor (spec 006, US3). */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {d.cifras ? formatCLP(d.cifras.ingresos_totales - d.cifras.pago_total) : "—"}
                    </td>
                    {/* Lo único que queda por distinguir del día es de dónde
                        salieron sus números: un día del teléfono son
                        entregas con hora, uno de oficina son cifras que
                        alguien recordó. Paga igual, pero no prueba lo
                        mismo. */}
                    <td className="px-4 py-3">
                      {d.manuales === 0 ? (
                        <Badge tone="blue">Teléfono</Badge>
                      ) : d.manuales === d.total ? (
                        <Badge tone="violet">Oficina</Badge>
                      ) : (
                        <Badge tone="amber">Mixto</Badge>
                      )}
                    </td>
                    {/* Va a la misma vista a la que llevaba la fecha, que
                        es donde se corrige un día: recalcularlo con otra
                        tarifa o borrarle la carga manual. */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/encomiendas/dia?fecha=${d.fecha}`}
                        title={`Editar el ${formatDate(d.fecha)}`}
                        aria-label={`Editar el día ${formatDate(d.fecha)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-separator bg-white text-muted transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
