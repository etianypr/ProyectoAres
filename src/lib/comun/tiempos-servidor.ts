// Cuánto tarda cada tramo de una ruta de API, en la cabecera Server-Timing (spec 038): el
// teléfono la lee con PerformanceResourceTiming.serverTiming y Diagnóstico la muestra. Solo
// nombres fijos y milisegundos: nunca una dirección ni nada del pedido.

export type TramoServidor = "auth" | "proveedor";

export function tiemposServidor() {
  const tramos: [TramoServidor, number][] = [];
  return {
    /** Mide `trabajo` como `tramo`, termine bien o lance. */
    async medir<T>(tramo: TramoServidor, trabajo: () => Promise<T>): Promise<T> {
      const inicio = performance.now();
      try {
        return await trabajo();
      } finally {
        tramos.push([tramo, performance.now() - inicio]);
      }
    },
    /** Le pone la cabecera a la respuesta (la misma respuesta, para devolverla tal cual). */
    con<R extends Response>(respuesta: R): R {
      if (tramos.length > 0) {
        respuesta.headers.set("Server-Timing", tramos.map(([t, ms]) => `${t};dur=${ms.toFixed(1)}`).join(", "));
      }
      return respuesta;
    },
  };
}
