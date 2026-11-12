// La red de calles de Arica en memoria (spec 031): nodos, aristas y lo que hace
// falta para buscar caminos sabiendo hacia dónde apunta el auto. Sale de
// red-arica.ts (OpenStreetMap, generado por scripts/generar-red.mjs).
//
// Cada arista (un tramo de calle entre dos cruces) tiene dos ARCOS, uno por
// sentido: el 2·arista va de `desde` a `hasta` y el 2·arista + 1, al revés. En una
// calle de un solo sentido el segundo no existe. Un camino es una lista de arcos,
// y así «por dónde vengo» es parte del estado: es lo que permite prohibir el giro
// en U y respetar las restricciones de giro. Puro, sin red.
import { distanciaMetros } from "@/lib/geo/coordenada";
import { leerEnteros } from "./codigo";

/** Lo que guarda red-arica.ts. */
export type DatosDeRed = { fecha: string; nodos: string; aristas: string; giros: string; cerrados: string; portones: string };

/** Bits del código de una arista, encima de la clase (los pone generar-red.mjs). */
export const UN_SENTIDO = 16;
export const PRIVADA = 32;
export const SIN_PARADA = 64;
/** Clases de calle, de la más ancha a la más angosta: 0 carretera · 1 primaria ·
 *  2 secundaria · 3 terciaria · 4 sin clasificar · 5 residencial · 6 calle de
 *  convivencia · 7 de servicio (pasajes, accesos) · 8 huella. */
export const clase = (codigo: number) => codigo & 15;
/** Donde cabe dar la vuelta: de la carretera a la calle sin clasificar. Es la
 *  misma línea que usaba el trazado de ORS (vuelta.ts: «carretera» y «principal»),
 *  que es lo que pidió el dueño: en residenciales y pasajes no se da la vuelta. */
export const esAncha = (codigo: number) => clase(codigo) <= 4;

export type Red = {
  fecha: string;
  nNodos: number;
  nAristas: number;
  /** Por nodo. */
  lat: Float64Array;
  lng: Float64Array;
  /** 1 si una barrera no deja pasar por el nodo; 2 si es un portón privado (se
   *  pasa solo para llegar a una parada, no para acortar camino). */
  cerrado: Uint8Array;
  /** Por arista. */
  desde: Int32Array;
  hasta: Int32Array;
  codigo: Uint8Array;
  /** La máxima anotada en km/h (0 si no hay), más 1000 si no está pavimentada. */
  vel: Uint16Array;
  /** Metros, por la forma de la calle. */
  largo: Float64Array;
  /** 1 si la arista está en un fondo de saco: por ahí no se sale a ninguna parte. */
  sinSalida: Uint8Array;
  /** Los puntos intermedios de la arista k: formaLat/formaLng[formaInicio[k] … formaInicio[k+1]). */
  formaInicio: Int32Array;
  formaLat: Float64Array;
  formaLng: Float64Array;
  /** Los arcos que salen del nodo n: salen[salenInicio[n] … salenInicio[n+1]). */
  salenInicio: Int32Array;
  salen: Int32Array;
  /** Giros prohibidos: arcoQueLlega · nArcos + arcoQueSale. */
  prohibidos: Set<number>;
  /** Por arco: 1 si llegando por él hay algún giro prohibido (para no mirar el
   *  conjunto en cada esquina: son unas decenas en toda la ciudad). */
  conGiros: Uint8Array;
};

export const nArcos = (red: Red) => red.nAristas * 2;
export const aristaDe = (arco: number) => arco >> 1;
/** El nodo donde termina el arco. */
export const cabeza = (red: Red, arco: number) => (arco & 1 ? red.desde[arco >> 1] : red.hasta[arco >> 1]);
/** El nodo donde empieza. */
export const cola = (red: Red, arco: number) => (arco & 1 ? red.hasta[arco >> 1] : red.desde[arco >> 1]);
/** ¿Se puede recorrer la arista en ese sentido? */
export const arcoValido = (red: Red, arco: number) => !(arco & 1) || !(red.codigo[arco >> 1] & UN_SENTIDO);

