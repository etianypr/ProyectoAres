// UUIDv7 generado en el navegador. Se necesita del lado del cliente porque la
// app del chofer decide los identificadores ANTES de que existan en la base:
// los eventos de actividad se registran sin señal y se envían después, y el id
// ya decidido en el teléfono es lo que hace que reenviarlos no los duplique
// (ver migración 0026).
//
// Por qué v7 y no crypto.randomUUID(), que es v4: v7 lleva la hora en los
// primeros bytes, así que los ids quedan ordenados en el tiempo y los inserts
// caen al final del índice de la primary key en vez de dispersarse por todo el
// árbol. Es el mismo formato que usa la base para todo lo demás (migración
// 0005, uuid_generate_v7).
//
// Formato (RFC 9562): 48 bits de milisegundos Unix · 4 de versión (7) · 12
// aleatorios · 2 de variante (10) · 62 aleatorios.
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Los 48 bits de la hora, byte por byte del más significativo al menos.
  // Se usa división y no >>> porque los operadores de bits de JavaScript
  // trabajan en 32 bits y la hora en milisegundos no cabe ahí.
  const ms = Date.now();
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // Versión 7 en los 4 bits altos del byte 6, conservando los 4 aleatorios.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variante RFC (10xx) en los 2 bits altos del byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
