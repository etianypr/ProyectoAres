// Los bultos fuera del auto lo antes posible, sobre el orden con rumbo (la regla
// de la spec 024 —descarga.ts— con las distancias de la spec 031).
//
// Es la misma pasada: parte del orden que menos cuesta y solo acepta cambios que
// bajan la espera de los bultos, no manejan más de `tolerancia` sobre él —ni en
// metros ni en costo— y en los que cada metro de más saca los bultos, en promedio,
// al menos un metro antes. Lo que cambia es cómo se mide un orden: con el mejor
// sentido de paso de cada parada (con-rumbo.ts), no de punto a punto. Puro.
import { jugadas } from "./descarga";
import { mejoresEstados, type RutaConRumbo, type Tablero } from "./con-rumbo";

export type DescargaConRumbo = {
  /** Bultos de cada lugar, por índice de lugar (la partida no cuenta). */
  bultos: number[];
  /** Metros de estado a estado, [a · n + b]. */
  metros: ArrayLike<number>;
  /** Cuánto más se acepta manejar sobre el orden recibido, en metros y en costo: 0,01 = 1 %. */
  tolerancia: number;
  /** El tiempo de cada parada, en metros de manejo. */
  metrosPorParada: number;
};

/** Menos que esto (en bultos × metros) no es una mejora: es ruido de coma flotante. */
const MEJORA_MINIMA = 1;
/** Metros de espera que tiene que ahorrarle al bulto promedio cada metro de más. */
const ESPERA_POR_METRO = 1;
/** Cinturón: cada cambio aceptado baja la espera, así que el bucle termina solo. */
const MAX_CAMBIOS = 200;

type Medida = { costo: number; metros: number; espera: number };

/** Mide un orden (con la partida en o[0]) con el mejor sentido de cada parada:
 *  lo que cuesta, los metros y la espera de los bultos. Sin pedir memoria por orden. */
function medidor(t: Tablero, d: DescargaConRumbo): (o: number[]) => Medida {
  const { estadosDe, n, fin } = t.dia;
  const m = t.paradas.length;
  const hasta = new Float64Array(m * 2);
  const de = new Int8Array(m * 2);
  const elegido = new Int32Array(m);
  const partida = estadosDe[0][0];
  const llegada = fin >= 0 ? estadosDe[fin][0] : -1;
  return (o) => {
    for (let k = 1; k <= m; k++) {
      const suyos = estadosDe[o[k]];
      const previos = k > 1 ? estadosDe[o[k - 1]] : null;
      for (let x = 0; x < suyos.length; x++) {
        if (!previos) {
          hasta[x] = t.deInicio(suyos[x]);
          continue;
        }
        let mejor = Infinity;
        let cual = 0;
        for (let i = 0; i < previos.length; i++) {
          const v = hasta[(k - 2) * 2 + i] + t.c(previos[i], suyos[x]);
          if (v < mejor) {
            mejor = v;
            cual = i;
          }
        }
        hasta[(k - 1) * 2 + x] = mejor;
        de[(k - 1) * 2 + x] = cual;
      }
    }
    const ultimos = estadosDe[o[m]];
    let costo = Infinity;
    let x = 0;
    for (let i = 0; i < ultimos.length; i++) {
      const total = hasta[(m - 1) * 2 + i] + t.alFin(ultimos[i]);
      if (total < costo) {
        costo = total;
        x = i;
      }
    }
    for (let k = m; k >= 1; k--) {
      elegido[k - 1] = estadosDe[o[k]][x];
      x = de[(k - 1) * 2 + x];
    }
    let manejado = 0;
    let espera = 0;
    let previo = partida;
    for (let k = 1; k <= m; k++) {
      manejado += d.metros[previo * n + elegido[k - 1]];
      espera += (d.bultos[o[k]] ?? 1) * (manejado + (k - 1) * d.metrosPorParada);
      previo = elegido[k - 1];
    }
    return { costo, metros: manejado + (llegada >= 0 ? d.metros[previo * n + llegada] : 0), espera };
  };
}

/** El orden con los bultos adelantados donde sale casi gratis. Nunca devuelve uno
 *  que espere más, que maneje más de la tolerancia ni que gaste un metro que no rinda. */
export function adelantarBultosConRumbo(t: Tablero, ruta: RutaConRumbo, d: DescargaConRumbo): RutaConRumbo {
  if (ruta.orden.length <= 1) return ruta;
  const medir = medidor(t, d);
  let actual = [0, ...ruta.orden];
  const inicial = medir(actual);
  if (!Number.isFinite(inicial.metros) || !Number.isFinite(inicial.costo)) return ruta;
  const tope = inicial.metros * (1 + d.tolerancia);
  const topeDeCosto = inicial.costo * (1 + d.tolerancia);
  const totalBultos = ruta.orden.reduce((s, lugar) => s + (d.bultos[lugar] ?? 1), 0);
  let { metros: manejado, espera } = inicial;
  let cambio = false;
  for (let cambios = 0; cambios < MAX_CAMBIOS; cambios++) {
    let mejoro = false;
    // La ruta entera es «un barrio»: la primera jugada es recorrerla al revés.
    for (const otro of jugadas(actual, () => true)) {
      const e = medir(otro);
      if (e.espera > espera - MEJORA_MINIMA || e.metros > tope || e.costo > topeDeCosto) continue;
      if ((espera - e.espera) / totalBultos < (e.metros - manejado) * ESPERA_POR_METRO) continue;
      actual = otro;
      manejado = e.metros;
      espera = e.espera;
      mejoro = true;
      cambio = true;
      break;
    }
    if (!mejoro) break;
  }
  return cambio ? mejoresEstados(t, actual.slice(1)) : ruta;
}
