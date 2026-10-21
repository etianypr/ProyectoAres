// Contrato HTTP entre el teléfono del conductor y /api/whatsapp/*. Lo importan
// las dos puntas: si una forma cambia, el compilador avisa en ambas.
//
// Solo tipos y constantes: ni "use client" ni "server-only".

import type { AccionWhatsApp } from "./catalogos";

export const RUTA_ENVIO = "/api/whatsapp/send";
export const RUTA_RESPUESTAS = "/api/whatsapp/status";

/** Tope de respuestas por consulta y por confirmación. Un día son ~60
 *  pedidos: el tope evita que un día viejo sin cerrar arme una respuesta
 *  enorme sobre una conexión mala. */
export const MAX_RESPUESTAS_POR_CONSULTA = 100;

// --- POST RUTA_ENVIO ---------------------------------------------------------

/** "aviso": la plantilla con tres botones. "horarios": la lista de bloques, solo
 *  después de que el receptor tocó "Indicar un horario". Nombre y teléfono se
 *  usan para el mensaje y el servidor no los guarda. */
export type PedidoEnvio =
  | { tipo: "aviso"; pedidoId: string; fecha: string; nombre: string; telefono: string; cuando?: string }
  | { tipo: "horarios"; pedidoId: string; fecha: string; telefono: string };

export type EnvioOk = {
  ok: true;
  correlationId: string;
  mensajeId: string | null;
  /** El aviso ya estaba mandado: no salió otro. */
  yaEstaba?: true;
};

// --- GET RUTA_RESPUESTAS -----------------------------------------------------

/** Una respuesta del receptor, ya validada en el teléfono. No trae nombre,
 *  teléfono ni texto libre: el servidor no los guarda. */
export type RespuestaPendiente = {
  /** El id local del pedido, el que generó el teléfono. */
  pedidoId: string;
  /** wamid de la respuesta: clave de idempotencia en las dos puntas. */
  mensajeId: string;
  accion: AccionWhatsApp;
  /** Solo cuando eligió un bloque de la lista. */
  bloqueHorarioId: string | null;
  /** ISO. Cuándo la recibió Meta. */
  recibidoEn: string;
};

/** Lo que manda el servidor: columnas tal cual, por eso pueden venir nulas. El
 *  teléfono no confía y pasa cada una por validarRespuesta(). */
export type BuzonRespuestas = {
  respuestas: { [K in keyof RespuestaPendiente]: RespuestaPendiente[K] | null }[];
};

// --- POST RUTA_RESPUESTAS ----------------------------------------------------

/** "Ya las escribí en IndexedDB": ids de mensaje que el servidor puede borrar. */
export type ConfirmarAplicadas = { aplicadas: string[] };
export type ConfirmacionOk = { confirmadas: number };

// --- Errores -----------------------------------------------------------------

/** Cuerpo de cualquier respuesta no-2xx. Sin `reintentable`, el teléfono
 *  reintenta solo los 5xx. */
export type ErrorApi = { error: string; reintentable?: boolean; codigo?: number | null };
