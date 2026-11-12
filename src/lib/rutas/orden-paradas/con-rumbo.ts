// Orden de paradas CON RUMBO (spec 031; dueño, 2026-11-12: «no debería reordenarla
// sino generar la ruta sin errores sabiendo toda esta información»).
//
// ordenarParadas() mide de punto a punto: supone que en cada parada el auto gira
// en U gratis. Acá cada parada tiene uno o dos ESTADOS —el sentido en que el auto
// pasa por su calle— y el costo va de estado a estado (geo/red/matriz-con-rumbo.ts):
// salir de una parada hacia donde quedó apuntando y llegar a la otra circulando en
// su sentido. La ruta es el orden de las paradas Y el estado de cada una.
//
// Este archivo tiene lo que no busca: cómo se mide una ruta, el mejor sentido de
// cada parada para un orden dado (exacto, de una pasada) y el óptimo exacto de un
// día chico. La búsqueda está en con-rumbo-busqueda.ts. Puro: sin red ni geo.

export type DiaConRumbo = {
  /** Cantidad de estados. */
  n: number;
  /** costo[a · n + b]: de un estado a otro. Infinity si no hay camino. */
  costo: ArrayLike<number>;
  /** Los estados de cada lugar. El lugar 0 es la partida. */
  estadosDe: number[][];
  /** Dónde termina la ruta: 0 si vuelve a la partida (cerrada), otro lugar si
   *  termina en otro lado, −1 si termina en la última parada. Ese lugar no es parada. */
  fin: number;
};

export type RutaConRumbo = {
  /** Los lugares de las paradas, en orden de visita (sin la partida ni el fin). */
  orden: number[];
  /** El estado con que se pasa por cada una. */
  estados: number[];
  costo: number;
};

/** Un tramo sin camino cuesta esto: grande, pero finito para que las cuentas no
 *  den NaN y la búsqueda siga prefiriendo lo que sí tiene camino. */
export const SIN_CAMINO = 1e12;

/** Lo que la búsqueda necesita del día, ya masticado. */
export type Tablero = {
  dia: DiaConRumbo;
  /** Los lugares que son paradas. */
  paradas: number[];
  /** De un estado a otro. */
  c: (a: number, b: number) => number;
  /** De la partida a un estado, y de un estado al fin de la ruta. */
  deInicio: (b: number) => number;
  alFin: (a: number) => number;
  /** El lugar de cada estado y su otro estado (él mismo si tiene uno solo). */
  lugarDe: Int32Array;
  otro: Int32Array;
};

export function tableroDe(dia: DiaConRumbo): Tablero {
  const { n, costo, estadosDe, fin } = dia;
  const lugarDe = new Int32Array(n);
  const otro = new Int32Array(n);
  estadosDe.forEach((estados, lugar) => {
    estados.forEach((e, k) => {
      lugarDe[e] = lugar;
      otro[e] = estados[estados.length - 1 - k];
    });
  });
  const c = (a: number, b: number) => {
    const v = costo[a * n + b];
    return v < SIN_CAMINO ? v : SIN_CAMINO;
  };
  const minimo = (estados: number[], costoDe: (e: number) => number) => {
    let mejor = SIN_CAMINO;
    for (const e of estados) mejor = Math.min(mejor, costoDe(e));
    return mejor;
  };
  const partida = estadosDe[0];
  const llegada = fin >= 0 ? estadosDe[fin] : [];
  return {
    dia,
    paradas: estadosDe.map((_, lugar) => lugar).filter((lugar) => lugar !== 0 && lugar !== fin),
    c,
    deInicio: partida.length === 1 ? (b) => c(partida[0], b) : (b) => minimo(partida, (e) => c(e, b)),
    alFin: fin < 0 ? () => 0 : llegada.length === 1 ? (a) => c(a, llegada[0]) : (a) => minimo(llegada, (e) => c(a, e)),
    lugarDe,
    otro,
  };
}

/** Lo que cuesta una ruta con los estados que trae. */
export function costoDeLaRuta(t: Tablero, estados: ArrayLike<number>): number {
  if (estados.length === 0) return 0;
  let total = t.deInicio(estados[0]);
  for (let k = 1; k < estados.length; k++) total += t.c(estados[k - 1], estados[k]);
  return total + t.alFin(estados[estados.length - 1]);
}

