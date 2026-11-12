// La puerta al trazado por calles de una ruta ya ordenada (spec 031). Primero la
// red propia, en el teléfono: sin señal, sin cupo y sin mandar los puntos de las
// paradas a nadie, y sabiendo hacia dónde queda apuntando el auto en cada una. Si
// la red no está cargada o algún punto queda lejos de toda calle, OpenRouteService,
// como antes. Devuelve lo mismo en los dos casos (`RutaCalles`), así que la
// pantalla y la ruta guardada no se enteran de quién lo dibujó.
//
// Una parada dentro de un condominio se entrega en su entrada (red/entrada.ts): la
// línea llega a la entrada y Google Maps navega a ella (`destinoParaNavegar`).
import type { Coordenada, Trazado } from "./coordenada";
import { obtenerRutaCalles, type RutaCalles, type TramoDeRuta } from "./ors/direcciones";
import { cargarRed, redCargada } from "./red/grafo";
import { entregaEn } from "./red/entrada";
import { pegarALaRed } from "./red/pegar";
import { trazarPorLaRed } from "./red/trazado-propio";

/** Quién dibujó el último trazado (para Diagnóstico). */
export type OrigenDelTrazado = "red" | "ors" | null;
let ultimoOrigen: OrigenDelTrazado = null;
export const origenDelUltimoTrazado = (): OrigenDelTrazado => ultimoOrigen;

/** El trazado por la red propia, o null si no se puede (red sin cargar, un punto
 *  sin calle cerca o un tramo sin camino). `costo`: ver trazarPorLaRed. */
export async function rutaPorLaRed(
  puntosOrdenados: Coordenada[],
  costo?: (metros: number, segundos: number) => number,
): Promise<RutaCalles | null> {
  if (puntosOrdenados.length < 2) return null;
  const red = await cargarRed();
  if (!red) return null;
  const lugares = [];
  const ultimo = puntosOrdenados.length - 1;
  for (const [k, p] of puntosOrdenados.entries()) {
    // La partida y la llegada se pegan a su calle; las paradas, donde se entregan.
    const pegado = k === 0 || k === ultimo ? pegarALaRed(red, p) : entregaEn(red, p);
    if (!pegado) return null;
    lugares.push({ arista: pegado.arista, fraccion: pegado.fraccion });
  }
  const propios = trazarPorLaRed(red, lugares, costo);
  if (!propios) return null;

  // La misma forma que arma obtenerRutaCalles: una sola línea y, por tramo, dónde
  // empieza y termina en ella.
  const trazado: Trazado = [];
  const tramos: TramoDeRuta[] = [];
  let distanciaM = 0;
  let duracionS = 0;
  for (const t of propios) {
    const inicio = Math.max(0, trazado.length - 1);
    trazado.push(...(trazado.length === 0 ? t.linea : t.linea.slice(1)));
    tramos.push({ desde: inicio, hasta: trazado.length - 1, metros: Math.round(t.metros), segundos: Math.round(t.segundos) });
    distanciaM += t.metros;
    duracionS += t.segundos;
  }
  return { trazado, distanciaM: Math.round(distanciaM), duracionS: Math.round(duracionS), tramos };
}

/** Adonde manda Google Maps «Navegar» para una parada: la entrada de su
 *  condominio si está en uno (dueño, 2026-11-12: «siempre se entra por la entrada
 *  del condominio»), o su punto. No espera a nadie: sin la red en memoria, el punto. */
export function destinoParaNavegar(punto: Coordenada): Coordenada {
  const red = redCargada();
  return (red && entregaEn(red, punto)?.entrada) || punto;
}

/** El trazado por calles de la ruta ya ordenada: la red propia y, si no se puede,
 *  ORS. null si ninguno pudo (el llamador conserva el trazado anterior). */
export async function rutaPorCalles(
  puntosOrdenados: Coordenada[],
  costo?: (metros: number, segundos: number) => number,
): Promise<RutaCalles | null> {
  const propia = await rutaPorLaRed(puntosOrdenados, costo).catch(() => null);
  if (propia) {
    ultimoOrigen = "red";
    return propia;
  }
  const deOrs = await obtenerRutaCalles(puntosOrdenados);
  ultimoOrigen = deOrs ? "ors" : null;
  return deOrs;
}
