// Distancias por calle entre la partida y TODAS las paradas (spec 017, R1).
//
// Antes se pedían en UNA consulta, y Mapbox acepta 25 coordenadas por consulta:
// un día de más de 24 paradas —el normal son 60— se ordenaba en línea recta, y
// medido sobre días reales eso sale 9–13 % más largo. Ahora se pide por bloques.
//
// Lo que cuesta: Mapbox cobra por ELEMENTO (un par origen→destino): 100.000 al
// mes gratis y después US$2 cada 1.000. Un día de 60 paradas son ~3.600. Para no
// pasarse:
//   · cada par se guarda en memoria el día entero: rehacer la ruta con los
//     mismos pedidos no pide nada, y sumar un pedido pide solo su fila y su
//     columna (~120 elementos);
//   · no se piden pares que nunca se usan (un punto a sí mismo). Volver a la
//     partida sí: la ruta termina donde empezó (terreno 2026-10-28);
//   · un tope mensual (TOPE_MENSUAL) que, al alcanzarse, deja ordenar en línea
//     recta y lo avisa.
//
// No se guarda en el teléfono: son puntos de destinatarios y la memoria se va al
// cerrar la app, que es lo que se quiere.

import { distanciaMetros, type Coordenada } from "../coordenada";
import { tope } from "@/lib/comun/tope";
import { tokenMapbox } from "./token";

const MATRIX = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";

/** Coordenadas por consulta (verificado: 26 devuelve 422). */
const MAX_COORDENADAS = 25;
/** Bloques de la primera vez: 12 orígenes × 13 destinos = 25 coordenadas. */
const ORIGENES_POR_BLOQUE = 12;
const DESTINOS_POR_BLOQUE = 13;
/** Consultas a la vez: Mapbox admite 60 por minuto. */
const EN_PARALELO = 4;

/** Elementos por mes que se permiten gastar: el gratis de Mapbox son 100.000 y
 *  queda margen para las pruebas. */
export const TOPE_MENSUAL = 90_000;

/** Sin matriz, la línea recta se alarga en este factor (el mismo de planificar.ts). */
const FACTOR_CALLES = 1.3;
/** Dos puntos sin camino entre sí (uno en una pasarela, o mal ubicado): se les
 *  da un costo grande pero FINITO. Con Infinity todo orden valía lo mismo
 *  —infinito— y la mejora local se apagaba para el día entero (spec 017, R3). */
const METROS_SIN_CAMINO = 20_000;

export type MatrizCalles = {
  /** metros[i][j] por calle; el 0 es la partida. Los pares que no llegaron
   *  van estimados en línea recta. */
  metros: number[][];
  /** false si algún bloque no llegó: esos pares van estimados. */
  completa: boolean;
  /** Cuántos elementos se pidieron a Mapbox esta vez (0 = todo salió de memoria). */
  pedidos: number;
};

/** Por qué no hay matriz: se ordena en línea recta y la propuesta lo avisa. */
export type SinMatriz = { metros: null; motivo: "sin_token" | "cupo" | "sin_respuesta" };

/** Cuánto queda del tope del mes. Se puede reemplazar en las pruebas. */
export type Cupo = { disponible(): number; gastar(elementos: number): void };

const CLAVE_CUPO = "ares-matriz-elementos";

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

/** El cupo vive en el teléfono (localStorage): es un contador, no un dato de nadie. */
export const cupoDelTelefono: Cupo = {
  disponible() {
    try {
      const guardado = JSON.parse(globalThis.localStorage?.getItem(CLAVE_CUPO) ?? "null") as {
        mes?: string;
        usados?: number;
      } | null;
      const usados = guardado?.mes === mesActual() ? (guardado.usados ?? 0) : 0;
      return Math.max(0, TOPE_MENSUAL - usados);
    } catch {
      return TOPE_MENSUAL;
    }
  },
  gastar(elementos) {
    try {
      const usados = TOPE_MENSUAL - this.disponible() + elementos;
      globalThis.localStorage?.setItem(CLAVE_CUPO, JSON.stringify({ mes: mesActual(), usados }));
    } catch {
      // Sin almacenamiento no hay contador: se sigue igual.
    }
  },
};

/** Pares ya conocidos, por clave de punto (~1 m). */
const conocidos = new Map<string, number>();

function clavePunto(p: Coordenada): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/** La distancia por calle de a hasta b si ya se pidió hoy, sin consultar nada
 *  (null si no está). Sirve con la ruta andando: reubicar una parada no puede
 *  esperar a la red. */
export function metrosEnMemoria(a: Coordenada, b: Coordenada): number | null {
  return conocidos.get(`${clavePunto(a)}>${clavePunto(b)}`) ?? null;
}

/** Olvida los pares guardados (al cerrar el día, y en las pruebas). */
export function olvidarMatriz(): void {
  conocidos.clear();
}

export type Consulta = { origenes: number[]; destinos: number[] };

/**
 * Qué consultas hacen falta para los pares que faltan. Pura.
 *
 * Si falta casi todo (la primera vez del día), bloques fijos de 12 × 13: cada par
 * se pide una sola vez. Si faltan pocos (un pedido nuevo, otra partida), por
 * líneas: la fila o columna con más pares faltantes, de a 24.
 */