/** Arma la red a partir del texto compacto. */
export function armarRed(datos: DatosDeRed): Red {
  const n = leerEnteros(datos.nodos);
  const nNodos = n.length / 2;
  const lat = new Float64Array(nNodos);
  const lng = new Float64Array(nNodos);
  let la = 0;
  let lo = 0;
  for (let i = 0; i < nNodos; i++) {
    la += n[2 * i];
    lo += n[2 * i + 1];
    lat[i] = la / 1e6;
    lng[i] = lo / 1e6;
  }

  const a = leerEnteros(datos.aristas);
  const desde: number[] = [];
  const hasta: number[] = [];
  const codigo: number[] = [];
  const vel: number[] = [];
  const largo: number[] = [];
  const formaInicio: number[] = [0];
  const formaLat: number[] = [];
  const formaLng: number[] = [];
  for (let k = 0; k < a.length; ) {
    const d = a[k++];
    const h = a[k++];
    const c = a[k++];
    const v = a[k++];
    const medios = a[k++];
    let previo = { lat: lat[d], lng: lng[d] };
    let pLat = Math.round(lat[d] * 1e6);
    let pLng = Math.round(lng[d] * 1e6);
    let metros = 0;
    for (let m = 0; m < medios; m++) {
      pLat += a[k++];
      pLng += a[k++];
      const punto = { lat: pLat / 1e6, lng: pLng / 1e6 };
      metros += distanciaMetros(previo, punto);
      formaLat.push(punto.lat);
      formaLng.push(punto.lng);
      previo = punto;
    }
    metros += distanciaMetros(previo, { lat: lat[h], lng: lng[h] });
    desde.push(d);
    hasta.push(h);
    codigo.push(c);
    vel.push(v);
    largo.push(metros);
    formaInicio.push(formaLat.length);
  }
  const nAristas = desde.length;

  const cerrado = new Uint8Array(nNodos);
  for (const i of leerEnteros(datos.cerrados)) cerrado[i] = 1;
  for (const i of leerEnteros(datos.portones)) cerrado[i] = 2;

  const red: Red = {
    fecha: datos.fecha,
    nNodos,
    nAristas,
    lat,
    lng,
    cerrado,
    desde: Int32Array.from(desde),
    hasta: Int32Array.from(hasta),
    codigo: Uint8Array.from(codigo),
    vel: Uint16Array.from(vel),
    largo: Float64Array.from(largo),
    sinSalida: new Uint8Array(nAristas),
    formaInicio: Int32Array.from(formaInicio),
    formaLat: Float64Array.from(formaLat),
    formaLng: Float64Array.from(formaLng),
    salenInicio: new Int32Array(nNodos + 1),
    salen: new Int32Array(0),
    prohibidos: new Set(),
    conGiros: new Uint8Array(nAristas * 2),
  };
  ponerSalidas(red);
  marcarSinSalida(red);
  ponerGiros(red, leerEnteros(datos.giros));
  return red;
}

/** Los arcos que salen de cada nodo, todos juntos y por nodo. */
function ponerSalidas(red: Red): void {
  const cuenta = new Int32Array(red.nNodos + 1);
  const total = nArcos(red);
  for (let arco = 0; arco < total; arco++) if (arcoValido(red, arco)) cuenta[cola(red, arco) + 1]++;
  for (let i = 0; i < red.nNodos; i++) cuenta[i + 1] += cuenta[i];
  const salen = new Int32Array(cuenta[red.nNodos]);
  const puesto = cuenta.slice(0, red.nNodos);
  for (let arco = 0; arco < total; arco++) if (arcoValido(red, arco)) salen[puesto[cola(red, arco)]++] = arco;
  red.salenInicio = cuenta;
  red.salen = salen;
}

/** Marca las aristas de los fondos de saco: se van sacando las que cuelgan de un
 *  nodo sin otra salida (o de una barrera), hasta que no queda ninguna. Ahí se
 *  sale en reversa (dueño, 2026-11-12). No mira el sentido de las calles. */
