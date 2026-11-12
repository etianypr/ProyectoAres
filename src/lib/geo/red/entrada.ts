// En un condominio, siempre por su entrada (dueño, 2026-11-12, spec 031).
//
// Google ubica un departamento en el techo de su edificio, y la calle más cercana
// a ese punto puede ser una de atrás, de la que no se entra: en la ruta del 10-11
// una parada quedó pegada a un camino de tierra detrás del condominio y la ruta dio
// la vuelta entera al Centro Ecuestre (+2,2 km). El dueño: «siempre se entra por la
// entrada del condominio»; no importa si después se entra con el auto o no.
//
// Una casa está DENTRO de un condominio si su calle interna más cercana —una calle
// privada, o un pasaje interno o entrada de auto— está tan cerca como la calle
// pública donde se pegaría. Su ENTRADA es el primer cruce con una calle pública
// manejable, recorriendo solo calles internas desde la casa (la más cercana por
// dentro, si hay varias). La parada se entrega ahí: la ruta llega a la entrada y
// Google Maps navega a ella (ruta-por-calles.ts). Puro.
import type { Coordenada } from "@/lib/geo/coordenada";
import { clase, PRIVADA, SIN_PARADA, type Red } from "./grafo";
import { dondeSePara, pegarALaRed } from "./pegar";

/** Una calle de adentro de un condominio: privada, o un pasaje interno de
 *  estacionamiento o una entrada de auto (clase servicio sin parada, así los deja
 *  scripts/generar-red.mjs). No cuentan las calles de servicio públicas ni los
 *  pasajes abiertos con nombre de calle (como Mosa, 2026-11-12): ahí se para frente
 *  a la casa. */
export const esInterna = (red: Red, k: number) => !!(red.codigo[k] & PRIVADA) || (clase(red.codigo[k]) === 7 && !!(red.codigo[k] & SIN_PARADA));
/** Una calle pública donde se puede parar a la entrada. */
const esPublica = (red: Red, k: number) => !esInterna(red, k) && dondeSePara(red, k);

/** La interna puede estar hasta esto más lejos que la pública y la casa sigue
 *  estando dentro: el punto de Google cae en el edificio, no en la calle. */
const HOLGURA_DENTRO_M = 2;
/** Más lejos que esto de la calle interna, la casa no es de ese condominio. */
const RADIO_INTERNA_M = 120;
/** Por dentro, nunca más que esto hasta la entrada. */
const TOPE_POR_DENTRO_M = 2000;

/** Dónde se entrega una parada: un punto de una arista, y la entrada del
 *  condominio si la casa está dentro de uno (null si no). */
export type Entrega = { arista: number; fraccion: number; entrada: Coordenada | null };

const recordadas = new WeakMap<Red, Map<string, Entrega | null>>();
const clave = (p: Coordenada) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Dónde se entrega lo que va a `punto`: la calle pública en la entrada de su
 *  condominio, o la calle más cercana si no está en uno. null si no hay calle cerca. */
export function entregaEn(red: Red, punto: Coordenada): Entrega | null {
  let memoria = recordadas.get(red);
  if (!memoria) recordadas.set(red, (memoria = new Map()));
  const k = clave(punto);
  if (memoria.has(k)) return memoria.get(k)!;
  const entrega = calcular(red, punto);
  memoria.set(k, entrega);
  return entrega;
}

/** La entrada del condominio donde está `punto`, o null si no está en uno. */
export function entradaDelCondominio(red: Red, punto: Coordenada): Coordenada | null {
  return entregaEn(red, punto)?.entrada ?? null;
}

function calcular(red: Red, punto: Coordenada): Entrega | null {
  const publica = pegarALaRed(red, punto);
  const interna = pegarALaRed(red, punto, RADIO_INTERNA_M, esInterna);
  const comoSiempre = publica ? { arista: publica.arista, fraccion: publica.fraccion, entrada: null } : null;
  if (!interna || (publica && interna.metros > publica.metros + HOLGURA_DENTRO_M)) return comoSiempre;
  const nodo = entradaPorDentro(red, interna.arista, interna.fraccion);
  if (nodo < 0) return comoSiempre;
  // La parada queda en la calle pública, justo en la entrada. Si en la entrada se
  // juntan varias calles, la más ancha (la de la clase más baja).
  let calle = -1;
  for (let s = red.salenInicio[nodo]; s < red.salenInicio[nodo + 1]; s++) {
    const k = red.salen[s] >> 1;
    if (esPublica(red, k) && (calle < 0 || clase(red.codigo[k]) < clase(red.codigo[calle]))) calle = k;
  }
  // Una calle de un solo sentido que solo LLEGA a la entrada no sale entre las
  // salidas del nodo: se busca entre todas las que lo tocan.
  if (calle < 0) {
    for (let k = 0; k < red.nAristas && calle < 0; k++) {
      if ((red.desde[k] === nodo || red.hasta[k] === nodo) && esPublica(red, k)) calle = k;
    }
  }
  if (calle < 0) return comoSiempre;
  // Una casa con su propia entrada de auto queda igual: en la calle, en la boca de esa entrada.
  return { arista: calle, fraccion: red.desde[calle] === nodo ? 0 : 1, entrada: { lat: red.lat[nodo], lng: red.lng[nodo] } };
}

/** El nodo de la entrada más cercana por dentro, desde un punto de una calle
 *  interna (recorriendo solo calles internas, en cualquier sentido). −1 si no hay. */
function entradaPorDentro(red: Red, arista: number, fraccion: number): number {
  const distancia = new Map<number, number>();
  const pendientes: [number, number][] = [];
  const poner = (nodo: number, d: number) => {
    if (d > TOPE_POR_DENTRO_M || d >= (distancia.get(nodo) ?? Infinity)) return;
    distancia.set(nodo, d);
    pendientes.push([d, nodo]);
  };
  poner(red.desde[arista], fraccion * red.largo[arista]);
  poner(red.hasta[arista], (1 - fraccion) * red.largo[arista]);
  const tocan = tocanPorNodo(red);
  while (pendientes.length > 0) {
    // Son pocos nodos (un condominio): basta con sacar el menor.
    let menor = 0;
    for (let i = 1; i < pendientes.length; i++) if (pendientes[i][0] < pendientes[menor][0]) menor = i;
    const [d, nodo] = pendientes.splice(menor, 1)[0];
    if (d > (distancia.get(nodo) ?? Infinity)) continue;
    if (tocan[nodo].some((k) => esPublica(red, k))) return nodo;
    for (const k of tocan[nodo]) {
      if (!esInterna(red, k)) continue;
      poner(red.desde[k] === nodo ? red.hasta[k] : red.desde[k], d + red.largo[k]);
    }
  }
  return -1;
}

const tocanRecordado = new WeakMap<Red, number[][]>();
/** Las aristas que tocan cada nodo, sin mirar el sentido. */
function tocanPorNodo(red: Red): number[][] {
  const listo = tocanRecordado.get(red);
  if (listo) return listo;
  const tocan: number[][] = Array.from({ length: red.nNodos }, () => []);
  for (let k = 0; k < red.nAristas; k++) {
    tocan[red.desde[k]].push(k);
    if (red.hasta[k] !== red.desde[k]) tocan[red.hasta[k]].push(k);
  }
  tocanRecordado.set(red, tocan);
  return tocan;
}
