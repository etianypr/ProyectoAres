// Caminos por la red sabiendo por dónde se viene (spec 031). La búsqueda avanza de
// ARCO en arco (ver grafo.ts), no de cruce en cruce: así en cada esquina se sabe
// con qué rumbo llega el auto, y se puede decir «por acá no se devuelve».
//
// Reglas de giro (dueño, 2026-10-29 y 2026-11-12):
//   · calle angosta (residencial, pasaje, servicio): no se gira en U, ni a mitad
//     de cuadra ni en la esquina;
//   · calle ancha de doble sentido: sí, con el tiempo de la maniobra;
//   · fondo de saco: se sale en reversa, con el tiempo de la maniobra;
//   · las restricciones de giro y las barreras de OpenStreetMap.
// El camino que se busca es el más rápido, como el que guía Google Maps; de él se
// anotan los metros y los segundos reales. Con `libre` se mide como una matriz de
// ORS —sin reglas de giro y sin calles ni portones privados—: sirve para comparar
// el motor contra ella. Puro.
import { arcoValido, cabeza, esAncha, nArcos, PRIVADA, UN_SENTIDO, type Red } from "./grafo";
import { MANIOBRA_REVERSA_S, MANIOBRA_U_S, PORTON_S, segundosPorArista } from "./tiempos";

/** De dónde parte una búsqueda: el auto va por `arco` y le falta este pedazo para
 *  llegar a su final. `extraS`: una maniobra que hizo para salir así. */
export type Salida = { arco: number; metros: number; segundos: number; extraS?: number };

export type Reglas = { libre?: boolean };

/** Lo que una búsqueda deja anotado de cada arco, y con qué se relee. Los arcos
 *  de salida son «virtuales» (nArcos + k): el auto recorre solo un pedazo. */
export type Busqueda = {
  red: Red;
  /** Por arco: lo que pesa llegar a su final, y los metros y segundos reales. */
  peso: Float64Array;
  metros: Float64Array;
  segundos: Float64Array;
  /** El arco anterior del camino (−1 en una salida). */
  previo: Int32Array;
  /** En qué corrida se anotó cada arco: lo de otra corrida no vale. */
  marca: Uint32Array;
  corrida: number;
  /** Las salidas de esta corrida. */
  salidas: Salida[];
  monticuloPeso: Float64Array;
  monticuloArco: Int32Array;
};

/** Salidas por búsqueda, como mucho (los dos sentidos de una calle). */
const MAX_SALIDAS = 2;

/** El espacio de trabajo de las búsquedas sobre una red: se reusa de una a otra
 *  para no pedir memoria doscientas veces por día. */
export function crearBusqueda(red: Red): Busqueda {
  const n = nArcos(red) + MAX_SALIDAS;
  // Cada arco se abre una sola vez y mete, como mucho, los que salen de su final.
  let capacidad = 16;
  let masSalidas = 0;
  for (let nodo = 0; nodo < red.nNodos; nodo++) masSalidas = Math.max(masSalidas, red.salenInicio[nodo + 1] - red.salenInicio[nodo]);
  for (let s = 0; s < red.salen.length; s++) {
    const fin = cabeza(red, red.salen[s]);
    capacidad += red.salenInicio[fin + 1] - red.salenInicio[fin];
  }
  capacidad += MAX_SALIDAS * (masSalidas + 1);
  return {
    red,
    peso: new Float64Array(n),
    metros: new Float64Array(n),
    segundos: new Float64Array(n),
    previo: new Int32Array(n),
    marca: new Uint32Array(n),
    corrida: 0,
    salidas: [],
    monticuloPeso: new Float64Array(capacidad),
    monticuloArco: new Int32Array(capacidad),
  };
}

/** ¿Se puede pasar del arco `llega` al arco `sale` en el nodo que los une? Devuelve
 *  los segundos de la maniobra (0 si es un giro cualquiera) o −1 si no se puede. */
