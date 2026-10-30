// Distancias por calle entre la partida y TODAS las paradas (spec 017, R1).
//
// Con esto se decide el ORDEN de la ruta. Desde 2026-10-30 se piden a
// OpenRouteService y no a Mapbox: Mapbox cobra por cada par pasado lo gratis y
// no tiene tope de gasto (unas pruebas mías dejaron una cuenta de US$66). ORS es
// gratis y sin tarjeta: pasado su límite RECHAZA la consulta, nunca cobra.
//
// Límites de ORS (plan gratis, verificados contra la API real):
//   · 3.500 pares por consulta (60 × 60 devuelve 400, código 6004);
//   · 500 consultas al día y 40 por minuto. Un día de 67 puntos son 2 consultas.
// Un punto sin calle cerca (en el mar, mal ubicado) vuelve con sus pares en null,
// sin botar la consulta entera.
//
// Para gastar lo menos posible:
//   · cada par se guarda en memoria el día entero: rehacer la ruta con los
//     mismos pedidos no pide nada, y sumar un pedido pide solo su fila y su
//     columna;
//   · no se piden pares que nunca se usan (un punto a sí mismo). Volver a la
//     partida sí: la ruta termina donde empezó (terreno 2026-10-28).
//
// No se guarda en el teléfono: son puntos de destinatarios y la memoria se va al
// cerrar la app, que es lo que se quiere. La consulta sale directo del teléfono a
// ORS (nunca por el servidor), con una clave pública como el token de Mapbox.

import { distanciaMetros, type Coordenada } from "./coordenada";
import { claveOrs, postOrs } from "./ors/cliente";

const MATRIX = "/v2/matrix/driving-car";

/** Pares (orígenes × destinos) por consulta que acepta ORS. */
const MAX_PARES = 3_500;
/** Consultas a la vez: ORS admite 40 por minuto. */
const EN_PARALELO = 2;

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
  /** false si alguna consulta no llegó: esos pares van estimados. */
  completa: boolean;
  /** Cuántos pares se pidieron esta vez (0 = todo salió de memoria). */
  pedidos: number;
};

/** Por qué no hay matriz: se ordena en línea recta y la propuesta lo avisa.
 *  "cupo" = ORS dijo que se acabaron las consultas gratis del día. */
export type SinMatriz = { metros: null; motivo: "sin_token" | "cupo" | "sin_respuesta" };

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
 * Si falta casi todo (la primera vez del día), bloques de orígenes contra TODOS
 * los destinos, tantos orígenes como entren en MAX_PARES: cada par se pide una
 * sola vez. Si faltan pocos (un pedido nuevo, otra partida), por líneas: la
 * fila o columna con más pares faltantes.
 */
export function planificarConsultas(n: number, faltan: Set<number>): Consulta[] {
  if (faltan.size === 0) return [];
  const consultas: Consulta[] = [];
  const par = (i: number, j: number) => i * n + j;

  if (faltan.size >= (n * n) / 3) {
    const todos = Array.from({ length: n }, (_, i) => i);
    const porBloque = Math.max(1, Math.floor(MAX_PARES / n));
    // La partida también es destino: la ruta vuelve a ella.
    for (let a = 0; a < n; a += porBloque) {
      const origenes = todos.slice(a, a + porBloque);
      if (origenes.some((i) => todos.some((j) => faltan.has(par(i, j))))) {
        consultas.push({ origenes, destinos: todos });
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
    for (let a = 0; a < otros.length; a += MAX_PARES) {
      const grupo = otros.slice(a, a + MAX_PARES);
      consultas.push(esFila ? { origenes: [linea], destinos: grupo } : { origenes: grupo, destinos: [linea] });
    }
  }
  return consultas;
}

/** Pares que pide una consulta. */
export function elementos(c: Consulta): number {
  return c.origenes.length * c.destinos.length;
}

type Resultado = "llego" | "cupo" | "fallo";

/** Hace una consulta y guarda sus pares. */
async function consultar(puntos: Coordenada[], c: Consulta): Promise<Resultado> {
  // Las coordenadas de la consulta: la unión de orígenes y destinos, sin repetir.
  const indices = [...new Set([...c.origenes, ...c.destinos])];
  const posicion = new Map(indices.map((i, k) => [i, k] as const));
  const r = await postOrs<{ distances?: (number | null)[][] }>(
    MATRIX,
    {
      locations: indices.map((i) => [puntos[i].lng, puntos[i].lat]),
      sources: c.origenes.map((i) => posicion.get(i)),
      destinations: c.destinos.map((j) => posicion.get(j)),
      metrics: ["distance"],
      units: "m",
    },
    15_000,
  );
  if (!r) return "fallo";
  if ("cupo" in r) return "cupo";
  const distancias = r.datos.distances;
  if (!Array.isArray(distancias)) return "fallo";
  c.origenes.forEach((i, a) =>
    c.destinos.forEach((j, b) => {
      const d = distancias[a]?.[b];
      conocidos.set(
        `${clavePunto(puntos[i])}>${clavePunto(puntos[j])}`,
        d == null ? distanciaMetros(puntos[i], puntos[j]) * FACTOR_CALLES + METROS_SIN_CAMINO : d,
      );
    }),
  );
  return "llego";
}

/**
 * La matriz de metros por calle entre `puntos` (el 0 es la partida). Sin clave,
 * sin consultas en el día o sin respuesta, `metros` es null y se ordena en línea
 * recta, como siempre. Nunca lanza.
 */
export async function matrizCalles(puntos: Coordenada[]): Promise<MatrizCalles | SinMatriz> {
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
    if (!claveOrs()) return { metros: null, motivo: "sin_token" };
    const consultas = planificarConsultas(n, faltan);
    let sinCupo = false;

    for (let k = 0; k < consultas.length; k += EN_PARALELO) {
      const tanda = consultas.slice(k, k + EN_PARALELO);
      const resultados = await Promise.all(tanda.map((c) => consultar(puntos, c)));
      tanda.forEach((c, x) => {
        if (resultados[x] === "llego") pedidos += elementos(c);
        else completa = false;
        if (resultados[x] === "cupo") sinCupo = true;
      });
    }
    if (pedidos === 0) return { metros: null, motivo: sinCupo ? "cupo" : "sin_respuesta" };
  }

  const metros = puntos.map((a, i) =>
    puntos.map((b, j) => {
      if (claves[i] === claves[j]) return 0;
      return conocidos.get(clavePar(i, j)) ?? distanciaMetros(a, b) * FACTOR_CALLES;
    }),
  );
  return { metros, completa, pedidos };
}
