// Las cifras del panel de encomiendas: los días del periodo con sus cifras
// congeladas, la serie del gráfico, lo que facturó cada corte y el resumen por
// conductor (sale de page.tsx, spec 002 T039). Puro: no consulta nada.

import { MESES_CORTOS } from "@/lib/comun/fechas";
import type { Periodo as PeriodoGlobal } from "@/lib/comun/periodo";
import { agruparPorDia, type ConteoDia, type EventoActividad } from "@/lib/encomiendas/pago";
import { indicePeriodoDe, type Periodo, type ResumenPeriodo } from "@/lib/encomiendas/periodos";
import type { DiaTrabajo, IngresoReal, PagoDelDia } from "@/types/db";

export type Dia = {
  fecha: string;
  conductorId: string | null;
  conductorNombre: string;
  conteo: ConteoDia;
  /** Las cifras que la base congeló para este día (0031): ingreso estimado y
   *  desglose del pago. Esta pantalla NO las recalcula — lee lo que se escribió
   *  cuando el día se registró, que es lo que hace que cambiar la regla de pago
   *  no mueva ni un peso de lo que ya está.
   *
   *  null solo si el día no se pudo calcular: sin conductor (eliminado después)
   *  o sin regla configurada todavía. */
  cifras: PagoDelDia | null;
  /** El sobre del día (0032): a qué hora salió la ruta y si ya terminó. Una
   *  día abierto es una ruta EN CURSO y por eso todavía no tiene cifras —
   *  la plata se cuenta una sola vez, al cerrar. */
  diaTrabajo: DiaTrabajo | null;
  /** Eventos cargados a mano desde la oficina (0028) y total del día: con los
   *  dos se distingue un día íntegramente manual de uno que el teléfono mandó
   *  a medias y la oficina completó. */
  manuales: number;
  total: number;
};

/** Una ruta que todavía está pasando. No tiene cifras y no debe tenerlas. */
export function enCurso(d: Dia): boolean {
  return d.diaTrabajo != null && d.diaTrabajo.cerrada_en == null;
}

type EventoConConductor = EventoActividad & { conductor?: { nombre: string } | null };

/** Los días trabajados del periodo, cada uno con las cifras que la base congeló. */
export function armarDias(actividad: EventoConConductor[], pagos: PagoDelDia[], diasTrabajo: DiaTrabajo[]): Dia[] {
  // La actividad dice QUÉ pasó cada día; encomienda_pagos, cuánto valió. Se
  // cruzan por (conductor, fecha) en vez de recalcular: las cifras de la
  // segunda son las que se escribieron cuando el día se registró, y son las que
  // mandan aunque la regla haya cambiado diez veces desde entonces.
  return agruparPorDia(actividad).map((d) => ({
    fecha: d.fecha,
    conductorId: d.conductorId,
    conductorNombre: d.eventos[0]?.conductor?.nombre ?? "Conductor eliminado",
    conteo: d.conteo,
    cifras: pagos.find((p) => p.fecha === d.fecha && p.conductor_id === d.conductorId) ?? null,
    diaTrabajo: diasTrabajo.find((j) => j.fecha === d.fecha && j.conductor_id === d.conductorId) ?? null,
    manuales: d.manuales,
    total: d.eventos.length,
  }));
}

