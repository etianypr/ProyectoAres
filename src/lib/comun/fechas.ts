// Fechas del negocio: días "YYYY-MM-DD" en hora de Chile y nombres de meses.
// Una sola definición para el panel, el teléfono y el servidor (spec 002, FR-004).

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

export const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** true si el texto tiene la forma "YYYY-MM-DD" (no valida el calendario). */
export function esFecha(texto: string): boolean {
  return FECHA.test(texto);
}

/** Suma (o resta, con negativo) días a una fecha "YYYY-MM-DD". Cuenta en UTC: no
 *  depende de la zona horaria del aparato ni de cambios de horario. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Fecha de HOY (YYYY-MM-DD) en la zona horaria del negocio (Chile).
// En el servidor (Vercel corre en UTC) usar toISOString() daría la fecha de
// MAÑANA pasadas las ~20:00 de Chile, corriendo pagos/viajes al mes siguiente.
// Toda fecha "hoy" que se persista debe salir de aquí.
export function hoyChile(): string {
  return fechaChile(new Date());
}

/** Día (YYYY-MM-DD) de un instante, en hora de Chile. */
export function fechaChile(instante: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof instante === "string" ? new Date(instante) : instante);
}
