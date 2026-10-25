// Indicadores del negocio (spec 006): cómo se trabajó en un período, comparado
// con el anterior. Puro: recibe filas de la base y no consulta nada.
//
// Solo usa lo que ya está en el servidor —actividad, días de trabajo y pagos
// congelados— más dos conteos diarios sin datos personales (asignados y
// contactados) que manda el teléfono al cerrar el día.

import { sumarDias } from "@/lib/comun/fechas";
import type { Periodo } from "@/lib/comun/periodo";

export type FilaActividad = {
  conductor_id: string | null;
  fecha: string;
  tipo: string;
  origen: string;
  hora: string;
};
export type FilaDia = {
  conductor_id: string | null;
  fecha: string;
  inicio: string | null;
  cerrada_en: string | null;
  asignados: number | null;
  contactados: number | null;
};
export type FilaPago = { conductor_id: string | null; fecha: string; ingresos_totales: number; pago_total: number };

export type DatosPeriodo = { actividad: FilaActividad[]; dias: FilaDia[]; pagos: FilaPago[] };

export type Indicadores = {
  /** (conductor, día) con al menos un evento. */
  diasTrabajados: number;
  entregas: number;
  noEntregas: number;
  /** Visitas cerradas: entregas + no entregas. */
  intentos: number;
  tasaEntrega: number | null;
  /** Desde que salió la ruta hasta el último evento del teléfono, en minutos.
   *  Solo días cerrados con hora de salida (no los cargados a mano). */
  duracionMediaMin: number | null;
  entregasPorHora: number | null;
  /** Días todavía abiertos: quedan fuera de duración y entregas por hora. */
  diasAbiertos: number;
  /** Lo que traía la guía. null si ningún día del período lo informó. */
  asignados: number | null;
  /** Entregas de los días que informaron asignados (para la tasa). */
  entregasConAsignados: number;
  tasaSobreAsignados: number | null;
  contactados: number | null;
  tasaContactados: number | null;
  /** Primer día con asignados: antes de él no hay datos (spec 006 US2). */
  desdeAsignados: string | null;
  ingreso: number;
  pago: number;
  margen: number;
};

const clave = (conductor: string | null, fecha: string) => `${conductor ?? ""}|${fecha}`;
const razon = (a: number, b: number) => (b > 0 ? a / b : null);

export function calcularIndicadores({ actividad, dias, pagos }: DatosPeriodo): Indicadores {
  const porDia = new Map<string, FilaActividad[]>();
  for (const e of actividad) {
    const k = clave(e.conductor_id, e.fecha);
    porDia.set(k, [...(porDia.get(k) ?? []), e]);
  }
  const entregas = actividad.filter((e) => e.tipo === "entrega").length;
  const noEntregas = actividad.filter((e) => e.tipo === "omision").length;

  // Duración: solo días cerrados, con salida registrada y eventos del teléfono.
  let minutos = 0;
  let entregasMedidas = 0;
  let diasMedidos = 0;
  let diasAbiertos = 0;
  for (const d of dias) {
    const eventos = porDia.get(clave(d.conductor_id, d.fecha)) ?? [];
    if (eventos.length === 0) continue;
    if (d.cerrada_en == null) {
      diasAbiertos++;
      continue;
    }
    const delTelefono = eventos.filter((e) => e.origen === "app");
    if (!d.inicio || delTelefono.length === 0) continue;
    const ultimo = Math.max(...delTelefono.map((e) => Date.parse(e.hora)));
    const duracion = (ultimo - Date.parse(d.inicio)) / 60000;
    if (!(duracion > 0)) continue;
    minutos += duracion;
    entregasMedidas += eventos.filter((e) => e.tipo === "entrega").length;
    diasMedidos++;
  }

  // Asignados y contactados: solo los días que los informaron.
  const conAsignados = dias.filter((d) => d.asignados != null);
  const asignados = conAsignados.length ? conAsignados.reduce((s, d) => s + (d.asignados ?? 0), 0) : null;
  const entregasConAsignados = conAsignados.reduce(
    (s, d) => s + (porDia.get(clave(d.conductor_id, d.fecha)) ?? []).filter((e) => e.tipo === "entrega").length,
    0,
  );
  const conContactados = conAsignados.filter((d) => d.contactados != null);
  const contactados = conContactados.length ? conContactados.reduce((s, d) => s + (d.contactados ?? 0), 0) : null;
  const asignadosDeContactados = conContactados.reduce((s, d) => s + (d.asignados ?? 0), 0);

  const ingreso = pagos.reduce((s, p) => s + p.ingresos_totales, 0);
  const pago = pagos.reduce((s, p) => s + p.pago_total, 0);

  return {
    diasTrabajados: porDia.size,
    entregas,
    noEntregas,
    intentos: entregas + noEntregas,
    tasaEntrega: razon(entregas, entregas + noEntregas),
    duracionMediaMin: diasMedidos ? minutos / diasMedidos : null,
    entregasPorHora: minutos > 0 ? entregasMedidas / (minutos / 60) : null,
    diasAbiertos,
    asignados,
    entregasConAsignados,
    tasaSobreAsignados: asignados != null ? razon(entregasConAsignados, asignados) : null,
    contactados,
    tasaContactados: contactados != null ? razon(contactados, asignadosDeContactados) : null,
    desdeAsignados: conAsignados.length ? conAsignados.map((d) => d.fecha).sort()[0] : null,
    ingreso,
    pago,
    margen: ingreso - pago,
  };
}

/** El período anterior del mismo largo: el mes anterior, o el año anterior. */
export function periodoAnterior(p: Periodo): Periodo {
  if (p.mes === null) return { anio: p.anio - 1, mes: null };
  return p.mes === 1 ? { anio: p.anio - 1, mes: 12 } : { anio: p.anio, mes: p.mes - 1 };
}

/** Un rango arbitrario corrido hacia atrás en su propio largo. */
export function rangoAnterior({ desde, hasta }: { desde: string; hasta: string }): { desde: string; hasta: string } {
  const largo = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
  return { desde: sumarDias(desde, -largo), hasta: sumarDias(desde, -1) };
}

/** Diferencia actual − anterior de una cifra; null si falta alguna de las dos. */
export function diferencia(actual: number | null, anterior: number | null): number | null {
  return actual == null || anterior == null ? null : actual - anterior;
}
