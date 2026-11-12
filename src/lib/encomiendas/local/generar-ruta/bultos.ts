// Los bultos fuera del auto antes, casi sin manejar de más (spec 024): lo que cada
// orden del día le pasa a ordenarParadas (la pasada está en orden-paradas/descarga.ts).

import type { DescargaPorMatriz } from "@/lib/rutas/orden-paradas";
import { KMH_CIUDAD, MIN_POR_PARADA } from "../planificar";
import type { PedidoUbicado } from "./tipos";

/** Sacar los bultos del auto antes (spec 024): lo que cada orden del día
 *  necesita para retocarse sin manejar de más. */
export type DescargaDelDia = {
  /** La matriz de metros de verdad: la del orden cobra además el tiempo (pesos.ts). */
  matriz: number[][] | null;
  /** La del orden sin lo que cobra aparte: metros con el tiempo (pesos.ts). */
  base: number[][] | null;
  /** Cuánto más se acepta manejar: casi nada (dueño, 2026-11-07). */
  tolerancia: number;
};

/** 1 % de km de más, como mucho (dueño, 2026-11-07: «solo si es casi gratis»). */
export const TOLERANCIA_DESCARGA = 0.01;

/** El tiempo de cada parada en metros de manejo, con el mismo reloj de planificar.ts. */
export const METROS_POR_PARADA = (MIN_POR_PARADA * KMH_CIUDAD * 1000) / 60;

/** Los bultos que deja una parada. Al armar la ruta casi nunca se sabe: salen al
 *  escanear la etiqueta (paso 4), así que sin escanear cada pedido vale uno. */
export function bultosDe(p: PedidoUbicado): number {
  return Math.max(1, p.bultos ?? 1);
}

/** Lo que ordenarParadas necesita para adelantar los bultos de un grupo: los
 *  suyos y su pedazo de la matriz de verdad, con los mismos índices que `indices`
 *  (el 0 es de donde se parte). */
export function descargaDelGrupo(
  descarga: DescargaDelDia,
  grupo: PedidoUbicado[],
  indices: number[],
  /** Volver desde el punto i del grupo, en metros de verdad. */
  vueltaReal?: (i: number) => number,
): DescargaPorMatriz {
  const recortar = (m: number[][] | null) =>
    m && indices.every((i) => i >= 0) ? indices.map((f) => indices.map((c) => m[f]?.[c] ?? Infinity)) : null;
  return {
    bultos: [0, ...grupo.map(bultosDe)],
    matrizReal: recortar(descarga.matriz),
    matrizBase: recortar(descarga.base),
    vueltaReal,
    tolerancia: descarga.tolerancia,
    metrosPorParada: METROS_POR_PARADA,
  };
}
