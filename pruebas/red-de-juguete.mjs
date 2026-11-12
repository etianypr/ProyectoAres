// Redes de calles de juguete para probar el motor de rutas (spec 031) sin la red
// de Arica: una grilla de cuadras de ~100 m, escrita en el mismo formato compacto
// que genera scripts/generar-red.mjs.
import { escribirEntero } from "@/lib/geo/red/codigo";
import { armarRed } from "@/lib/geo/red/grafo";

const LAT0 = -18.47;
const LNG0 = -70.3;
/** Lado de una cuadra, en grados (~111 m de norte a sur, ~105 m de oeste a este). */
export const CUADRA = 0.001;

/** El punto de la grilla en la fila `f` (hacia el sur) y la columna `c` (hacia el este). */
export const en = (f, c) => ({ lat: LAT0 - f * CUADRA, lng: LNG0 + c * CUADRA });

export const RESIDENCIAL = 5;
export const SECUNDARIA = 2;
export const UN_SENTIDO = 16;
export const PRIVADA = 32;
export const SIN_PARADA = 64;

/**
 * Arma una red. `nodos`: puntos {lat, lng}. `aristas`: [desde, hasta, código?, vel?]
 * (por defecto residencial de doble sentido, sin máxima). `giros`: [arista desde,
 * nodo, arista hasta, solo]. `cerrados` y `portones`: índices de nodos.
 */
export function redDeJuguete({ nodos, aristas, giros = [], cerrados = [], portones = [] }) {
  let previo = [0, 0];
  const textoNodos = nodos
    .map((p) => {
      const fijo = [Math.round(p.lat * 1e6), Math.round(p.lng * 1e6)];
      const s = escribirEntero(fijo[0] - previo[0]) + escribirEntero(fijo[1] - previo[1]);
      previo = fijo;
      return s;
    })
    .join("");
  const textoAristas = aristas
    .map(([desde, hasta, codigo = RESIDENCIAL, vel = 0]) => [desde, hasta, codigo, vel, 0].map(escribirEntero).join(""))
    .join("");
  return armarRed({
    fecha: "2026-11-12",
    nodos: textoNodos,
    aristas: textoAristas,
    giros: giros.flat().map(escribirEntero).join(""),
    cerrados: cerrados.map(escribirEntero).join(""),
    portones: portones.map(escribirEntero).join(""),
  });
}

/**
 * Una grilla de `filas` × `columnas` cruces, todas las calles residenciales de
 * doble sentido. El nodo de la fila f y la columna c es f · columnas + c. Devuelve
 * también `arista(a, b)`: el índice de la arista entre dos nodos vecinos.
 * `cambios`: { "a-b": código } para cambiar la calle entre los nodos a y b.
 */
export function grilla(filas, columnas, { cambios = {}, extra = {} } = {}) {
  const nodos = [];
  for (let f = 0; f < filas; f++) for (let c = 0; c < columnas; c++) nodos.push(en(f, c));
  const aristas = [];
  const indice = new Map();
  const poner = (a, b) => {
    indice.set(`${a}-${b}`, aristas.length);
    indice.set(`${b}-${a}`, aristas.length);
    aristas.push([a, b, cambios[`${a}-${b}`] ?? RESIDENCIAL, 0]);
  };
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const n = f * columnas + c;
      if (c + 1 < columnas) poner(n, n + 1);
      if (f + 1 < filas) poner(n, n + columnas);
    }
  }
  const arista = (a, b) => indice.get(`${a}-${b}`);
  const sueltos = extra.nodos ?? [];
  const masAristas = extra.aristas ?? [];
  masAristas.forEach(([a, b]) => {
    indice.set(`${a}-${b}`, aristas.length + masAristas.findIndex(([x, y]) => x === a && y === b));
    indice.set(`${b}-${a}`, indice.get(`${a}-${b}`));
  });
  const red = redDeJuguete({
    nodos: [...nodos, ...sueltos],
    aristas: [...aristas, ...masAristas],
    giros: (extra.giros ?? []).map(([de, nodo, a, solo]) => [arista(...de), nodo, arista(...a), solo]),
    cerrados: extra.cerrados,
    portones: extra.portones,
  });
  return { red, arista };
}