function marcarSinSalida(red: Red): void {
  const grado = new Int32Array(red.nNodos);
  const tocan: number[][] = Array.from({ length: red.nNodos }, () => []);
  for (let k = 0; k < red.nAristas; k++) {
    grado[red.desde[k]]++;
    grado[red.hasta[k]]++;
    tocan[red.desde[k]].push(k);
    tocan[red.hasta[k]].push(k);
  }
  const hojas: number[] = [];
  for (let i = 0; i < red.nNodos; i++) if (grado[i] === 1 || red.cerrado[i]) hojas.push(i);
  while (hojas.length > 0) {
    const nodo = hojas.pop()!;
    for (const k of tocan[nodo]) {
      if (red.sinSalida[k]) continue;
      // De una barrera cuelgan todas sus aristas; de una hoja, la única que le queda.
      red.sinSalida[k] = 1;
      const otro = red.desde[k] === nodo ? red.hasta[k] : red.desde[k];
      if (otro !== nodo && --grado[otro] === 1 && !red.cerrado[otro]) hojas.push(otro);
    }
  }
}

/** Las restricciones de giro de OSM: «no por ahí» prohíbe ese giro; «solo por
 *  ahí» prohíbe todos los demás desde esa arista en ese nodo. */
function ponerGiros(red: Red, giros: number[]): void {
  const total = nArcos(red);
  // El arco de la arista que llega al nodo, y el que sale de él.
  const queLlega = (arista: number, nodo: number) => (red.hasta[arista] === nodo ? 2 * arista : 2 * arista + 1);
  const queSale = (arista: number, nodo: number) => (red.desde[arista] === nodo ? 2 * arista : 2 * arista + 1);
  for (let k = 0; k + 3 < giros.length; k += 4) {
    const [de, nodo, a, solo] = [giros[k], giros[k + 1], giros[k + 2], giros[k + 3]];
    const llega = queLlega(de, nodo);
    const permitido = queSale(a, nodo);
    red.conGiros[llega] = 1;
    if (!solo) {
      red.prohibidos.add(llega * total + permitido);
      continue;
    }
    for (let s = red.salenInicio[nodo]; s < red.salenInicio[nodo + 1]; s++) {
      if (red.salen[s] !== permitido) red.prohibidos.add(llega * total + red.salen[s]);
    }
  }
}

/** Los puntos de un arco, del principio al final, como [lng, lat]. */
export function formaDelArco(red: Red, arco: number): [number, number][] {
  const k = arco >> 1;
  const puntos: [number, number][] = [[red.lng[red.desde[k]], red.lat[red.desde[k]]]];
  for (let m = red.formaInicio[k]; m < red.formaInicio[k + 1]; m++) puntos.push([red.formaLng[m], red.formaLat[m]]);
  puntos.push([red.lng[red.hasta[k]], red.lat[red.hasta[k]]]);
  return arco & 1 ? puntos.reverse() : puntos;
}

let cargada: Promise<Red | null> | null = null;
let lista: Red | null = null;

// El interruptor (spec 031): la ruta se arma con la red propia, y OpenRouteService
// queda de respaldo. Si un día la red propia falla en terreno, el conductor elige
// en Diagnóstico armar la ruta con ORS, como antes, sin esperar una versión nueva.
const CLAVE_APAGADA = "ares.ruta-con-ors";
let apagada: boolean | null = null;

/** ¿Se eligió armar la ruta con OpenRouteService en Diagnóstico? Por defecto, no. */
export function redApagada(): boolean {
  if (apagada !== null) return apagada;
  try {
    return globalThis.localStorage?.getItem(CLAVE_APAGADA) === "si";
  } catch {
    return false;
  }
}

export function apagarRed(elegido: boolean): void {
  apagada = elegido;
  try {
    if (elegido) globalThis.localStorage?.setItem(CLAVE_APAGADA, "si");
    else globalThis.localStorage?.removeItem(CLAVE_APAGADA);
  } catch {
    // Sin localStorage vale hasta que se cierre la app.
  }
}

/** La red si ya está en memoria (sin esperar): para lo que no puede esperar. */
export const redCargada = (): Red | null => (redApagada() ? null : lista);

/** La red de Arica, cargada la primera vez que hace falta (~320 KB que la pantalla
 *  no necesita para arrancar). Sin señal la primera vez el archivo no baja: se
 *  devuelve null y se vuelve a intentar la próxima, igual que el catálogo de calles. */
export function cargarRed(): Promise<Red | null> {
  if (redApagada()) return Promise.resolve(null);
  cargada ??= import("./red-arica")
    .then(({ RED_ARICA }) => (lista = armarRed(RED_ARICA)))
    .catch(() => {
      cargada = null;
      return null;
    });
  return cargada;
}
