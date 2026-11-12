// Los bultos fuera del auto lo antes posible (spec 024; dueño, 2026-11-07:
// "mientras menos bultos, más rápido se encuentra el paquete").
//
// La espera de un bulto es lo que pasa en el auto desde la central hasta su
// parada: lo manejado hasta ahí más el tiempo de las paradas anteriores. Se suma
// por bulto, así que una parada con tres pesa tres veces.
//
// No es el objetivo del orden: el orden sigue siendo el de menos costo (km y
// tiempo, y el sentido de las calles). Esta pasada parte de ese orden y solo
// acepta cambios que bajan la espera, no manejan más de `tolerancia` sobre él
// —ni en km ni en costo— y no pagan más de lo que el orden cobra aparte de cada
// tramo (devolverse en una calle estrecha). Y cada metro de más
// tiene que sacar los bultos, en promedio, al menos un metro antes: sin eso la
// pasada gastaba casi el 1 % de km en días donde la espera bajaba 0,03 %.
//
// Medido en días simulados de 60 a 100 paradas (2026-11-07): con 1 % de
// tolerancia, 3 de 16 días bajaron la espera entre 5 y 10 % (unos 5 bultos menos
// en el auto a las 2 h) por +0,3 a +0,6 % de km; los demás quedaron igual, porque
// manejar menos ya es hacer más paradas por hora. Sin tope de km, el techo fue
// ~10–15 % por +10–15 % de km.
import { distanciaOrden, type Costo, type Penalizacion } from "./costo";

export type Descarga = {
  /** Bultos de cada punto, por índice; el 0 (la base) no cuenta. */
  bultos: number[];
  /** Metros de verdad entre dos puntos (FIN = volver), sin lo que el orden cobra
   *  aparte. Sin esto, el mismo costo del orden. */
  metros?: Costo;
  /** Lo que cuesta cada tramo para el orden, sin lo que cobra aparte: los
   *  metros con el tiempo (spec 024, generar-ruta/pesos.ts). Sin esto, `metros`. */
  base?: Costo;
  /** Cuánto más se acepta manejar sobre el orden recibido, en km y en costo: 0,01 = 1 %. */
  tolerancia: number;
  /** El tiempo de cada parada, en metros de manejo: así la espera se mide en
   *  tiempo, y de dos paradas igual de lejos conviene antes la de más bultos. */
  metrosPorParada: number;
};

/** Menos que esto (en bultos × metros) no es una mejora: es ruido de coma
 *  flotante entre dos órdenes que esperan lo mismo. */
const MEJORA_MINIMA = 1;
/** Metros: lo cobrado aparte de dos órdenes que difieren en menos que esto es
 *  lo mismo. */
const MARGEN_M = 0.001;
/** Metros de espera que tiene que ahorrarle al bulto promedio cada metro de más:
 *  un km más (2,4 min a 25 km/h) tiene que sacar cada bulto 2,4 min antes. */
const ESPERA_POR_METRO = 1;
/** Cinturón: cada cambio aceptado baja la espera, así que el bucle termina solo. */
const MAX_CAMBIOS = 200;

/** Lo que esperan en el auto, sumados, los bultos de un orden (orden[0] es la base). */
export function esperaDeLosBultos(orden: number[], metros: Costo, bultos: number[], metrosPorParada: number): number {
  let manejado = 0;
  let total = 0;
  for (let k = 1; k < orden.length; k++) {
    manejado += metros(orden[k - 1], orden[k]);
    total += (bultos[orden[k]] ?? 1) * (manejado + (k - 1) * metrosPorParada);
  }
  return total;
}

/** El orden con los bultos adelantados donde sale casi gratis. Nunca devuelve uno
 *  que espere más, que maneje más de la tolerancia, que pague más de lo que el
 *  orden cobra aparte ni que gaste un metro que no rinda (ESPERA_POR_METRO). */
