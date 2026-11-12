// La plantilla que pide confirmar la dirección (spec 004). Va aparte para que
// meta.ts no pase las 400 líneas, y usa su mismo transporte (timeout y reintentos).

import "server-only";
import { configMeta, mandar, SIN_CONFIGURAR, type ResultadoEnvioMeta } from "./meta";

export type AvisoDireccion = {
  /** En E.164, ya normalizado (ver lib/comun/telefono.ts). */
  telefono: string;
  nombre: string;
  /** La dirección de la guía, tal como se le va a mostrar al receptor. Sale a
   *  Meta a propósito (excepción aceptada por el dueño, 2026-11-09:
   *  docs/PRIVACIDAD.md); las coordenadas no salen. */
  direccion: string;
  /** Viaja como `flow_token` y vuelve con la respuesta del formulario. */
  correlationId: string;
};

/** Manda la plantilla que pregunta si la dirección está bien. Tiene un solo
 *  botón, que abre el formulario de WhatsApp (docs/WHATSAPP.md): la respuesta
 *  llega entera, con lo que escribió, en un solo mensaje. */
export function enviarConfirmarDireccion(
  aviso: AvisoDireccion,
  esperar?: (ms: number) => Promise<void>,
): Promise<ResultadoEnvioMeta> {
  const config = configMeta();
  if (!config) return Promise.resolve(SIN_CONFIGURAR);

  return mandar(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: aviso.telefono,
      type: "template",
      template: {
        name: config.plantillaDireccion,
        language: { code: config.idioma },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: aviso.nombre },
              { type: "text", text: aviso.direccion },
            ],
          },
          {
            type: "button",
            sub_type: "flow",
            index: "0",
            parameters: [{ type: "action", action: { flow_token: aviso.correlationId } }],
          },
        ],
      },
    },
    esperar,
  );
}
