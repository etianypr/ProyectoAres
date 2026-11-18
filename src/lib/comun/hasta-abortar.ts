// Esperar una promesa que no es de uno (spec 033 y 038): una consulta compartida por varios
// llamadores, o la de un pedido que se dejó de ubicar. Cada uno deja de esperar con su propia
// señal, sin cortarle la consulta a los demás.

/** Espera la promesa, o null apenas se aborte la señal (lo que llegue después se ignora). */
export function hastaAbortar<T>(promesa: Promise<T>, senal?: AbortSignal): Promise<T | null> {
  if (!senal) return promesa;
  if (senal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((listo, falla) => {
    const alAbortar = () => listo(null);
    senal.addEventListener("abort", alAbortar, { once: true });
    promesa.then(
      (v) => {
        senal.removeEventListener("abort", alAbortar);
        listo(v);
      },
      (e) => {
        senal.removeEventListener("abort", alAbortar);
        falla(e);
      },
    );
  });
}
