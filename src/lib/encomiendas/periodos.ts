// Periodos de facturación (0034): funciones puras para nombrarlos, pintarlos y
// saber en cuál cae un día. Las usan tanto el panel (servidor) como el diálogo
// que los edita (cliente), y por eso no tocan Supabase ni cookies.
//
// Ojo con el nombre: acá "periodo" es un CORTE DE FACTURACIÓN, de fecha a
// fecha. El periodo global de la app —el mes que fija el selector de la barra
// superior— es otra cosa y vive en lib/periodo.ts.

import type { EncomiendaPeriodoFacturacion } from "@/types/db";

/** Lo mínimo para ubicar y pintar un periodo. Los componentes de cliente
 *  reciben esto y no la fila entera: no necesitan el empresa_id ni las marcas
 *  de tiempo, y así el payload que cruza al navegador es el que se usa. */
export type PeriodoFacturacion = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
};

// TODOS los periodos van del mismo color. Antes eran siete tonos rotando por la
// lista, y un gráfico de siete colores se lee como siete categorías distintas
// —como si un corte fuera de otra naturaleza que el siguiente— cuando son la
// misma cosa repetida. Dónde termina uno y empieza el otro no lo dice el tinte:
// lo dice la línea de corte, del mismo color pero más oscuro. Es un dato menos
// que inventar y se ve más serio.
//
// El azul de marca no está a propósito: es el color de las barras en la vista de
// mes, y repetirlo haría que un día suelto pareciera parte de un corte.
export const COLOR_PERIODO = "#7b4bd8";

/** La línea que separa un periodo del siguiente: el mismo violeta bajado de
 *  luminosidad. Tiene que leerse como "acá corta", no como otro color. */
export const COLOR_CORTE_PERIODO = "#442977";

/** Un periodo con lo que facturó. Las cifras salen de TODOS los días que cubre,
 *  incluidos los que caen fuera del mes que se esté mirando: un corte del 25 de
 *  abril al 10 de mayo se factura entero, y sumarle solo los días de mayo diría
 *  poco menos de la mitad.
 *
 *  Es la forma en que el panel le pasa un periodo a las dos pantallas que lo
 *  muestran: el gráfico y el diálogo de comparar ingresos. Ya no trae el color
 *  —todos los periodos usan COLOR_PERIODO— y quien pinte lo toma de ahí. */
export type ResumenPeriodo = PeriodoFacturacion & {
  /** Días con reparto registrado dentro del periodo. */
  dias: number;
  entregados: number;
  /** Lo que el panel ESTIMA que entró (entregas × valor por entrega). */
  ingresos: number;
  /** Lo que hay que pagarle al conductor por esos días. */
  pago: number;
  /** Lo que se liquidó DE VERDAD. null = todavía no se cargó, que es distinto
   *  de cero (que sería "no entró nada"). */
  real: number | null;
  notaReal: string | null;
};

/** El nombre de un periodo, que son sus fechas y nada más.
 *
 *  El año se escribe una sola vez cuando las dos fechas caen en el mismo, que
 *  es el caso normal: "1 al 15 de mayo de 2026" se lee, "1 de mayo de 2026 al
 *  15 de mayo de 2026" hay que descifrarlo. */
export function nombrePeriodo(p: { fecha_inicio: string; fecha_fin: string }): string {
  const [ai, mi, di] = partes(p.fecha_inicio);
  const [af, mf, df] = partes(p.fecha_fin);

  if (ai === af && mi === mf) return `${di} al ${df} de ${MESES[mi - 1]} ${ai}`;
  if (ai === af) return `${di} de ${MESES[mi - 1]} al ${df} de ${MESES[mf - 1]} ${ai}`;
  return `${di} de ${MESES[mi - 1]} ${ai} al ${df} de ${MESES[mf - 1]} ${af}`;
}

/** Versión corta, para las etiquetas que van pegadas al gráfico: "1–15 may". */
export function nombrePeriodoCorto(p: { fecha_inicio: string; fecha_fin: string }): string {
  const [, mi, di] = partes(p.fecha_inicio);
  const [, mf, df] = partes(p.fecha_fin);
  return mi === mf
    ? `${di}–${df} ${MES_CORTO[mi - 1]}`
    : `${di} ${MES_CORTO[mi - 1]} – ${df} ${MES_CORTO[mf - 1]}`;
}

/** En qué periodo cae una fecha `YYYY-MM-DD`, o -1 si no cae en ninguno.
 *
 *  Devuelve el ÍNDICE y no el periodo porque el color se saca del índice: quien
 *  pregunta casi siempre quiere las dos cosas. Los dos extremos entran (el día
 *  `fecha_fin` es parte del periodo, igual que en la base).
 *
 *  Comparar strings `YYYY-MM-DD` es comparar fechas, y evita construir un Date
 *  por celda del gráfico — que además se corre de día según la zona horaria. */
export function indicePeriodoDe(fecha: string, periodos: PeriodoFacturacion[]): number {
  return periodos.findIndex((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin);
}

/** Los periodos que tocan el rango [desde, hasta], en orden. Es lo que se pinta
 *  y lo que se lista al pie del gráfico: un corte de marzo no tiene nada que
 *  hacer en la vista de mayo. */
export function periodosEnRango<T extends PeriodoFacturacion>(
  periodos: T[],
  desde: string,
  hasta: string,
): T[] {
  return periodos.filter((p) => p.fecha_inicio <= hasta && p.fecha_fin >= desde);
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** [año, mes, día] de un `YYYY-MM-DD`, sin pasar por Date: un `new Date(
 *  "2026-05-01")` se interpreta en UTC y en Chile muestra el 30 de abril. */
function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.split("-").map(Number);
  return [a, m, d];
}

/** Un periodo hecho de datos sueltos, para el `EncomiendaPeriodoFacturacion`
 *  que llega del servidor. */
export function aPeriodo(fila: EncomiendaPeriodoFacturacion): PeriodoFacturacion {
  return { id: fila.id, fecha_inicio: fila.fecha_inicio, fecha_fin: fila.fecha_fin };
}