export function adelantarBultos(orden: number[], costo: Costo, descarga: Descarga, pen?: Penalizacion): number[] {
  if (orden.length <= 2) return orden;
  const metros = descarga.metros ?? costo;
  const base = descarga.base ?? metros;
  const { bultos, metrosPorParada } = descarga;
  const largo = distanciaOrden(orden, metros);
  const costoBase = distanciaOrden(orden, base);
  const aparte = (o: number[], b: number) => distanciaOrden(o, costo, pen) - b;
  const aparteInicial = aparte(orden, costoBase);
  // Un tramo sin dato vale infinito: no hay contra qué medir la tolerancia.
  if (!Number.isFinite(largo) || !Number.isFinite(aparteInicial)) return orden;
  const tope = largo * (1 + descarga.tolerancia);
  const topeBase = costoBase * (1 + descarga.tolerancia);
  // Dos paradas seguidas son del mismo barrio si el orden no cobra nada por pasar
  // de una a la otra.
  const mismoBarrio = (a: number, b: number) => costo(a, b) - base(a, b) <= MARGEN_M;
  const totalBultos = orden.slice(1).reduce((t, i) => t + (bultos[i] ?? 1), 0);

  let actual = orden;
  let manejado = largo;
  let espera = esperaDeLosBultos(actual, metros, bultos, metrosPorParada);
  const sirve = (otro: number[]) => {
    const e = esperaDeLosBultos(otro, metros, bultos, metrosPorParada);
    if (e > espera - MEJORA_MINIMA) return false;
    const m = distanciaOrden(otro, metros);
    if (m > tope) return false;
    const b = distanciaOrden(otro, base);
    if (b > topeBase || aparte(otro, b) > aparteInicial + MARGEN_M) return false;
    if ((espera - e) / totalBultos < (m - manejado) * ESPERA_POR_METRO) return false;
    actual = otro;
    manejado = m;
    espera = e;
    return true;
  };

  for (let cambios = 0; cambios < MAX_CAMBIOS; cambios++) {
    let cambio = false;
    for (const otro of jugadas(actual, mismoBarrio)) {
      if (sirve(otro)) {
        cambio = true;
        break;
      }
    }
    if (!cambio) break;
  }
  return actual;
}

/** Los órdenes vecinos, de la jugada más grande a la más chica (o[0] es la base). */
export function* jugadas(o: number[], mismoBarrio: (a: number, b: number) => boolean): Generator<number[]> {
  const n = o.length;
  // Un barrio entero a otro lugar, al derecho o al revés: es lo que adelanta el
  // barrio de más bultos sin pisar dos veces ninguno.
  for (let i = 1; i < n; ) {
    let fin = i;
    while (fin + 1 < n && mismoBarrio(o[fin], o[fin + 1])) fin++;
    yield* mover(o, i, fin);
    i = fin + 1;
  }
  // Dar vuelta un tramo; con el tramo entero, recorrer la ruta cerrada al revés.
  for (let i = 1; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) yield [...o.slice(0, i), ...o.slice(i, j + 1).reverse(), ...o.slice(j + 1)];
  }
  // De una a tres paradas seguidas a otro lugar.
  for (let largo = 1; largo <= 3; largo++) {
    for (let i = 1; i + largo <= n; i++) yield* mover(o, i, i + largo - 1);
  }
}

/** El tramo o[i..fin] metido en cada otro lugar, al derecho y al revés. */
function* mover(o: number[], i: number, fin: number): Generator<number[]> {
  const tramo = o.slice(i, fin + 1);
  const alReves = [...tramo].reverse();
  const resto = [...o.slice(0, i), ...o.slice(fin + 1)];
  for (let p = 1; p <= resto.length; p++) {
    if (p !== i) yield [...resto.slice(0, p), ...tramo, ...resto.slice(p)];
    if (tramo.length > 1) yield [...resto.slice(0, p), ...alReves, ...resto.slice(p)];
  }
}
