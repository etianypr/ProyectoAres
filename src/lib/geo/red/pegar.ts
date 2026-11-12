// Pegar un punto (una parada, la central) a su calle de la red (spec 031): la
// arista más cercana donde un auto puede detenerse, y en qué parte de ella queda.
// En una avenida con bandejón OSM tiene una calle por calzada, así que la más
// cercana es la del lado de la casa. Con otro filtro sirve para buscar otras
// aristas cercanas (las calles internas de un condominio, entrada.ts). Puro.
import type { Coordenada } from "@/lib/geo/coordenada";
import { SIN_PARADA, type Red } from "./grafo";

export type Pegado = {
  arista: number;
  /** En qué parte de la arista queda, de 0 (su nodo `desde`) a 1 (su nodo `hasta`). */
  fraccion: number;
  /** El punto sobre la calle. */
  punto: Coordenada;
  /** A cuántos metros de la calle estaba el punto pedido. */
  metros: number;
};

/** Lado de cada casilla del índice, en grados (~110 m). */
const CASILLA = 0.001;
/** Más lejos que esto de toda calle, el punto no está en la red. */
export const RADIO_PEGADO_M = 400;
const M_POR_GRADO = 111_195;

type Indice = { casillas: Map<number, number[]>; segInicio: Int32Array; segLat: Float64Array; segLng: Float64Array; acumulado: Float64Array };
const indices = new WeakMap<Red, Indice>();

const clave = (fila: number, columna: number) => fila * 100_000 + columna;
const fila = (lat: number) => Math.floor((lat + 90) / CASILLA);
const columna = (lng: number) => Math.floor((lng + 180) / CASILLA);

/** Donde un auto se detiene a entregar: todo menos autopistas, enlaces, rotondas,
 *  pasajes internos de estacionamiento y entradas de auto (SIN_PARADA). */
export const dondeSePara = (red: Red, k: number) => !(red.codigo[k] & SIN_PARADA);

/** Los puntos de todas las aristas, seguidos, y en qué casillas cae cada tramo. */
function indiceDe(red: Red): Indice {
  const listo = indices.get(red);
  if (listo) return listo;
  const segInicio = new Int32Array(red.nAristas + 1);
  const lat: number[] = [];
  const lng: number[] = [];
  for (let k = 0; k < red.nAristas; k++) {
    segInicio[k] = lat.length;
    lat.push(red.lat[red.desde[k]]);
    lng.push(red.lng[red.desde[k]]);
    for (let m = red.formaInicio[k]; m < red.formaInicio[k + 1]; m++) {
      lat.push(red.formaLat[m]);
      lng.push(red.formaLng[m]);
    }
    lat.push(red.lat[red.hasta[k]]);
    lng.push(red.lng[red.hasta[k]]);
  }
  segInicio[red.nAristas] = lat.length;
  const segLat = Float64Array.from(lat);
  const segLng = Float64Array.from(lng);
  // Metros desde el principio de su arista hasta cada punto.
  const acumulado = new Float64Array(lat.length);
  const casillas = new Map<number, number[]>();
  for (let k = 0; k < red.nAristas; k++) {
    for (let p = segInicio[k]; p < segInicio[k + 1] - 1; p++) {
      const cos = Math.cos((segLat[p] * Math.PI) / 180);
      acumulado[p + 1] = acumulado[p] + Math.hypot((segLat[p + 1] - segLat[p]) * M_POR_GRADO, (segLng[p + 1] - segLng[p]) * M_POR_GRADO * cos);
      const f0 = Math.min(fila(segLat[p]), fila(segLat[p + 1]));
      const f1 = Math.max(fila(segLat[p]), fila(segLat[p + 1]));
      const c0 = Math.min(columna(segLng[p]), columna(segLng[p + 1]));
      const c1 = Math.max(columna(segLng[p]), columna(segLng[p + 1]));
      for (let f = f0; f <= f1; f++) {
        for (let c = c0; c <= c1; c++) {
          const lista = casillas.get(clave(f, c));
          if (lista) lista.push(k, p);
          else casillas.set(clave(f, c), [k, p]);
        }
      }
    }
  }
  const indice = { casillas, segInicio, segLat, segLng, acumulado };
  indices.set(red, indice);
  return indice;
}

/** La calle más cercana al punto donde se puede parar (o la más cercana que
 *  cumpla `sirve`), o null si no hay ninguna a `radioM`. */
export function pegarALaRed(
  red: Red,
  punto: Coordenada,
  radioM = RADIO_PEGADO_M,
  sirve: (red: Red, k: number) => boolean = dondeSePara,
): Pegado | null {
  const { casillas, segLat, segLng, acumulado, segInicio } = indiceDe(red);
  const cos = Math.cos((punto.lat * Math.PI) / 180);
  const vueltas = Math.ceil(radioM / (CASILLA * M_POR_GRADO * cos)) + 1;
  const f0 = fila(punto.lat);
  const c0 = columna(punto.lng);
  let mejor: Pegado | null = null;
  // De adentro hacia afuera: en cuanto el anillo queda más lejos que lo mejor, listo.
  for (let anillo = 0; anillo <= vueltas; anillo++) {
    if (mejor && mejor.metros < (anillo - 1) * CASILLA * M_POR_GRADO * cos) break;
    for (let f = f0 - anillo; f <= f0 + anillo; f++) {
      for (let c = c0 - anillo; c <= c0 + anillo; c++) {
        if (Math.max(Math.abs(f - f0), Math.abs(c - c0)) !== anillo) continue;
        const lista = casillas.get(clave(f, c));
        if (!lista) continue;
        for (let i = 0; i < lista.length; i += 2) {
          const k = lista[i];
          if (!sirve(red, k)) continue;
          const p = lista[i + 1];
          // El tramo p→p+1 en metros, con el punto pedido en el origen.
          const ax = (segLng[p] - punto.lng) * M_POR_GRADO * cos;
          const ay = (segLat[p] - punto.lat) * M_POR_GRADO;
          const bx = (segLng[p + 1] - punto.lng) * M_POR_GRADO * cos;
          const by = (segLat[p + 1] - punto.lat) * M_POR_GRADO;
          const largo2 = (bx - ax) ** 2 + (by - ay) ** 2;
          const t = largo2 > 0 ? Math.min(1, Math.max(0, -(ax * (bx - ax) + ay * (by - ay)) / largo2)) : 0;
          const d = Math.hypot(ax + t * (bx - ax), ay + t * (by - ay));
          if (d > radioM || (mejor && d >= mejor.metros)) continue;
          const total = acumulado[segInicio[k + 1] - 1];
          mejor = {
            arista: k,
            fraccion: total > 0 ? (acumulado[p] + t * (acumulado[p + 1] - acumulado[p])) / total : 0,
            punto: { lat: segLat[p] + t * (segLat[p + 1] - segLat[p]), lng: segLng[p] + t * (segLng[p + 1] - segLng[p]) },
            metros: d,
          };
        }
      }
    }
  }
  return mejor;
}