/** Pedidos entregados por día (vista de mes) o por mes (vista de año). */
export function serieDelPeriodo(periodo: PeriodoGlobal, dias: Dia[], periodos: Periodo[]) {
  // Serie del gráfico, atada al mismo periodo: en vista de MES un palo por
  // cada día del mes (los días sin actividad quedan como huecos, que es justo
  // lo que conviene ver); en vista de AÑO, uno por mes.
  //
  // `periodoIdx` es el corte de facturación al que pertenece esa columna, o -1
  // si no cae en ninguno: de ahí sale el color de la barra. En la vista de AÑO
  // una columna es un mes entero, así que solo se tiñe cuando el mes completo
  // cae dentro de un mismo corte — un mes partido entre dos periodos no tiene
  // un color, y pintarlo de uno de los dos sería mentir.
  return (
    periodo.mes === null
      ? Array.from({ length: 12 }, (_, i) => {
          const mm = String(i + 1).padStart(2, "0");
          const pref = `${periodo.anio}-${mm}`;
          const ultimo = new Date(periodo.anio, i + 1, 0).getDate();
          const idxPrimero = indicePeriodoDe(`${pref}-01`, periodos);
          const idxUltimo = indicePeriodoDe(`${pref}-${ultimo}`, periodos);
          return {
            clave: pref,
            etiqueta: MESES_CORTOS[i],
            periodoIdx: idxPrimero >= 0 && idxPrimero === idxUltimo ? idxPrimero : -1,
            pedidos: dias
              .filter((d) => d.fecha.startsWith(pref))
              .reduce((a, d) => a + d.conteo.entregados, 0),
          };
        })
      : Array.from({ length: new Date(periodo.anio, periodo.mes, 0).getDate() }, (_, i) => {
          const mm = String(periodo.mes).padStart(2, "0");
          const fecha = `${periodo.anio}-${mm}-${String(i + 1).padStart(2, "0")}`;
          return {
            clave: fecha,
            etiqueta: String(i + 1),
            periodoIdx: indicePeriodoDe(fecha, periodos),
            pedidos: dias
              .filter((d) => d.fecha === fecha)
              .reduce((a, d) => a + d.conteo.entregados, 0),
          };
        })
  );
}

/** Lo que facturó cada corte, con lo real cargado si lo hay. */
export function resumirPeriodos(
  periodos: Periodo[],
  pagosPeriodos: Pick<PagoDelDia, "fecha" | "ingresos_totales" | "pedidos_entregados" | "pago_total">[],
  ingresosReales: Pick<IngresoReal, "periodo_id" | "monto" | "nota">[],
): ResumenPeriodo[] {
  // Lo que facturó cada corte. Sale de encomienda_pagos y no de `dias` porque un
  // periodo puede desbordar el mes en pantalla por los dos lados: son las cifras
  // congeladas de TODOS sus días, que es justo el número por el que existe la
  // función. Se calcula para todos los periodos y no solo los visibles: el
  // diálogo de comparar ingresos los ofrece todos, con su estimado.
  return periodos.map((p) => {
    const suyos = pagosPeriodos.filter((x) => x.fecha >= p.fecha_inicio && x.fecha <= p.fecha_fin);
    const real = ingresosReales.find((r) => r.periodo_id === p.id) ?? null;
    return {
      ...p,
      dias: new Set(suyos.map((x) => x.fecha)).size,
      entregados: suyos.reduce((a, x) => a + x.pedidos_entregados, 0),
      ingresos: suyos.reduce((a, x) => a + x.ingresos_totales, 0),
      pago: suyos.reduce((a, x) => a + x.pago_total, 0),
      real: real?.monto ?? null,
      notaReal: real?.nota ?? null,
    };
  });
}

/** Por conductor: días trabajados, entregas, ingresos y lo que se le paga. */
export function resumenPorConductor(dias: Dia[]) {
  // Resumen por conductor: con un solo repartidor es una fila, pero el
  // esquema ya soporta varios y la liquidación se paga por persona.
  return [
    ...dias
      .reduce((mapa, d) => {
        const clave = d.conductorId ?? "sin";
        const acum = mapa.get(clave) ?? {
          nombre: d.conductorNombre,
          diasTrabajados: 0,
          entregados: 0,
          ingresos: 0,
          pago: 0,
        };
        // Todo día que llegó hasta acá tiene actividad registrada, así que
        // cuenta: no hay que preguntar si el conductor salió.
        acum.diasTrabajados += 1;
        acum.entregados += d.conteo.entregados;
        acum.ingresos += d.cifras?.ingresos_totales ?? 0;
        acum.pago += d.cifras?.pago_total ?? 0;
        mapa.set(clave, acum);
        return mapa;
      }, new Map<string, { nombre: string; diasTrabajados: number; entregados: number; ingresos: number; pago: number }>())
      .values(),
  ].sort((a, b) => b.pago - a.pago);
}
