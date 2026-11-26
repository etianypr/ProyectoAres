// Cuánto espera el conductor en cada tramo (spec 038), para Diagnóstico «Tiempos»: comparar el
// día real con la línea base sin gastar cuota. Solo ETIQUETAS FIJAS y cifras (ms, tokens,
// consultas): nunca una dirección, una OF ni un nombre; por eso el tramo es un tipo cerrado y
// anotar un texto cualquiera no compila. En localStorage, como las consultas de ORS
// (geo/ors/cliente.ts), porque Android recarga ARES al ir a Google Maps. Sin localStorage
// (pruebas, modo privado) no anota nada y no lanza: medir nunca puede romper el flujo.

const TRAMOS = {
  "guia.leer": { titulo: "Leer la guía", unidad: "ms" },
  "carga.ubicar": { titulo: "Crear: ubicar", unidad: "ms" },
  "carga.corregir": { titulo: "Crear: corregir con IA", unidad: "ms" },
  "ruta.total": { titulo: "Optimizar: total", unidad: "ms" },
  "ruta.partida": { titulo: "Optimizar: esperar el GPS", unidad: "ms" },
  "ruta.preparar": { titulo: "Optimizar: reintentar y accesos", unidad: "ms" },
  "ruta.red": { titulo: "Optimizar: red y matriz", unidad: "ms" },
  "ruta.busqueda": { titulo: "Optimizar: búsqueda con rumbo", unidad: "ms" },
  "osm.turno": { titulo: "OSM: espera en la fila", unidad: "ms" },
  "osm.consulta": { titulo: "OSM: consulta", unidad: "ms" },
  "google.consulta": { titulo: "Google: consulta", unidad: "ms" },
  "ia.ida": { titulo: "IA: ida", unidad: "ms" },
  "ia.idas": { titulo: "IA: llamadas por lote", unidad: "n" },
  "ia.cache": { titulo: "IA: caché leída", unidad: "tokens" },
  "api.auth": { titulo: "API: sesión", unidad: "ms" },
  "api.proveedor": { titulo: "API: proveedor", unidad: "ms" },
  "ubicar.completar": { titulo: "Completar número: consultas", unidad: "n" },
  "hilo.bloqueo": { titulo: "Pantalla trabada", unidad: "ms" },
  // Cargar el vehículo con el escáner en vivo (fotos del dueño, 2026-11-25: «se congelaba»).
  "vivo.leer": { titulo: "Escáner: leer una etiqueta", unidad: "ms" },
  "vivo.hueco": { titulo: "Escáner: mayor pausa entre cuadros", unidad: "ms" },
  "vivo.cierre": { titulo: "Escáner: guardar la etiqueta y su foto", unidad: "ms" },
} as const;

export type Tramo = keyof typeof TRAMOS;
type Anotacion = { tramo: Tramo; valor: number; cuando: number };

const CLAVE = "ares-tiempos";
/** Avisa a Diagnóstico que cambiaron (como el modo prueba, modo-prueba.ts). */
const EVENTO = "ares-tiempos";

function avisar(): void {
  // Las pruebas simulan el teléfono con `window = {}`: sin dispatchEvent no se avisa, y medir
  // nunca lanza.
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Nada que avisar.
  }
}

/** Para useSyncExternalStore: lo anotado en este dispositivo o en otra pestaña. */
export function suscribirTiempos(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO, alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}
/** Las últimas; las más viejas se botan. ~30 bytes cada una. */
export const MAX_ANOTACIONES = 600;

function almacen(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Lo guardado tal cual (un texto estable para useSyncExternalStore); "" si no hay. */
export function tiemposCrudos(): string {
  try {
    return almacen()?.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}

export function leerTiempos(crudo = tiemposCrudos()): Anotacion[] {
  try {
    const lista = JSON.parse(crudo || "[]") as unknown;
    if (!Array.isArray(lista)) return [];
    // Lo de otra versión, o lo que no sea una cifra con un tramo conocido, no se muestra.
    return lista.filter(
      (a): a is Anotacion => typeof a?.valor === "number" && Number.isFinite(a.valor) && typeof a?.tramo === "string" && a.tramo in TRAMOS,
    );
  } catch {
    return [];
  }
}

/** Anota una cifra del tramo. Nunca lanza. */
export function anotarTiempo(tramo: Tramo, valor: number): void {
  if (!(tramo in TRAMOS) || !Number.isFinite(valor)) return;
  const lugar = almacen();
  if (!lugar) return;
  try {
    const lista = leerTiempos();
    lista.push({ tramo, valor: Math.round(valor), cuando: Date.now() });
    lugar.setItem(CLAVE, JSON.stringify(lista.slice(-MAX_ANOTACIONES)));
  } catch {
    // Lleno o bloqueado: sin anotación; el flujo sigue igual.
    return;
  }
  avisar();
}

const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Mide `trabajo` como `tramo`, termine bien o lance. Devuelve lo mismo que `trabajo`. */
export async function cronometrar<T>(tramo: Tramo, trabajo: () => Promise<T>): Promise<T> {
  const inicio = ahora();
  try {
    return await trabajo();
  } finally {
    anotarTiempo(tramo, ahora() - inicio);
  }
}

/** Un reloj para tramos que no caben en una función: `const fin = desde("osm.turno"); …; fin()`. */
export function desde(tramo: Tramo): () => void {
  const inicio = ahora();
  return () => anotarTiempo(tramo, ahora() - inicio);
}

export function borrarTiempos(): void {
  try {
    almacen()?.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
  avisar();
}

type ResumenTramo = { tramo: Tramo; titulo: string; unidad: string; n: number; mediana: number; p90: number; ultimo: number };

function percentil(ordenados: number[], p: number): number {
  return ordenados[Math.min(ordenados.length - 1, Math.floor(p * ordenados.length))];
}

/** Por tramo, en el orden de TRAMOS: cuántas, la mediana, el p90 y la última. */
export function resumenTiempos(lista = leerTiempos()): ResumenTramo[] {
  return (Object.keys(TRAMOS) as Tramo[]).flatMap((tramo) => {
    const suyos = lista.filter((a) => a.tramo === tramo);
    if (suyos.length === 0) return [];
    const ordenados = suyos.map((a) => a.valor).sort((a, b) => a - b);
    return [
      {
        tramo,
        titulo: TRAMOS[tramo].titulo,
        unidad: TRAMOS[tramo].unidad,
        n: suyos.length,
        mediana: percentil(ordenados, 0.5),
        p90: percentil(ordenados, 0.9),
        ultimo: suyos[suyos.length - 1].valor,
      },
    ];
  });
}

/** Las cifras en texto, para «Copiar cifras»: solo tramos y números. */
export function tiemposEnTexto(resumen = resumenTiempos()): string {
  return resumen.map((r) => `${r.tramo}\tn=${r.n}\tmediana=${r.mediana}\tp90=${r.p90}\túltimo=${r.ultimo}\t${r.unidad}`).join("\n");
}
