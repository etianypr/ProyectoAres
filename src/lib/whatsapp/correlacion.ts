// Código que une un aviso de WhatsApp con su respuesta (encomienda_whatsapp_correlaciones).

/** Identificador opaco para correlacionar una respuesta de WhatsApp.
 *
 *  Aleatorio y NO un UUIDv7: el v7 lleva la hora en los primeros bytes, y este
 *  identificador sale del sistema (viaja a Meta dentro del payload del botón).
 *  No hay motivo para contarle a nadie cuándo se creó. Base64url para que quepa
 *  cómodo en los 128 caracteres de payload que permite Meta: 22 caracteres.
 *
 *  Tampoco se deriva de ningún dato del receptor. Un hash del teléfono se
 *  rompería por fuerza bruta en minutos —los celulares chilenos son nueve
 *  dígitos— y convertiría la tabla de correlaciones en un registro de
 *  destinatarios pseudonimizado. Esto no es nada: son 128 bits al azar. */
export function nuevoCorrelationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
