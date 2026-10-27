// Tope de tiempo para una consulta (spec 017, E9). Con señal mala —conectado
// pero sin que nada llegue— un fetch sin tope puede quedar colgado minutos:
// spinners que no terminan, una X deshabilitada y reintentos bloqueados.

/** Señal que corta la consulta a los `ms`, o antes si `senal` se aborta. */
export function tope(ms: number, senal?: AbortSignal | null): AbortSignal {
  const reloj = AbortSignal.timeout(ms);
  if (!senal) return reloj;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([senal, reloj]) : senal;
}