export function planificarConsultas(n: number, faltan: Set<number>): Consulta[] {
  if (faltan.size === 0) return [];
  const consultas: Consulta[] = [];
  const par = (i: number, j: number) => i * n + j;

  if (faltan.size >= (n * n) / 3) {
    const todos = Array.from({ length: n }, (_, i) => i);
    // La partida también es destino: la ruta vuelve a ella.
    const llegadas = todos;
    for (let a = 0; a < n; a += ORIGENES_POR_BLOQUE) {
      const origenes = todos.slice(a, a + ORIGENES_POR_BLOQUE);
      for (let b = 0; b < llegadas.length; b += DESTINOS_POR_BLOQUE) {
        const destinos = llegadas.slice(b, b + DESTINOS_POR_BLOQUE);
        if (origenes.some((i) => destinos.some((j) => faltan.has(par(i, j))))) {
          consultas.push({ origenes, destinos });
        }
      }
    }
    return consultas;
  }

  const pendientes = new Set(faltan);
  while (pendientes.size > 0) {
    const porFila = new Array<number>(n).fill(0);
    const porColumna = new Array<number>(n).fill(0);
    for (const k of pendientes) {
      porFila[Math.floor(k / n)]++;
      porColumna[k % n]++;
    }
    const fila = porFila.indexOf(Math.max(...porFila));
    const columna = porColumna.indexOf(Math.max(...porColumna));
    const esFila = porFila[fila] >= porColumna[columna];
    const linea = esFila ? fila : columna;
    const otros: number[] = [];
    for (let x = 0; x < n; x++) {
      const k = esFila ? par(linea, x) : par(x, linea);
      if (pendientes.has(k)) {
        otros.push(x);
        pendientes.delete(k);
      }
    }
    for (let a = 0; a < otros.length; a += MAX_COORDENADAS - 1) {
      const grupo = otros.slice(a, a + MAX_COORDENADAS - 1);
      consultas.push(esFila ? { origenes: [linea], destinos: grupo } : { origenes: grupo, destinos: [linea] });
    }
  }
  return consultas;
}

/** Elementos que cobra Mapbox por una consulta. */
export function elementos(c: Consulta): number {
  return c.origenes.length * c.destinos.length;
}

/** Hace una consulta y guarda sus pares. false si no llegó. */
async function consultar(puntos: Coordenada[], c: Consulta, token: string): Promise<boolean> {
  // Las coordenadas de la consulta: la unión de orígenes y destinos, sin repetir.
  const indices = [...new Set([...c.origenes, ...c.destinos])];
  const posicion = new Map(indices.map((i, k) => [i, k] as const));
  const query = new URLSearchParams({
    annotations: "distance",
    sources: c.origenes.map((i) => posicion.get(i)).join(";"),
    destinations: c.destinos.map((j) => posicion.get(j)).join(";"),
    access_token: token,
  });
  const coords = indices.map((i) => `${puntos[i].lng},${puntos[i].lat}`).join(";");
  try {
    const res = await fetch(`${MATRIX}/${coords}?${query}`, { signal: tope(15_000) });
    if (!res.ok) return false;
    const datos = (await res.json()) as { distances?: (number | null)[][] };
    if (!Array.isArray(datos.distances)) return false;
    c.origenes.forEach((i, a) =>
      c.destinos.forEach((j, b) => {
        const d = datos.distances?.[a]?.[b];
        conocidos.set(
          `${clavePunto(puntos[i])}>${clavePunto(puntos[j])}`,
          d == null ? distanciaMetros(puntos[i], puntos[j]) * FACTOR_CALLES + METROS_SIN_CAMINO : d,
        );
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * La matriz de metros por calle entre `puntos` (el 0 es la partida). Sin token,
 * sin cupo en el mes o sin respuesta, `metros` es null y se ordena en línea
 * recta, como siempre. Nunca lanza.
 */
export async function matrizCalles(
  puntos: Coordenada[],
  cupo: Cupo = cupoDelTelefono,
): Promise<MatrizCalles | SinMatriz> {
  const n = puntos.length;
  const claves = puntos.map(clavePunto);
  const clavePar = (i: number, j: number) => `${claves[i]}>${claves[j]}`;

  // Se piden los pares que se usan: entre paradas, desde la partida y de vuelta
  // a ella (la ruta es cerrada). Un punto a sí mismo no.
  const faltan = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (claves[i] !== claves[j] && !conocidos.has(clavePar(i, j))) faltan.add(i * n + j);
    }
  }

  let completa = true;
  let pedidos = 0;
  if (faltan.size > 0) {
    const token = tokenMapbox();
    if (!token) return { metros: null, motivo: "sin_token" };
    const consultas = planificarConsultas(n, faltan);
    const necesarios = consultas.reduce((s, c) => s + elementos(c), 0);
    if (necesarios > cupo.disponible()) return { metros: null, motivo: "cupo" };

    for (let k = 0; k < consultas.length; k += EN_PARALELO) {
      const tanda = consultas.slice(k, k + EN_PARALELO);
      const llegaron = await Promise.all(tanda.map((c) => consultar(puntos, c, token)));
      tanda.forEach((c, x) => {
        if (llegaron[x]) pedidos += elementos(c);
        else completa = false;
      });
    }
    cupo.gastar(pedidos);
    if (pedidos === 0) return { metros: null, motivo: "sin_respuesta" };
  }

  const metros = puntos.map((a, i) =>
    puntos.map((b, j) => {
      if (claves[i] === claves[j]) return 0;
      return conocidos.get(clavePar(i, j)) ?? distanciaMetros(a, b) * FACTOR_CALLES;
    }),
  );
  return { metros, completa, pedidos };
}
