// La línea desde el auto hasta la parada activa cuando el conductor se salió de la
// del día (spec 047, «ARES se encarga de la navegación»). Antes, a más de 90 m del
// tramo la línea naranja desaparecía y quedaba la distancia en línea recta.
//
// Sale de la red propia (spec 031), como la línea del día: sin señal, sin cupo y
// sin mandar el punto a nadie. El auto parte por su calle hacia donde apunta (el
// rumbo del GPS), con las mismas reglas de giro: en una calle angosta no se da la
// vuelta. Llega a la parada en el sentido en que llegaba la línea del día si se
// sabe, porque así la planeó ARES para seguir a la próxima; si ese sentido cuesta
// mucho más, el otro. Puro.
import { rumboEntre, type Coordenada, type Trazado } from "@/lib/geo/coordenada";
import { arcoValido, formaDelArco, type Red } from "./grafo";
import { buscar, crearBusqueda, llegada, salidasDe, type Busqueda, type Llegada } from "./caminos";
import { aristaConexa, sentidosDePaso } from "./conexa";
import { entregaEn } from "./entrada";
import { pegarALaRed } from "./pegar";
import { lineaHasta } from "./trazado-propio";

/** Más lejos que esto de toda calle, el auto no está en la red (un estacionamiento
 *  grande, el GPS perdido): no se traza. */
const RADIO_AUTO_M = 60;
/** Un sentido de la calle «es» hacia donde va el auto si difiere en menos que esto. */
const GRADOS_MISMO_SENTIDO = 90;
/** Llegar al revés de como planeó ARES se acepta solo si ahorra más que esto. */
const SEGUNDOS_POR_LLEGAR_AL_REVES = 90;

const M_POR_GRADO = 111_195;
const busquedas = new WeakMap<Red, Busqueda>();

/** Diferencia entre dos rumbos, 0-180. */
const difAngulo = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Hacia dónde va el arco en la parte `parte` de su recorrido (0 su principio, 1 su final). */
export function rumboDelArcoEn(red: Red, arco: number, parte: number): number {
  const puntos = formaDelArco(red, arco);
  const cos = Math.cos((puntos[0][1] * Math.PI) / 180);
  const largos = puntos.slice(1).map((p, k) => Math.hypot((p[0] - puntos[k][0]) * M_POR_GRADO * cos, (p[1] - puntos[k][1]) * M_POR_GRADO));
  const total = largos.reduce((a, b) => a + b, 0);
  let falta = Math.min(1, Math.max(0, parte)) * total;
  let k = 0;
  while (k < largos.length - 1 && falta > largos[k]) falta -= largos[k++];
  const [a, b] = [puntos[k], puntos[k + 1]];
  return rumboEntre({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
}

/** El sentido de la arista (0 hacia `hasta`, 1 hacia `desde`) que va hacia `rumbo`
 *  en ese punto, o null si ninguno de los que permite la calle va para allá (el GPS
 *  pegó el auto a la calle de al lado): entonces se parte hacia donde convenga. */
export function sentidoSegunRumbo(red: Red, arista: number, fraccion: number, rumbo: number): 0 | 1 | null {
  let mejor: { s: 0 | 1; dif: number } | null = null;
  for (const s of [0, 1] as const) {
    const arco = 2 * arista + s;
    if (!arcoValido(red, arco)) continue;
    const dif = difAngulo(rumboDelArcoEn(red, arco, s === 0 ? fraccion : 1 - fraccion), rumbo);
    if (dif <= GRADOS_MISMO_SENTIDO && (!mejor || dif < mejor.dif)) mejor = { s, dif };
  }
  return mejor?.s ?? null;
}

export type CaminoDesdeElAuto = { linea: Trazado; metros: number; segundos: number };

/**
 * El camino más rápido desde el auto hasta donde se entrega `parada` (en un
 * condominio, su entrada). `rumbo`: hacia dónde va el auto (null = no se sabe).
 * `rumboLlegada`: con qué rumbo llegaba la línea del día a la parada (null = da
 * igual). null si el auto o la parada quedan lejos de toda calle, o no hay camino.
 */
export function trazarDesdeElAuto(
  red: Red,
  auto: Coordenada,
  rumbo: number | null,
  parada: Coordenada,
  rumboLlegada: number | null = null,
): CaminoDesdeElAuto | null {
  // Cualquier calle de la parte conexa: también rotondas y enlaces, que no sirven
  // para entregar (dondeSePara) pero sí para ir manejando.
  const pegado = pegarALaRed(red, auto, RADIO_AUTO_M, aristaConexa);
  const entrega = entregaEn(red, parada);
  if (!pegado || !entrega) return null;

  const sentido = rumbo == null ? null : sentidoSegunRumbo(red, pegado.arista, pegado.fraccion, rumbo);
  const salidas = salidasDe(red, pegado.arista, pegado.fraccion, sentido);
  if (salidas.length === 0) return null;
  let b = busquedas.get(red);
  if (!b) busquedas.set(red, (b = crearBusqueda(red)));
  const llegan = sentidosDePaso(red, entrega.arista);
  buscar(b, salidas, {}, llegan.map((s) => 2 * entrega.arista + s));

  let mejor: { l: Llegada; arco: number; fraccion: number; peso: number } | null = null;
  for (const s of llegan) {
    const arco = 2 * entrega.arista + s;
    const fraccion = s === 0 ? entrega.fraccion : 1 - entrega.fraccion;
    const l = llegada(b, arco, fraccion);
    if (!l) continue;
    const alReves = rumboLlegada != null && difAngulo(rumboDelArcoEn(red, arco, fraccion), rumboLlegada) > GRADOS_MISMO_SENTIDO;
    const peso = l.peso + (alReves ? SEGUNDOS_POR_LLEGAR_AL_REVES : 0);
    if (!mejor || peso < mejor.peso) mejor = { l, arco, fraccion, peso };
  }
  if (!mejor) return null;
  return { linea: lineaHasta(b, mejor.arco, mejor.fraccion, mejor.l), metros: mejor.l.metros, segundos: mejor.l.segundos };
}
