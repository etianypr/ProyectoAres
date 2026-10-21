// Estados de un pedido en el teléfono y todas las reglas que los traducen.
//
// Dimensiones separadas a propósito (constitución, principio II):
//   · Pedido.resultado — qué pasó en la puerta; "pendiente" = sigue en juego
//   · Pedido.llamada — si se lo llamó y contestó
//   · Disponibilidad      — qué contestó el receptor por WhatsApp (catalogos.ts)
// Lo que vive solo acá es cómo se traducen y se consultan. Nadie más repite
// estas condiciones.

import type { AccionWhatsApp, Disponibilidad } from "./catalogos";

export type ResultadoLlamada = "pendiente" | "contesto" | "no_contesto";

/** Se entregó o no, sin motivo (spec 012): lo no entregado se tacha por hoy y,
 *  si vuelve a salir, se escanea de nuevo. Los valores de antes (No morador,
 *  rechazo, sin respuesta, omitido) los convierte migrar.ts. */
export type ResultadoVisita = "pendiente" | "entregado" | "no_entregado";

/** Lo que el conductor puede marcar. */
export type ResultadoMarcable = Exclude<ResultadoVisita, "pendiente">;

/** Respuesta del receptor ya traducida al dominio. */
export type RespuestaDisponibilidad =
  | { tipo: "confirmado" }
  | { tipo: "horario_indicado"; bloqueHorarioId: string }
  | { tipo: "manana" };

/** Evento de actividad que genera cerrar una visita. */
export function tipoEventoDe(
  resultado: Exclude<ResultadoVisita, "pendiente">,
): "entrega" | "omision" {
  return resultado === "entregado" ? "entrega" : "omision";
}

/** Cualquier resultado distinto de "pendiente" cierra el pedido del día. */
export function resultadoCerrado(resultado: ResultadoVisita): boolean {
  return resultado !== "pendiente";
}

/** El receptor ya dijo que va a estar (con o sin horario). */
export function estaConfirmado(disponibilidad: Disponibilidad): boolean {
  return disponibilidad === "confirmado" || disponibilidad === "horario_indicado";
}

/** Traduce un botón del receptor. null = no cambia nada: "HORARIO" sin bloque
 *  elegido sigue pendiente y abre la ventana para mandarle la lista. */
export function respuestaDeAccion(
  accion: AccionWhatsApp,
  bloqueHorarioId: string | null,
): RespuestaDisponibilidad | null {
  switch (accion) {
    case "CONFIRMAR":
      return { tipo: "confirmado" };
    case "MANANA":
      return { tipo: "manana" };
    case "HORARIO":
      return bloqueHorarioId ? { tipo: "horario_indicado", bloqueHorarioId } : null;
  }
}
