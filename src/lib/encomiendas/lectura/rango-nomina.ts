// El «8» que el lector ve como «0» al escanear la nómina (spec 039; dueño, 2026-11-17: «en casi
// todos los escaneos confunde el 0 con el 8», y siempre en ese sentido: lee 0 donde hay un 8).
// Dos cosas del día lo arreglan sin preguntarle a nadie:
//   · las OF de un día son de una misma serie: caben en ANCHO_RANGO alrededor de la mediana de
//     las firmes («los pedidos a lo más estarán entre 281 000 000 y 282 000 000»). El rango se
//     aprende del mismo escaneo (dueño: que lo aprenda solo, porque la serie sube con los meses);
//   · una OF fuera del rango que entra cambiando algunos «0» por «8», de una sola forma, es esa.
// Puro. Aparte de barrido-nomina.ts y bloques-nomina.ts, que pasan de 300 líneas (A7).

import { LARGO_OF } from "../paquete";

/** Cuánto pueden alejarse las OF de un día de la mediana de las firmes (hacia cada lado): el
 *  dueño las ve en un tramo de 1 000 000, así que esto deja holgura y aun así atrapa un «8» leído
 *  «0» en los tres primeros dígitos (281 → 201 es 80 000 000 de distancia). */
export const ANCHO_RANGO = 1_000_000;
/** Firmes de LARGO_OF dígitos que hacen falta para aprender el rango. */
export const FIRMES_PARA_RANGO = 3;
/** «Los primeros tres dígitos serán los mismos» (dueño, 2026-11-17). */
export const DIGITOS_DEL_PREFIJO = 3;

/** `prefijos`: los primeros DIGITOS_DEL_PREFIJO dígitos de las firmes del escaneo (281, y 282 si la
 *  serie ya pasó). */
export type Rango = { desde: number; hasta: number; prefijos?: string[] };

/** El rango del escaneo, o null si todavía no hay firmes suficientes. Solo las OF de LARGO_OF
 *  dígitos: las de otro largo valen (AGENTS.md, «OF») y no se tocan. */
export function rangoDelEscaneo(decididos: { of: string; firme: boolean }[]): Rango | null {
  const firmes = decididos
    .filter((d) => d.firme && d.of.length === LARGO_OF)
    .map((d) => Number(d.of))
    .sort((a, b) => a - b);
  if (firmes.length < FIRMES_PARA_RANGO) return null;
  const mediana = firmes[Math.floor(firmes.length / 2)];
  const prefijos = [...new Set(firmes.map((n) => String(n).slice(0, DIGITOS_DEL_PREFIJO)))];
  return { desde: mediana - ANCHO_RANGO, hasta: mediana + ANCHO_RANGO, prefijos };
}

const dentro = (of: string, r: Rango) => {
  const n = Number(of);
  return n >= r.desde && n <= r.hasta;
};

/** La OF dentro del rango: igual si ya está, o con los «0» que eran «8» si hay una sola forma
 *  con la menor cantidad de cambios. Si no, con los primeros dígitos del día (terreno 2026-11-18: el
 *  «8» de «281» salía «6» en 7 de cada 10 cuadros y la OF nunca quedaba firme), si hay una sola forma
 *  de entrar al rango (dueño, 2026-11-18: «los primeros tres dígitos serán los mismos», sin exigir más);
 *  vale entonces por el resto de sus dígitos (`firmeSinPrefijo`). Si no hay arreglo, queda como estaba
 *  pero sin firmar: el conductor la confirma con el papel (no se bota nada a ciegas). */
export function alRango<D extends { of: string; firme: boolean; firmeSinPrefijo?: boolean }>(d: D, rango: Rango | null): D {
  if (!rango || d.of.length !== LARGO_OF || !/^\d+$/.test(d.of) || dentro(d.of, rango)) return d;
  const ceros: number[] = [];
  for (let i = 0; i < d.of.length; i++) if (d.of[i] === "0") ceros.push(i);
  let mejores: string[] = [];
  let menos = Infinity;
  for (let mascara = 1; mascara < 1 << ceros.length; mascara++) {
    let cambios = 0;
    for (let m = mascara; m; m &= m - 1) cambios++;
    if (cambios > menos) continue;
    const digitos = [...d.of];
    ceros.forEach((p, j) => {
      if ((mascara >> j) & 1) digitos[p] = "8";
    });
    const candidata = digitos.join("");
    if (!dentro(candidata, rango)) continue;
    if (cambios < menos) {
      menos = cambios;
      mejores = [candidata];
    } else {
      mejores.push(candidata);
    }
  }
  if (mejores.length === 1) return { ...d, of: mejores[0] };
  if (mejores.length === 0) {
    const conPrefijo = [...new Set(rango.prefijos ?? [])]
      .map((p) => p + d.of.slice(p.length))
      .filter((c) => dentro(c, rango));
    if (conPrefijo.length === 1) return { ...d, of: conPrefijo[0], firme: d.firmeSinPrefijo ?? d.firme };
  }
  return { ...d, firme: false };
}

/** Las dos OF son la misma salvo «0» y «8» (spec 039): así se reconoce el pedido de una etiqueta
 *  cuyo código de barras (exacto) trae un «8» donde la nómina dejó un «0». Iguales no cuenta. */
export function mismaSalvoOchoYCero(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!((a[i] === "0" && b[i] === "8") || (a[i] === "8" && b[i] === "0"))) return false;
  }
  return true;
}

/** La OF con cada «8» como «0»: una lectura con el error del lector y la buena dan lo mismo, y así
 *  se comparan con el tope de errores de siempre al revisar lo parecido a una firme (spec 039). */
export const sinOchos = (of: string): string => of.replace(/8/g, "0");
