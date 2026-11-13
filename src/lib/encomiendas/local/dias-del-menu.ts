// Qué dice cada día en Menú → «Tus días» (spec 033, dia-sin-cerrar). Pura.
//
// «Quedó sin cerrar» era una alarma sin acción: un día anterior con datos dispara
// el cierre obligatorio al abrir la app, y uno que ya no tiene datos en el teléfono
// no se puede cerrar ni hace falta (el jefe cuenta por la actividad que sube la
// cola, no por ese cierre). Ahora la alarma sale solo si el día todavía tiene
// pedidos o ruta en el teléfono; lo que sí importa de un día pasado es si quedaron
// registros sin enviar, y eso se puede reintentar. Nada reabre un día (sin arrastre).

import type { ActividadPorEnviar, ResumenDia } from "./almacen/tipos";

export type LineaDia = {
  /** Debajo de la fecha: «Hoy», «Quedó sin cerrar» o las paradas. */
  texto: string;
  /** El texto se pinta como aviso (no solo por el color: el texto lo dice). */
  alarma: boolean;
  /** Registros de ese día que siguen en la cola. */
  sinEnviar: number;
};

/** Cuántos registros de la cola quedan por fecha. */
export function sinEnviarPorFecha(cola: Pick<ActividadPorEnviar, "fecha">[]): Map<string, number> {
  const porFecha = new Map<string, number>();
  for (const e of cola) porFecha.set(e.fecha, (porFecha.get(e.fecha) ?? 0) + 1);
  return porFecha;
}

export function lineaDelDia(
  dia: Pick<ResumenDia, "fecha" | "cierre" | "paradas">,
  { fechaActiva, conDatos, sinEnviar }: { fechaActiva: string; conDatos: ReadonlySet<string>; sinEnviar: ReadonlyMap<string, number> },
): LineaDia {
  const pendientes = sinEnviar.get(dia.fecha) ?? 0;
  if (dia.fecha === fechaActiva) return { texto: "Hoy", alarma: false, sinEnviar: pendientes };
  if (dia.cierre == null && conDatos.has(dia.fecha)) {
    return { texto: "Quedó sin cerrar", alarma: true, sinEnviar: pendientes };
  }
  return {
    texto: `${dia.paradas} ${dia.paradas === 1 ? "parada" : "paradas"}`,
    alarma: false,
    sinEnviar: pendientes,
  };
}