export function giro(red: Red, llega: number, sale: number, reglas: Reglas): number {
  const seDevuelve = (llega ^ 1) === sale;
  const barrera = red.cerrado[cabeza(red, llega)];
  // Por una barrera no se pasa: solo queda devolverse. Por un portón privado sí,
  // esperando que abran (para ORS está cerrado).
  if (barrera && !seDevuelve && (barrera === 1 || reglas.libre)) return -1;
  if (reglas.libre) return 0;
  if (red.conGiros[llega] && red.prohibidos.has(llega * nArcos(red) + sale)) return -1;
  if (seDevuelve) return maniobraEn(red, llega >> 1);
  return barrera === 2 ? PORTON_S : 0;
}

/**
 * Busca desde `salidas` el camino más rápido al final de cada arco. Se detiene
 * cuando ya anotó todos los `destinos` (arcos), si se le dan. Lo anotado queda en
 * `b` hasta la próxima corrida: se lee con `llegada`.
 */
export function buscar(b: Busqueda, salidas: Salida[], reglas: Reglas = {}, destinos?: Iterable<number>): void {
  const { red, peso, metros, segundos, previo, marca, monticuloPeso: mp, monticuloArco: ma } = b;
  const total = nArcos(red);
  const tiempos = segundosPorArista(red);
  const corrida = ++b.corrida;
  b.salidas = salidas;
  let tam = 0;
  const meter = (p: number, arco: number) => {
    let i = tam++;
    while (i > 0) {
      const padre = (i - 1) >> 1;
      if (mp[padre] <= p) break;
      mp[i] = mp[padre];
      ma[i] = ma[padre];
      i = padre;
    }
    mp[i] = p;
    ma[i] = arco;
  };
  const sacar = () => {
    const arco = ma[0];
    const p = mp[--tam];
    const a = ma[tam];
    let i = 0;
    for (;;) {
      let hijo = 2 * i + 1;
      if (hijo >= tam) break;
      if (hijo + 1 < tam && mp[hijo + 1] < mp[hijo]) hijo++;
      if (mp[hijo] >= p) break;
      mp[i] = mp[hijo];
      ma[i] = ma[hijo];
      i = hijo;
    }
    mp[i] = p;
    ma[i] = a;
    return arco;
  };

  let faltan = 0;
  const esDestino = destinos ? new Uint8Array(total) : null;
  if (destinos && esDestino) {
    for (const d of destinos) {
      if (!esDestino[d]) faltan++;
      esDestino[d] = 1;
    }
  }

  salidas.slice(0, MAX_SALIDAS).forEach((s, k) => {
    const v = total + k;
    marca[v] = corrida;
    peso[v] = s.segundos + (s.extraS ?? 0);
    segundos[v] = s.segundos + (s.extraS ?? 0);
    metros[v] = s.metros;
    previo[v] = -1;
    meter(peso[v], v);
  });

  while (tam > 0) {
    const pesoTope = mp[0];
    const actual = sacar();
    if (pesoTope > peso[actual]) continue; // una entrada vieja del montículo
    const real = actual >= total ? salidas[actual - total].arco : actual;
    if (esDestino && actual < total && esDestino[actual]) {
      esDestino[actual] = 0;
      if (--faltan === 0) break;
    }
    const nodo = cabeza(red, real);
    for (let s = red.salenInicio[nodo]; s < red.salenInicio[nodo + 1]; s++) {
      const sale = red.salen[s];
      const maniobra = giro(red, real, sale, reglas);
      if (maniobra < 0) continue;
      const k = sale >> 1;
      if (reglas.libre && red.codigo[k] & PRIVADA) continue;
      const nuevo = peso[actual] + maniobra + tiempos.peso[k];
      if (marca[sale] === corrida && peso[sale] <= nuevo) continue;
      marca[sale] = corrida;
      peso[sale] = nuevo;
      segundos[sale] = segundos[actual] + maniobra + tiempos.real[k];
      metros[sale] = metros[actual] + red.largo[k];
      previo[sale] = actual;
      meter(nuevo, sale);
    }
  }
}

export type Llegada = {
  peso: number;
  metros: number;
  segundos: number;
  /** Si llegó derecho por la misma cuadra de la que salió: cuál salida (−1 si no). */
  directa: number;
};

