// La matriz con rumbo (spec 031): lo que cuesta ir de una parada a otra sabiendo
// en qué sentido pasa el auto por la calle de cada una.
//
// Cada parada tiene uno o dos ESTADOS: el sentido en que el auto recorre su calle
// al pasar por ella (uno solo si la calle es de un sentido). De un estado a otro
// se mide saliendo de la primera parada en su sentido —sin devolverse, salvo donde
// la calle lo permite (caminos.ts)— y llegando a la segunda circulando en el suyo.
// La central no tiene sentido: se sale y se llega como convenga.
//
// Así el orden deja de suponer que en cada parada se gira en U gratis: la matriz
// de ORS mide de punto a punto y no sabe con qué rumbo se llega. Pura, sin red.
import { arcoValido, type Red } from "./grafo";
import { buscar, crearBusqueda, llegada, salidasDe, type Llegada, type Reglas } from "./caminos";

/** Un lugar pegado a la red (ver pegar.ts). `libre`: la central. */
export type Lugar = { arista: number; fraccion: number; libre?: boolean };

export type MatrizConRumbo = {
  /** Cantidad de estados. */
  n: number;
  /** De cada estado: su lugar y su sentido (0 hacia `hasta`, 1 hacia `desde`; −1 la central). */
  lugarDe: Int32Array;
  sentidoDe: Int8Array;
  /** Los estados de cada lugar (uno o dos). */
  estadosDe: number[][];
  /** De estado a estado, [desde · n + hasta]. Infinity si no hay camino. */
  metros: Float64Array;
  segundos: Float64Array;
};

/** El arco y la parte de él que se recorre para llegar al lugar en ese sentido. */
const alLlegar = (l: Lugar, sentido: 0 | 1) => ({ arco: 2 * l.arista + sentido, fraccion: sentido === 0 ? l.fraccion : 1 - l.fraccion });

/** La matriz, por partes: cede después de cada búsqueda para no congelar la pantalla. */
export function* armarMatrizConRumbo(red: Red, lugares: Lugar[], reglas: Reglas = {}): Generator<void, MatrizConRumbo> {
  const lugarDe: number[] = [];
  const sentidoDe: number[] = [];
  const estadosDe: number[][] = lugares.map(() => []);
  lugares.forEach((l, i) => {
    const sentidos = l.libre || reglas.libre ? [-1] : ([0, 1] as const).filter((s) => arcoValido(red, 2 * l.arista + s));
    for (const s of sentidos) {
      estadosDe[i].push(lugarDe.length);
      lugarDe.push(i);
      sentidoDe.push(s);
    }
  });
  const n = lugarDe.length;
  const metros = new Float64Array(n * n).fill(Infinity);
  const segundos = new Float64Array(n * n).fill(Infinity);
  const b = crearBusqueda(red);
  const sentidosValidos = (l: Lugar) => ([0, 1] as const).filter((s) => arcoValido(red, 2 * l.arista + s));
  const destinos = lugares.flatMap((l) => sentidosValidos(l).map((s) => 2 * l.arista + s));

  for (let desde = 0; desde < n; desde++) {
    const origen = lugares[lugarDe[desde]];
    const sentido = sentidoDe[desde];
    buscar(b, salidasDe(red, origen.arista, origen.fraccion, sentido < 0 ? null : (sentido as 0 | 1), reglas), reglas, destinos);
    for (let hasta = 0; hasta < n; hasta++) {
      if (lugarDe[hasta] === lugarDe[desde]) {
        if (hasta === desde) metros[desde * n + hasta] = segundos[desde * n + hasta] = 0;
        continue;
      }
      const destino = lugares[lugarDe[hasta]];
      let mejor: Llegada | null = null;
      // A la central se llega en el sentido que convenga; a una parada, en el suyo.
      for (const s of sentidoDe[hasta] < 0 ? sentidosValidos(destino) : [sentidoDe[hasta] as 0 | 1]) {
        const { arco, fraccion } = alLlegar(destino, s);
        const l = llegada(b, arco, fraccion);
        if (l && (!mejor || l.peso < mejor.peso)) mejor = l;
      }
      if (mejor) {
        metros[desde * n + hasta] = mejor.metros;
        segundos[desde * n + hasta] = mejor.segundos;
      }
    }
    yield;
  }
  return { n, lugarDe: Int32Array.from(lugarDe), sentidoDe: Int8Array.from(sentidoDe), estadosDe, metros, segundos };
}

/** La matriz de un tirón (pruebas y mediciones). */
export function matrizConRumbo(red: Red, lugares: Lugar[], reglas: Reglas = {}): MatrizConRumbo {
  const pasos = armarMatrizConRumbo(red, lugares, reglas);
  let paso = pasos.next();
  while (!paso.done) paso = pasos.next();
  return paso.value;
}
