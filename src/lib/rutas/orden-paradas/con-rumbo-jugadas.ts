// Las jugadas de la búsqueda con rumbo (spec 031; el modelo está en con-rumbo.ts).
//
// La ruta es la lista de ESTADOS en orden de visita (cada estado dice su parada y
// el sentido de paso). Tres jugadas, todas medidas mirando solo los tramos que cambian:
//   · cambiar el sentido de paso de una parada;
//   · dar vuelta un tramo entero: al recorrerlo al revés, cada parada pasa por su
//     calle en el otro sentido;
//   · sacar de una a tres paradas seguidas y meterlas en otro lugar, al derecho o
//     al revés.
// Para que alcance el tiempo en el teléfono no se prueba todo contra todo: cada
// parada solo se junta con sus VECINAS (las más baratas de alcanzar), y solo se
// vuelven a mirar las paradas a las que les cambió algo cerca (las «sucias»). Así
// una sacudida de la ruta se repara mirando unas decenas de paradas y no las cien.
// Puro y determinista.
import { EPSILON } from "./costo";
import { mejoresEstados, type Tablero } from "./con-rumbo";

/** Lo que se ajusta de las jugadas (afuera solo lo tocan las mediciones). */
export const AJUSTES_JUGADAS = {
  /** Con cuántas vecinas se prueba cada parada. */
  vecinas: 10,
  /** Cuántas paradas seguidas se mueven juntas, como mucho. Con 3 (lo que mueve
   *  ordenarParadas) la búsqueda quedaba en valles distintos según el arranque. */
  tramo: 12,
};

export type Mesa = {
  /** Cantidad de paradas. */
  m: number;
  /** La ruta: el estado en cada posición. Se lee, no se escribe desde afuera. */
  r: Int32Array;
  /** Pone una ruta entera; `todas`: hay que revisar todas las paradas. */
  poner(estados: ArrayLike<number>, todas: boolean): void;
  /** Lo que cuesta la ruta que hay. */
  costo(): number;
  /** Aplica jugadas hasta que ninguna mejora y el sentido de todas es el mejor. */
  mejorar(): void;
  /** Sacude la ruta: corta en tres lugares e intercambia los dos trozos del medio. */
  doblePuente(p1: number, p2: number, p3: number): void;
};