/** El mejor estado de cada parada para ESE orden: exacto, de una pasada (en cada
 *  parada, lo mejor para llegar a cada uno de sus estados). */
export function mejoresEstados(t: Tablero, orden: ArrayLike<number>): RutaConRumbo {
  const { estadosDe } = t.dia;
  const m = orden.length;
  if (m === 0) return { orden: [], estados: [], costo: 0 };
  // hasta[k][i]: lo mínimo para estar en el estado i de la parada k; de[k][i]: desde cuál de la anterior.
  const hasta: number[][] = [];
  const de: number[][] = [];
  for (let k = 0; k < m; k++) {
    const suyos = estadosDe[orden[k]];
    const previos = k > 0 ? estadosDe[orden[k - 1]] : [];
    hasta.push(
      suyos.map((e) => {
        if (k === 0) return t.deInicio(e);
        let mejor = Infinity;
        for (let i = 0; i < previos.length; i++) mejor = Math.min(mejor, hasta[k - 1][i] + t.c(previos[i], e));
        return mejor;
      }),
    );
    de.push(
      suyos.map((e, x) => {
        for (let i = 0; i < previos.length; i++) if (hasta[k - 1][i] + t.c(previos[i], e) === hasta[k][x]) return i;
        return 0;
      }),
    );
  }
  const ultimos = estadosDe[orden[m - 1]];
  let x = 0;
  let costo = Infinity;
  ultimos.forEach((e, i) => {
    const total = hasta[m - 1][i] + t.alFin(e);
    if (total < costo) {
      costo = total;
      x = i;
    }
  });
  const estados = new Array<number>(m);
  for (let k = m - 1; k >= 0; k--) {
    estados[k] = estadosDe[orden[k]][x];
    x = de[k][x];
  }
  return { orden: Array.from(orden), estados, costo };
}

/** Hasta cuántas paradas se resuelve exacto: la tabla es 2^paradas × estados. */
export const MAX_EXACTO_CON_RUMBO = 13;

/** El óptimo exacto de un día chico (Held-Karp con el sentido como parte del
 *  estado): no existe un orden ni un sentido de paso mejores. null si no entra. */
export function exactoConRumbo(t: Tablero): RutaConRumbo | null {
  const { paradas } = t;
  const m = paradas.length;
  if (m === 0) return { orden: [], estados: [], costo: 0 };
  if (m > MAX_EXACTO_CON_RUMBO) return null;
  // Los estados de las paradas, seguidos, y la parada (0…m−1) de cada uno.
  const estados: number[] = [];
  const paradaDe: number[] = [];
  paradas.forEach((lugar, p) => {
    for (const e of t.dia.estadosDe[lugar]) {
      estados.push(e);
      paradaDe.push(p);
    }
  });
  const s = estados.length;
  const conjuntos = 1 << m;
  const dp = new Float64Array(conjuntos * s).fill(Infinity);
  const desde = new Int16Array(conjuntos * s).fill(-1);
  for (let i = 0; i < s; i++) dp[(1 << paradaDe[i]) * s + i] = t.deInicio(estados[i]);
  for (let conjunto = 1; conjunto < conjuntos; conjunto++) {
    for (let i = 0; i < s; i++) {
      const hasta = dp[conjunto * s + i];
      if (hasta === Infinity) continue;
      for (let j = 0; j < s; j++) {
        if (conjunto & (1 << paradaDe[j])) continue;
        const siguiente = (conjunto | (1 << paradaDe[j])) * s + j;
        const total = hasta + t.c(estados[i], estados[j]);
        if (total < dp[siguiente]) {
          dp[siguiente] = total;
          desde[siguiente] = i;
        }
      }
    }
  }
  const todas = conjuntos - 1;
  let ultimo = -1;
  let costo = Infinity;
  for (let i = 0; i < s; i++) {
    const total = dp[todas * s + i] + t.alFin(estados[i]);
    if (total < costo) {
      costo = total;
      ultimo = i;
    }
  }
  if (ultimo < 0) return null;
  const orden: number[] = [];
  const elegidos: number[] = [];
  let conjunto = todas;
  for (let i = ultimo; i >= 0; ) {
    orden.push(paradas[paradaDe[i]]);
    elegidos.push(estados[i]);
    const previo = desde[conjunto * s + i];
    conjunto ^= 1 << paradaDe[i];
    i = previo;
  }
  return { orden: orden.reverse(), estados: elegidos.reverse(), costo };
}
