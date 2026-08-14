"use client";

// El gráfico de entregas por día, con dos formas de mirarlo.
//
// MES: todas las barras del azul de siempre. Es la pregunta "cómo viene el mes"
// y los cortes de facturación no tienen nada que decir ahí.
//
// PERIODOS: los días que caen en un corte se pintan del violeta de periodo —el
// MISMO para todos— y donde termina uno y empieza el siguiente baja una línea
// del mismo violeta pero más oscuro. Un color por corte se leía como categorías
// distintas; el corte es lo único que hay que ver, y la línea es lo que lo dice.
// Las barras que no caen en ningún periodo se van a gris. El gris es el punto:
// un día trabajado que quedó afuera de todo periodo no se está facturando en
// ninguna parte, y sobre el azul de antes eso no se veía — parecía un día
// normal.
//
// El toggle vive en el cliente y el resto de la pantalla no depende de él: la
// serie y las cifras las calcula el servidor una sola vez y acá solo se decide
// cómo pintarlas.

import { useState } from "react";
import { Package } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Vacio } from "@/components/ui/vacio";
import { cn } from "@/lib/utils";
import { formatCLP, formatNumber } from "@/lib/format";
import {
  COLOR_CORTE_PERIODO,
  COLOR_PERIODO,
  nombrePeriodo,
  nombrePeriodoCorto,
  type PeriodoFacturacion,
  type ResumenPeriodo,
} from "@/lib/encomiendas/periodos";
import { PeriodosFacturacion } from "./periodos-facturacion";

export type ColumnaSerie = {
  clave: string;
  etiqueta: string;
  /** El corte al que pertenece la columna, o -1 si no cae en ninguno. */
  periodoIdx: number;
  pedidos: number;
};

type Modo = "mes" | "periodos";

// El gris de un día que se trabajó y quedó fuera de todo corte. Es más oscuro
// que el hilo de los días sin salir (bg-border/40) porque son dos cosas
// distintas: acá hubo reparto, lo que falta es el periodo.
const GRIS_SIN_PERIODO = "#c2c2c8";

