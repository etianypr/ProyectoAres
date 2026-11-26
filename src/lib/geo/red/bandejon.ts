// La vuelta por el bandejón (dueño, 2026-11-25: «mucho giro en U»; se cobra como
// una U). En una avenida con bandejón OSM tiene una calle de un sentido por
// calzada, unidas por tramos cortos en cada abertura. Pasar de una calzada a la
// otra por una abertura es dar la vuelta en U, pero para `giro` son dos giros
// cualquiera, que no cuestan nada: la red dejaba 374 vueltas así gratis, contra
// los 12 s de una U en una calle ancha de doble sentido.
//
// Se reconoce mirando tres arcos seguidos: una calzada de un sentido (primaria,
// secundaria o terciaria, o carretera), un tramo de ≤ 40 m y otra calzada así con
// el rumbo al revés (> 150°). Lo cobra `buscar` (caminos.ts), que sabe por qué arco
// llegó al tramo corto. Puro.
import { rumboEntre } from "@/lib/geo/coordenada";
import { clase, formaDelArco, nArcos, UN_SENTIDO, type Red } from "./grafo";

/** El tramo que une las calzadas, como mucho. */
const LARGO_ABERTURA_M = 40;
/** Cuánto tiene que darse vuelta el rumbo de una calzada a la otra. */
const GRADOS_VUELTA = 150;
/** Se mira el rumbo a esta distancia de la punta del arco (la forma de OSM tiene
 *  pedacitos torcidos justo en los cruces). */
const METROS_RUMBO = 10;

type Rumbos = {
  /** Por arco: el rumbo con que sale de su principio y con que llega a su final. */
  alSalir: Float32Array;
  alLlegar: Float32Array;
  /** Por arista: 1 si es corta como una abertura del bandejón. */
  corta: Uint8Array;
};
const guardados = new WeakMap<Red, Rumbos>();

const M_POR_GRADO = 111_195;
function metros(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * M_POR_GRADO * cos, (b[1] - a[1]) * M_POR_GRADO);
}

/** El rumbo de una línea [lng, lat] desde su principio, mirando ~10 m adelante. */
function rumboDesdeElPrincipio(puntos: [number, number][]): number {
  let k = 1;
  let recorrido = metros(puntos[0], puntos[1]);
  while (k < puntos.length - 1 && recorrido < METROS_RUMBO) {
    recorrido += metros(puntos[k], puntos[k + 1]);
    k++;
  }
  const [a, b] = [puntos[0], puntos[k]];
  return rumboEntre({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
}

function rumbosDe(red: Red): Rumbos {
  const listos = guardados.get(red);
  if (listos) return listos;
  const total = nArcos(red);
  const alSalir = new Float32Array(total);
  const alLlegar = new Float32Array(total);
  for (let arco = 0; arco < total; arco++) {
    const puntos = formaDelArco(red, arco);
    alSalir[arco] = rumboDesdeElPrincipio(puntos);
    // Al llegar: el rumbo desde ~10 m antes del final, hacia el final.
    alLlegar[arco] = (rumboDesdeElPrincipio([...puntos].reverse()) + 180) % 360;
  }
  const corta = new Uint8Array(red.nAristas);
  for (let k = 0; k < red.nAristas; k++) corta[k] = red.largo[k] <= LARGO_ABERTURA_M ? 1 : 0;
  const rumbos = { alSalir, alLlegar, corta };
  guardados.set(red, rumbos);
  return rumbos;
}

/** Una calzada de una avenida con bandejón: de un sentido y ancha (clase 0 a 3). */
const esCalzada = (red: Red, arco: number) => !!(red.codigo[arco >> 1] & UN_SENTIDO) && clase(red.codigo[arco >> 1]) <= 3;

/** ¿Ir por `anterior`, cruzar por `abertura` y seguir por `sale` es dar la vuelta
 *  por el bandejón? */
export function esVueltaPorElBandejon(red: Red, anterior: number, abertura: number, sale: number): boolean {
  const rumbos = rumbosDe(red);
  if (!rumbos.corta[abertura >> 1] || !esCalzada(red, anterior) || !esCalzada(red, sale)) return false;
  const d = Math.abs(rumbos.alLlegar[anterior] - rumbos.alSalir[sale]) % 360;
  return (d > 180 ? 360 - d : d) > GRADOS_VUELTA;
}

/** ¿Vale la pena mirar los arcos que siguen a este? Solo si es corto. */
export const puedeSerAbertura = (red: Red, arco: number) => rumbosDe(red).corta[arco >> 1] === 1;