export function crearMesa(t: Tablero): Mesa {
  const { n, estadosDe } = t.dia;
  const { otro, lugarDe, paradas } = t;
  const m = paradas.length;
  // Los costos en tablas planas: es lo que más se lee.
  const C = new Float64Array(n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) C[a * n + b] = t.c(a, b);
  const ini = Float64Array.from({ length: n }, (_, s) => t.deInicio(s));
  const fin = Float64Array.from({ length: n }, (_, s) => t.alFin(s));

  const r = new Int32Array(m);
  const temporal = new Int32Array(m);
  const pos = new Int32Array(estadosDe.length).fill(-1);
  /** adel[k]: lo que cuesta ir de la posición 0 a la k. atras[k]: lo mismo
   *  recorrido al revés y con cada parada en su otro sentido. */
  const adel = new Float64Array(m);
  const atras = new Float64Array(m);
  const sucio = new Uint8Array(estadosDe.length);
  const cola: number[] = [];

  // Las vecinas de cada parada: las que menos cuesta alcanzar, en cualquier sentido.
  const cercania = (a: number, b: number) => {
    let mejor = Infinity;
    for (const x of estadosDe[a]) for (const y of estadosDe[b]) mejor = Math.min(mejor, C[x * n + y], C[y * n + x]);
    return mejor;
  };
  const vecinas: number[][] = estadosDe.map(() => []);
  for (const a of paradas) {
    const distancia = new Map(paradas.map((b) => [b, cercania(a, b)] as const));
    vecinas[a] = paradas.filter((b) => b !== a).sort((x, y) => distancia.get(x)! - distancia.get(y)! || x - y).slice(0, AJUSTES_JUGADAS.vecinas);
  }

  /** De lo que hay en la posición k (−1: la partida) al estado s. */
  const cD = (k: number, s: number) => (k < 0 ? ini[s] : C[r[k] * n + s]);
  /** Del estado s a lo que hay en la posición k (m: el fin). */
  const cH = (s: number, k: number) => (k >= m ? fin[s] : C[s * n + r[k]]);
  /** De lo que hay en la posición a a lo que hay en la b, sin nada entremedio. */
  const cE = (a: number, b: number) => (a < 0 ? (b >= m ? 0 : ini[r[b]]) : b >= m ? fin[r[a]] : C[r[a] * n + r[b]]);

  function reindexar(): void {
    for (let k = 0; k < m; k++) pos[lugarDe[r[k]]] = k;
    adel[0] = 0;
    atras[0] = 0;
    for (let k = 1; k < m; k++) {
      adel[k] = adel[k - 1] + C[r[k - 1] * n + r[k]];
      atras[k] = atras[k - 1] + C[otro[r[k]] * n + otro[r[k - 1]]];
    }
  }
  const costo = () => (m === 0 ? 0 : ini[r[0]] + adel[m - 1] + fin[r[m - 1]]);
  function ensuciarLugar(lugar: number): void {
    if (lugar < 0 || sucio[lugar]) return;
    sucio[lugar] = 1;
    cola.push(lugar);
  }
  /** Hay que volver a mirar la parada que está en la posición k. */
  const ensuciar = (k: number) => {
    if (k >= 0 && k < m) ensuciarLugar(lugarDe[r[k]]);
  };

  /** Da vuelta [a..b], cada parada en su otro sentido. */
  function invertir(a: number, b: number): void {
    for (let x = a, y = b; x <= y; x++, y--) {
      const [izq, der] = [otro[r[y]], otro[r[x]]];
      r[x] = izq;
      r[y] = der;
    }
    reindexar();
    for (const k of [a - 1, a, b, b + 1]) ensuciar(k);
  }

  /** Saca [a..b] y lo mete después de lo que hoy está en la posición g (−1: al
   *  principio), al derecho o al revés. g no está en [a − 1 .. b]. */
  function mover(a: number, b: number, g: number, alReves: boolean): void {
    const largo = b - a + 1;
    // Las dos que quedan juntas donde estaba el tramo.
    const antes = a > 0 ? lugarDe[r[a - 1]] : -1;
    const despues = b + 1 < m ? lugarDe[r[b + 1]] : -1;
    let w = 0;
    let donde = 0;
    for (let k = -1; k < m; k++) {
      if (k >= 0 && (k < a || k > b)) temporal[w++] = r[k];
      if (k !== g) continue;
      donde = w;
      for (let x = 0; x < largo; x++) temporal[w++] = alReves ? otro[r[b - x]] : r[a + x];
    }
    r.set(temporal);
    reindexar();
    for (let k = donde - 1; k <= donde + largo; k++) ensuciar(k);
    ensuciarLugar(antes);
    ensuciarLugar(despues);
  }

  /** Prueba las jugadas de una parada; aplica la primera que mejora. */
  function probar(lugar: number): boolean {
    const i = pos[lugar];
    const s = r[i];
    const o = otro[s];
    if (o !== s && cD(i - 1, o) + cH(o, i + 1) - cD(i - 1, s) - cH(s, i + 1) < -EPSILON) {
      r[i] = o;
      reindexar();
      ensuciar(i - 1);
      ensuciar(i + 1);
      return true;
    }
    // Dar vuelta el tramo que la separa de una vecina, para que queden seguidas:
    // el tramo sin ella (la vecina pasa a su lado) o con ella (ella pasa al lado de la vecina).
    for (const vecina of vecinas[lugar]) {
      const q = pos[vecina];
      if (q <= i + 1 && q >= i - 1) continue;
      for (const [a, b] of q > i ? [[i + 1, q], [i, q - 1]] : [[q, i - 1], [q + 1, i]]) {
        const delta =
          cD(a - 1, otro[r[b]]) + (atras[b] - atras[a]) + cH(otro[r[a]], b + 1) - cD(a - 1, r[a]) - (adel[b] - adel[a]) - cH(r[b], b + 1);
        if (delta < -EPSILON) {
          invertir(a, b);
          return true;
        }
      }
    }
    // Mover el tramo que empieza o termina en ella al lado de una vecina de sus puntas.
    for (let largo = 1; largo <= AJUSTES_JUGADAS.tramo && largo < m; largo++) {
      for (const a of largo === 1 ? [i] : [i, i - largo + 1]) {
        const b = a + largo - 1;
        if (a < 0 || b >= m) continue;
        const interno = adel[b] - adel[a];
        const internoAlReves = atras[b] - atras[a];
        const saca = cE(a - 1, b + 1) - cD(a - 1, r[a]) - interno - cH(r[b], b + 1);
        for (const punta of largo === 1 ? [a] : [a, b]) {
          for (const vecina of vecinas[lugarDe[r[punta]]]) {
            const q = pos[vecina];
            if (q >= a && q <= b) continue;
            for (const g of [q - 1, q]) {
              if (g >= a - 1 && g <= b) continue; // el mismo lugar
              const base = saca - cE(g, g + 1);
              const derecho = base + cD(g, r[a]) + interno + cH(r[b], g + 1);
              const alReves = base + cD(g, otro[r[b]]) + internoAlReves + cH(otro[r[a]], g + 1);
              if (Math.min(derecho, alReves) < -EPSILON) {
                mover(a, b, g, alReves < derecho);
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  function mejorar(): void {
    for (;;) {
      while (cola.length > 0) {
        const lugar = cola.pop()!;
        sucio[lugar] = 0;
        while (probar(lugar)) {
          // Cada jugada aplicada baja el costo: el bucle termina solo.
        }
      }
      // Ninguna jugada suelta mejora: el mejor sentido de todas juntas para este orden.
      const pulida = mejoresEstados(t, Array.from(r, (e) => lugarDe[e]));
      if (pulida.costo >= costo() - EPSILON) return;
      for (let k = 0; k < m; k++) {
        if (r[k] === pulida.estados[k]) continue;
        r[k] = pulida.estados[k];
        ensuciar(k - 1);
        ensuciar(k);
        ensuciar(k + 1);
      }
      reindexar();
    }
  }

  return {
    m,
    r,
    costo,
    mejorar,
    poner(estados, todas) {
      r.set(estados);
      reindexar();
      if (todas) for (let k = 0; k < m; k++) ensuciar(k);
    },
    doblePuente(p1, p2, p3) {
      temporal.set(r);
      let w = p1;
      for (let k = p2; k < p3; k++) r[w++] = temporal[k];
      for (let k = p1; k < p2; k++) r[w++] = temporal[k];
      reindexar();
      for (const k of [p1 - 1, p1, p1 + (p3 - p2) - 1, p1 + (p3 - p2), p3 - 1, p3]) ensuciar(k);
    },
  };
}
