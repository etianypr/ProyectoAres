// El trazado por calles sacado de la red propia (spec 031): la línea que se dibuja
// en el mapa y los metros y segundos de cada tramo, para una lista de puntos YA
// ordenada. Reemplaza al trazado de ORS en el camino normal: sin red, sin cupo y
// sin mandar los puntos de las paradas a nadie.
//
// Cada punto del medio es una parada: el auto pasa por ella en un sentido y sigue
// en ese sentido (salvo donde la calle deja dar la vuelta, caminos.ts). Para una
// lista dada, el sentido de cada parada se elige exacto —el que menos cuesta en
// total— y la línea sale de los caminos de esos sentidos. El primer punto y el
// último (la partida y la llegada) no tienen sentido. Puro.
import type { Trazado } from "@/lib/geo/coordenada";
import { arcoValido, formaDelArco, type Red } from "./grafo";
import { buscar, caminoHasta, crearBusqueda, llegada, salidasDe, type Busqueda, type Llegada, type Reglas } from "./caminos";
import type { Lugar } from "./matriz-con-rumbo";

/** El camino entre dos puntos seguidos de la lista. */
export type TramoPropio = { linea: Trazado; metros: number; segundos: number };

const M_POR_GRADO = 111_195;

/** Los puntos del arco entre dos partes de su recorrido (0 su principio, 1 su final). */
function pedazo(red: Red, arco: number, desde: number, hasta: number): Trazado {
  const puntos = formaDelArco(red, arco);
  const cos = Math.cos((puntos[0][1] * Math.PI) / 180);
  const acumulado = [0];
  for (let k = 1; k < puntos.length; k++) {
    acumulado.push(acumulado[k - 1] + Math.hypot((puntos[k][0] - puntos[k - 1][0]) * M_POR_GRADO * cos, (puntos[k][1] - puntos[k - 1][1]) * M_POR_GRADO));
  }
  const total = acumulado[acumulado.length - 1];
  const en = (parte: number): [number, number] => {
    const metros = Math.min(1, Math.max(0, parte)) * total;
    let k = 1;
    while (k < puntos.length - 1 && acumulado[k] < metros) k++;
    const largo = acumulado[k] - acumulado[k - 1];
    const f = largo > 0 ? (metros - acumulado[k - 1]) / largo : 0;
    return [puntos[k - 1][0] + f * (puntos[k][0] - puntos[k - 1][0]), puntos[k - 1][1] + f * (puntos[k][1] - puntos[k - 1][1])];
  };
  const salida: Trazado = [en(desde)];
  for (let k = 1; k < puntos.length - 1; k++) {
    if (acumulado[k] > desde * total && acumulado[k] < hasta * total) salida.push(puntos[k]);
  }
  salida.push(en(hasta));
  return salida;
}

/** Pega dos pedazos de línea sin repetir el punto en que se tocan. */
function pegar(linea: Trazado, mas: Trazado): void {
  for (const p of mas) {
    const ultimo = linea[linea.length - 1];
    if (!ultimo || ultimo[0] !== p[0] || ultimo[1] !== p[1]) linea.push(p);
  }
}

/** La línea del camino que la última búsqueda encontró hasta ese punto del arco. */
function lineaHasta(b: Busqueda, arco: number, fraccion: number, l: Llegada): Trazado {
  const { red } = b;
  const dondeSale = (salida: number) => {
    const s = b.salidas[salida];
    const largo = red.largo[s.arco >> 1];
    return largo > 0 ? 1 - s.metros / largo : 0;
  };
  if (l.directa >= 0) return pedazo(red, arco, dondeSale(l.directa), fraccion);
  const { arcos, salida } = caminoHasta(b, arco);
  const linea: Trazado = [];
  arcos.forEach((a, k) => {
    const desde = k === 0 && salida >= 0 ? dondeSale(salida) : 0;
    pegar(linea, pedazo(red, a, desde, k === arcos.length - 1 ? fraccion : 1));
  });
  return linea;
}

/**
 * El trazado de una lista de lugares ya ordenada: el primero y el último, libres;
 * los del medio, paradas. `costo` dice lo que cuesta un tramo de tantos metros y
 * segundos (por defecto, los segundos): con eso se elige el sentido de cada parada.
 * null si algún tramo no tiene camino.
 */
export function trazarPorLaRed(
  red: Red,
  lugares: Lugar[],
  costo: (metros: number, segundos: number) => number = (_m, s) => s,
  reglas: Reglas = {},
): TramoPropio[] | null {
  if (lugares.length < 2) return [];
  const b = crearBusqueda(red);
  const ultimo = lugares.length - 1;
  const sentidosDe = (k: number): (0 | 1 | null)[] =>
    k === 0 || k === ultimo || lugares[k].libre ? [null] : ([0, 1] as const).filter((s) => arcoValido(red, 2 * lugares[k].arista + s));
  // Por tramo: de cada sentido del punto k a cada sentido del k + 1, su camino.
  type Paso = { costo: number; tramo: TramoPropio } | null;
  const pasos: Paso[][][] = [];
  for (let k = 0; k < ultimo; k++) {
    const origen = lugares[k];
    const destino = lugares[k + 1];
    const llegan = sentidosDe(k + 1);
    const destinos = ([0, 1] as const).filter((s) => arcoValido(red, 2 * destino.arista + s)).map((s) => 2 * destino.arista + s);
    pasos.push(
      sentidosDe(k).map((sale) => {
        buscar(b, salidasDe(red, origen.arista, origen.fraccion, sale, reglas), reglas, destinos);
        return llegan.map((llega): Paso => {
          let mejor: { l: Llegada; arco: number; fraccion: number } | null = null;
          for (const s of llega === null ? ([0, 1] as const) : [llega]) {
            const arco = 2 * destino.arista + s;
            if (!arcoValido(red, arco)) continue;
            const fraccion = s === 0 ? destino.fraccion : 1 - destino.fraccion;
            const l = llegada(b, arco, fraccion);
            if (l && (!mejor || l.peso < mejor.l.peso)) mejor = { l, arco, fraccion };
          }
          if (!mejor) return null;
          const { l, arco, fraccion } = mejor;
          return { costo: costo(l.metros, l.segundos), tramo: { linea: lineaHasta(b, arco, fraccion, l), metros: l.metros, segundos: l.segundos } };
        });
      }),
    );
  }
  // El mejor sentido de cada parada para esta lista: de atrás para adelante.
  const resto: number[][] = [sentidosDe(ultimo).map(() => 0)];
  const sigue: number[][] = [];
  for (let k = ultimo - 1; k >= 0; k--) {
    const mejor: number[] = [];
    const cual: number[] = [];
    pasos[k].forEach((desdeAca, a) => {
      let minimo = Infinity;
      let elegido = -1;
      desdeAca.forEach((paso, z) => {
        const total = paso ? paso.costo + resto[0][z] : Infinity;
        if (total < minimo) {
          minimo = total;
          elegido = z;
        }
      });
      mejor[a] = minimo;
      cual[a] = elegido;
    });
    resto.unshift(mejor);
    sigue.unshift(cual);
  }
  if (!Number.isFinite(resto[0][0])) return null;
  const tramos: TramoPropio[] = [];
  let a = 0;
  for (let k = 0; k < ultimo; k++) {
    const z = sigue[k][a];
    tramos.push(pasos[k][a][z]!.tramo);
    a = z;
  }
  return tramos;
}
