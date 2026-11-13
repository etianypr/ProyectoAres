// La red de calles propia en el armado del día (spec 031; dueño, 2026-11-12: «no
// debería reordenarla sino generar la ruta sin errores sabiendo toda esta
// información»).
//
// Antes el orden salía de una matriz de punto a punto (ORS), que supone que en
// cada parada el auto gira en U gratis, y después se corregía. Acá las distancias
// salen de la red de Arica que la app lleva adentro (geo/red/): cada tramo se mide
// saliendo de una parada hacia donde quedó apuntando el auto y llegando a la otra
// en el sentido de su calle, y la búsqueda elige el orden y el sentido de paso a
// la vez (rutas/orden-paradas/con-rumbo*.ts). Todo en el teléfono: sin señal, sin
// cupo y sin mandar los puntos de las paradas a nadie.
import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { cargarRed } from "@/lib/geo/red/grafo";
import { pegarALaRed } from "@/lib/geo/red/pegar";
import { entregaEn } from "@/lib/geo/red/entrada";
import { armarMatrizConRumbo, type MatrizConRumbo } from "@/lib/geo/red/matriz-con-rumbo";
import { mejoresEstados, tableroDe, type DiaConRumbo } from "@/lib/rutas/orden-paradas/con-rumbo";
import { buscarConRumbo } from "@/lib/rutas/orden-paradas/con-rumbo-busqueda";
import { adelantarBultosConRumbo } from "@/lib/rutas/orden-paradas/descarga-con-rumbo";
import { correrSinCongelar } from "@/lib/rutas/orden-paradas/sin-congelar";
import { FACTOR_CALLES } from "../planificar";
import { METROS_POR_PARADA, TOLERANCIA_DESCARGA } from "./bultos";
import { pesosDeManejar } from "./pesos";

/** Dos lugares sin camino entre sí: lejos, pero finito (como en geo/matriz.ts). */
const METROS_SIN_CAMINO = 20_000;

export type RedDelDia = {
  conRumbo: MatrizConRumbo;
  /** De lugar a lugar, lo mejor de sus sentidos: lo que mediría una matriz de ORS.
   *  La usan las cuentas que no saben de rumbo (horarios, paradas lejanas). Con los
   *  mismos índices que los puntos: el 0 es la partida. */
  metros: number[][];
  segundos: (number | null)[][];
  /** El día para la búsqueda con rumbo: de estado a estado, en pesos. */
  dia: DiaConRumbo;
};

/** Pega los puntos a la red y mide entre todos. `puntos[0]` es la partida; si la
 *  ruta termina en otro lado, el último es la llegada. null si no se puede: la red
 *  no está cargada (primera vez sin señal) o un punto queda lejos de toda calle. */
export async function prepararRedDelDia(
  puntos: Coordenada[],
  terminaEnOtroLado: boolean,
  /** «Cancelar» mientras busca (spec 033): lanza AbortError entre tandas. */
  senal?: AbortSignal,
): Promise<RedDelDia | null> {
  const red = await cargarRed();
  if (!red) return null;
  const lugares = [];
  for (let i = 0; i < puntos.length; i++) {
    const libre = i === 0 || (terminaEnOtroLado && i === puntos.length - 1);
    // Una parada dentro de un condominio se entrega en su entrada (geo/red/entrada.ts).
    const pegado = libre ? pegarALaRed(red, puntos[i]) : entregaEn(red, puntos[i]);
    if (!pegado) return null;
    lugares.push({ arista: pegado.arista, fraccion: pegado.fraccion, libre });
  }
  const conRumbo = await correrSinCongelar(armarMatrizConRumbo(red, lugares), senal);
  const { n, estadosDe } = conRumbo;

  const costo = new Float64Array(n * n);
  for (let k = 0; k < n * n; k++) costo[k] = pesosDeManejar(conRumbo.metros[k], conRumbo.segundos[k]);
  const metros: number[][] = [];
  const segundos: (number | null)[][] = [];
  for (let i = 0; i < puntos.length; i++) {
    metros.push([]);
    segundos.push([]);
    for (let j = 0; j < puntos.length; j++) {
      let mejor = -1;
      for (const a of estadosDe[i]) for (const b of estadosDe[j]) if (mejor < 0 || costo[a * n + b] < costo[mejor]) mejor = a * n + b;
      const hayCamino = i === j || Number.isFinite(costo[mejor]);
      metros[i].push(i === j ? 0 : hayCamino ? conRumbo.metros[mejor] : distanciaMetros(puntos[i], puntos[j]) * FACTOR_CALLES + METROS_SIN_CAMINO);
      segundos[i].push(i === j ? 0 : hayCamino ? conRumbo.segundos[mejor] : null);
    }
  }
  return { conRumbo, metros, segundos, dia: { n, costo, estadosDe, fin: terminaEnOtroLado ? puntos.length - 1 : 0 } };
}

/**
 * El orden con rumbo: los índices de las paradas (1…m, como en `puntos`) en el
 * orden de visita. `arranque`: un orden del que partir (el de ordenarParadas, sin
 * rumbo): el resultado nunca cuesta más que él. `bultos`: los de cada punto; se
 * adelantan si sale casi gratis (spec 024).
 */
export async function ordenarConRumboDelDia(
  red: RedDelDia,
  arranque: number[],
  bultos: number[],
  /** «Cancelar» mientras busca (spec 033); sin cancelar, el orden es el mismo. */
  senal?: AbortSignal,
): Promise<number[]> {
  const ruta = await correrSinCongelar(buscarConRumbo(red.dia, [arranque]), senal);
  const conBultos = adelantarBultosConRumbo(tableroDe(red.dia), ruta, {
    bultos,
    metros: red.conRumbo.metros,
    tolerancia: TOLERANCIA_DESCARGA,
    metrosPorParada: METROS_POR_PARADA,
  });
  return conBultos.orden;
}

/** Lo que mide un orden de paradas (índices de `puntos`) con el mejor sentido de
 *  cada una: metros y pesos. Con esto se comparan las alternativas entre sí. */
export function medirConRumbo(red: RedDelDia, orden: number[]): { metros: number; pesos: number } {
  const { n, estadosDe } = red.conRumbo;
  const ruta = mejoresEstados(tableroDe(red.dia), orden);
  const fin = red.dia.fin;
  const estados = [estadosDe[0][0], ...ruta.estados, ...(fin >= 0 ? [estadosDe[fin][0]] : [])];
  let metros = 0;
  for (let k = 1; k < estados.length; k++) metros += red.conRumbo.metros[estados[k - 1] * n + estados[k]];
  return { metros, pesos: ruta.costo };
}