export function GraficoDias({
  etiqueta,
  serie,
  totalEntregados,
  resumen,
  periodos,
  sugerenciaInicio,
  errorPeriodos,
}: {
  /** El periodo global en pantalla: "agosto 2026" o "Año 2026". */
  etiqueta: string;
  serie: ColumnaSerie[];
  totalEntregados: number;
  /** Los cortes que tocan el mes en pantalla, con lo que facturó cada uno. */
  resumen: ResumenPeriodo[];
  /** Todos los de la empresa, para el diálogo que los edita. */
  periodos: PeriodoFacturacion[];
  sugerenciaInicio: string;
  errorPeriodos: string | null;
}) {
  // Siempre arranca en "Mes", haya periodos o no. La primera pregunta al abrir
  // el panel es cómo viene el mes; mirar los cortes es un segundo paso, y que
  // la vista de arranque cambiara sola según hubiera o no un corte tocando el
  // mes hacía que la misma pantalla apareciera distinta según el mes elegido.
  const [modo, setModo] = useState<Modo>("mes");
  const maxSerie = Math.max(1, ...serie.map((s) => s.pedidos));
  const porPeriodos = modo === "periodos";
  // Sin ningún corte definido, la vista de periodos pintaría el mes entero de
  // gris y no diría nada. Se ofrece igual pero apagada, para que se entienda
  // que existe y qué falta para usarla.
  const hayPeriodos = periodos.length > 0;

  // Días trabajados que quedaron fuera de todo corte. Es el aviso que justifica
  // el gris: si son cero, el mes está entero dentro de sus periodos.
  const columnasSinPeriodo = serie.filter((s) => s.pedidos > 0 && s.periodoIdx < 0);
  const entregasSinPeriodo = columnasSinPeriodo.reduce((a, s) => a + s.pedidos, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedidos entregados por día</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* El toggle va donde estaba el rótulo del mes: es el mismo lugar
              donde uno mira para saber "qué estoy viendo", y ahora eso incluye
              con qué criterio están pintados los días. */}
          <div
            className="inline-flex items-center gap-0.5 rounded-full border border-border bg-white p-1"
            role="group"
            aria-label="Cómo agrupar los días"
          >
            <Pastilla activo={!porPeriodos} onClick={() => setModo("mes")} titulo={etiqueta}>
              Mes
            </Pastilla>
            <Pastilla
              activo={porPeriodos}
              onClick={() => setModo("periodos")}
              disabled={!hayPeriodos}
              titulo={
                hayPeriodos
                  ? "Pinta cada día con el color de su periodo de facturación"
                  : "Todavía no hay ningún periodo definido"
              }
            >
              Periodos
            </Pastilla>
          </div>
          <PeriodosFacturacion periodos={periodos} sugerenciaInicio={sugerenciaInicio} />
        </div>
      </CardHeader>

      <CardBody>
        {/* Que falle esta consulta no vuelve falso ningún número del panel, solo
            deja los días sin agrupar. Pero el botón de al lado diría "no hay
            ninguno definido" sobre datos que no se pudieron leer, y alguien
            podría cargar de nuevo un corte que ya existía. */}
        {errorPeriodos ? (
          <p className="mb-3 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn">
            No se pudieron leer los periodos de facturación: {errorPeriodos}
          </p>
        ) : null}

        {totalEntregados === 0 ? (
          <Vacio
            titulo={`Todavía no hay entregas registradas en ${etiqueta.toLowerCase()}.`}
            icono={<Package className="h-7 w-7" />}
          />
        ) : (
          <div className="flex items-end gap-1 sm:gap-1.5">
            {serie.map((s, i) => {
              const enPeriodo = s.periodoIdx >= 0;
              // El color de la barra sale del modo: en vista de mes ninguna
              // barra se tiñe, y en vista de periodos el gris es una respuesta
              // ("este día no está en ningún corte"), no la ausencia de una.
              const color = !porPeriodos ? null : enPeriodo ? COLOR_PERIODO : GRIS_SIN_PERIODO;
              // Acá cambia el corte. Con todos los periodos del mismo violeta,
              // esta línea es lo ÚNICO que los separa, así que también se dibuja
              // cuando el vecino es un día fuera de todo periodo: ahí empieza
              // (o termina) un corte igual. En la primera columna no va: no
              // separa nada, solo ensucia el borde del gráfico.
              const cortaAcá =
                porPeriodos &&
                i > 0 &&
                s.periodoIdx !== serie[i - 1].periodoIdx &&
                (enPeriodo || serie[i - 1].periodoIdx >= 0);
              return (
                <div key={s.clave} className="flex flex-1 flex-col items-center gap-1.5">
                  {/* Envuelve barra y franja para que la línea de corte pueda
                      cruzarlas de arriba abajo sin llegar al número del día. */}
                  <div className="relative flex w-full flex-col items-center gap-1.5">
                    {cortaAcá ? (
                      // Centrada en el hueco entre las dos columnas: el corte
                      // cae ENTRE dos días, no sobre uno.
                      <span
                        className="absolute inset-y-0 -left-[3px] w-[2px] rounded-full sm:-left-1"
                        style={{ background: COLOR_CORTE_PERIODO }}
                        aria-hidden
                      />
                    ) : null}
                    <div className="flex h-32 w-full items-end justify-center">
                      <div
                        title={tituloColumna(s, porPeriodos, resumen)}
                        className={cn(
                          "w-full rounded-t-[3px] transition-colors duration-200",
                          s.pedidos === 0 ? "bg-border/40" : color ? "" : "bg-brand",
                        )}
                        // Un día con entregas nunca puede verse como uno sin
                        // salir: con un pico de 60, un día de 1 entrega daba
                        // 2% — exactamente el mismo hilo que se pinta para el
                        // domingo. El piso de los días con actividad es 10%.
                        style={{
                          height:
                            s.pedidos > 0
                              ? `${Math.max(10, Math.round((s.pedidos / maxSerie) * 100))}%`
                              : "2%",
                          ...(color && s.pedidos > 0 ? { background: color } : null),
                        }}
                      />
                    </div>
                    {/* La franja bajo el eje marca el corte incluso donde no
                        hubo reparto: un periodo se define por sus fechas, no por
                        los días que se trabajó dentro de él. */}
                    <span
                      className="h-[3px] w-full rounded-full transition-colors duration-200"
                      style={{ background: porPeriodos && enPeriodo ? COLOR_PERIODO : "transparent" }}
                      aria-hidden
                    />
                  </div>
                  <span className="text-[9px] leading-none text-muted sm:text-[10px]">
                    {s.etiqueta}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {porPeriodos ? (
          <>
            {/* Cuánto facturó cada corte. Las cifras son de TODOS los días del
                periodo, incluidos los que caen fuera del mes que se está
                mirando. Van en el mismo orden que el gráfico —de izquierda a
                derecha, como corren las fechas— porque ya no hay un color por
                periodo que permita emparejarlos de otra forma; el nombre de
                cada uno son sus fechas, y con eso alcanza. */}
            {resumen.length > 0 ? (
              <div className="mt-4 grid gap-2 border-t border-divider pt-3 sm:grid-cols-2">
                {resumen.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 rounded-xl bg-background px-3 py-2"
                    title={nombrePeriodo(p)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: COLOR_PERIODO }}
                        aria-hidden
                      />
                      <span className="truncate text-xs font-medium">{nombrePeriodoCorto(p)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {/* Con lo real cargado manda lo real: el estimado pasa a
                          ser la referencia contra la que se lo lee. */}
                      <span className="block text-sm font-semibold tabular-nums text-ok">
                        {formatCLP(p.real ?? p.ingresos)}
                      </span>
                      <span className="block text-[11px] tabular-nums text-muted">
                        {p.real != null
                          ? `real · estimado ${formatCLP(p.ingresos)}`
                          : `estimado · ${formatNumber(p.entregados)} entregas`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Un día trabajado fuera de todo corte no se factura en ninguna
                parte. Es exactamente lo que el gris muestra, dicho con número
                para que no haya que contar barras. */}
            {columnasSinPeriodo.length > 0 ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: GRIS_SIN_PERIODO }}
                  aria-hidden
                />
                {formatNumber(columnasSinPeriodo.length)}{" "}
                {columnasSinPeriodo.length === 1 ? "día" : "días"} con reparto fuera de todo periodo
                ({formatNumber(entregasSinPeriodo)} entregas). No entran en ninguna facturación.
              </p>
            ) : null}
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Pastilla({
  activo,
  disabled,
  titulo,
  onClick,
  children,
}: {
  activo: boolean;
  disabled?: boolean;
  titulo?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-pressed={activo}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-95",
        disabled
          ? "cursor-not-allowed text-muted/50"
          : activo
            ? "cursor-pointer bg-brand-soft text-brand"
            : "cursor-pointer text-muted hover:bg-background hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** El tooltip de una columna. En vista de periodos dice a qué corte pertenece,
 *  que es la pregunta que uno se hace justo cuando ve el color. */
function tituloColumna(s: ColumnaSerie, porPeriodos: boolean, resumen: ResumenPeriodo[]): string {
  const base = `${s.etiqueta}: ${formatNumber(s.pedidos)} entrega(s)`;
  if (!porPeriodos) return base;
  if (s.periodoIdx < 0) return `${base} · fuera de todo periodo`;
  // El resumen viene ordenado igual que la paleta, así que el corte se
  // reconoce por su color; si no está en el resumen (no toca el mes visible)
  // igual se dice lo que se sabe.
  const p = resumen.find((r) => s.clave >= r.fecha_inicio && s.clave <= r.fecha_fin);
  return p ? `${base} · ${nombrePeriodoCorto(p)}` : base;
}