/**
 * Lo que cuesta, según la última búsqueda, llegar a un punto de `arco` circulando
 * en su sentido: `fraccion` es la parte del arco que se recorre hasta el punto.
 * null si no se llega. Cuenta también el caso de la misma cuadra: si una salida iba
 * por ese arco y el punto queda más adelante, se llega derecho.
 */
export function llegada(b: Busqueda, arco: number, fraccion: number): Llegada | null {
  const { red } = b;
  const total = nArcos(red);
  const k = arco >> 1;
  const tiempos = segundosPorArista(red);
  let mejor: Llegada | null = null;
  if (b.marca[arco] === b.corrida) {
    // Entró al arco por su principio: lo anotado menos la parte que no recorre.
    const resto = 1 - fraccion;
    mejor = {
      peso: b.peso[arco] - resto * tiempos.peso[k],
      metros: b.metros[arco] - resto * red.largo[k],
      segundos: b.segundos[arco] - resto * tiempos.real[k],
      directa: -1,
    };
  }
  b.salidas.forEach((s, i) => {
    if (s.arco !== arco || b.marca[total + i] !== b.corrida) return;
    // La salida está a `falta` del final del arco, y el punto a (1 − fraccion).
    const falta = red.largo[k] > 0 ? s.metros / red.largo[k] : 0;
    const tramo = falta - (1 - fraccion);
    if (tramo < -1e-9) return; // el punto quedó atrás
    const directo = {
      peso: (s.extraS ?? 0) + Math.max(0, tramo) * tiempos.peso[k],
      metros: Math.max(0, tramo) * red.largo[k],
      segundos: (s.extraS ?? 0) + Math.max(0, tramo) * tiempos.real[k],
      directa: i,
    };
    if (!mejor || directo.peso < mejor.peso) mejor = directo;
  });
  return mejor;
}

/** Los arcos del camino hasta `arco` según la última búsqueda, del primero al
 *  último, y de cuál salida parte. El primero es el de esa salida (se recorre solo
 *  su pedazo final). */
export function caminoHasta(b: Busqueda, arco: number): { arcos: number[]; salida: number } {
  const total = nArcos(b.red);
  const arcos: number[] = [];
  let salida = -1;
  for (let a = arco; a >= 0; a = b.previo[a]) {
    if (a >= total) {
      salida = a - total;
      arcos.push(b.salidas[salida].arco);
      break;
    }
    arcos.push(a);
  }
  return { arcos: arcos.reverse(), salida };
}

/** Las salidas de un punto de la red: por el arco `sentido` (0 hacia `hasta`, 1
 *  hacia `desde`) y, si ahí se puede dar la vuelta, también por el otro pagando la
 *  maniobra. Con `sentido` null (la central) sale hacia donde quiera. */
export function salidasDe(red: Red, arista: number, fraccion: number, sentido: 0 | 1 | null, reglas: Reglas = {}): Salida[] {
  const tiempos = segundosPorArista(red);
  const hacia = (s: 0 | 1, extraS: number): Salida | null => {
    const arco = 2 * arista + s;
    if (!arcoValido(red, arco)) return null;
    const falta = s === 0 ? 1 - fraccion : fraccion;
    return { arco, metros: falta * red.largo[arista], segundos: falta * tiempos.real[arista], extraS };
  };
  if (sentido === null || reglas.libre) return [hacia(0, 0), hacia(1, 0)].filter((s): s is Salida => s !== null);
  const derecho = hacia(sentido, 0);
  const vuelta = maniobraEn(red, arista);
  const alReves = vuelta >= 0 ? hacia(sentido === 0 ? 1 : 0, vuelta) : null;
  return [derecho, alReves].filter((s): s is Salida => s !== null);
}

/** Segundos de dar la vuelta parado en esa arista (a mitad de cuadra), o −1 si
 *  ahí no se puede: las mismas reglas de `giro`. */
export function maniobraEn(red: Red, arista: number): number {
  if (red.sinSalida[arista]) return MANIOBRA_REVERSA_S;
  return esAncha(red.codigo[arista]) && !(red.codigo[arista] & UN_SENTIDO) ? MANIOBRA_U_S : -1;
}
