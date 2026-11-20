// Los renglones de un cuadro de la cámara con sus cajas → filas de la hoja, los encargos
// para marcarlos sobre la cámara y la confianza de cada dígito (spec 029). Puro. Aparte de
// barrido-nomina.ts, que lo reexporta, para no pasar de 400 líneas (A7).

import { bloquesListaFlete, esIconoVerde } from "./lista-flete";
import { piezasNomina } from "./nomina";
import { LARGO_OF } from "../paquete";

/** Una palabra con 7 dígitos o más y la confianza de ML Kit en cada carácter (APK con
 *  los recuadros de la nómina; antes no viene). */
type NumeroLeido = { texto: string; confianzas: number[] };

/** Un renglón con su caja, como lo da el escáner en vivo (`RenglonVivo`). `iconos`: «PxP» y
 *  «COD» con su color (APK 1.11.0, spec 045). */
export type RenglonCaja = {
  texto: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  numeros?: NumeroLeido[];
  iconos?: { texto: string; du: number; dv: number }[];
};

/** Las OF de la lista de Starken cuya tarjeta trae un ícono en verde en este cuadro: por pagar
 *  (spec 045). Vacío sin íconos medidos (una APK anterior, o la boleta de papel). */
export function porPagarDelCuadro(renglones: RenglonCaja[], filas = filasDe(renglones)): Set<string> {
  const verdes = new Set<string>();
  if (!renglones.some((r) => r.iconos?.length)) return verdes;
  for (const b of bloquesListaFlete(filas.map((f) => f.texto))) {
    const deLaTarjeta = filas.slice(b.filaOf, b.hasta + 1).flatMap((f) => f.indices.map((i) => renglones[i]));
    if (deLaTarjeta.some((r) => r.iconos?.some(esIconoVerde))) verdes.add(b.of);
  }
  return verdes;
}

/** Un encargo en el cuadro: su caja (la de todos sus renglones juntos) y la OF que se
 *  leyó en este cuadro. `entero`: se vio de la fila de la OF hasta la dirección; si no,
 *  la caja es solo la fila de la OF, que va entrando a la cámara. La caja empieza en la
 *  fila de la OF; `altoFila` es lo que mide esa fila (con eso se miden las separaciones
 *  entre encargos sin importar a qué distancia está el celular, spec 036). */
export type CajaEncargo = { of: string; x: number; y: number; ancho: number; alto: number; altoFila: number; entero: boolean };

/** Los encargos de un cuadro, para marcarlos sobre la cámara de a uno entero (dueño,
 *  2026-11-11: «si me marcas con rectángulos pequeños no entiendo qué estoy leyendo»). */
export function cajasDelCuadro(renglones: RenglonCaja[], filas = filasDe(renglones)): CajaEncargo[] {
  const caja = (desde: number, hasta: number, of: string, entero: boolean): CajaEncargo => {
    const cajas = filas.slice(desde, hasta + 1).flatMap((f) => f.indices.map((i) => renglones[i]));
    const x = Math.min(...cajas.map((r) => r.x));
    const y = Math.min(...cajas.map((r) => r.y));
    const ancho = Math.max(...cajas.map((r) => r.x + r.ancho)) - x;
    const alto = Math.max(...cajas.map((r) => r.y + r.alto)) - y;
    const altoFila = Math.max(...filas[desde].indices.map((i) => renglones[i].alto));
    return { of, x, y, ancho, alto, altoFila, entero };
  };
  // Las mismas piezas que votan (nomina.ts): un número del encabezado de la nómina no se marca.
  const textos = filas.map((f) => f.texto);
  const { bloques, piezas } = piezasNomina(textos);
  return [
    ...bloques.map((b) => caja(b.filaOf, b.hasta, b.of, true)),
    // Las tarjetas de la lista de Starken en el teléfono (spec 045).
    ...bloquesListaFlete(textos).map((b) => caja(b.filaOf, b.hasta, b.of, true)),
    ...piezas.map((p) => caja(p.filaOf, p.filaOf, p.of, false)),
  ];
}

/** OF → la confianza de cada uno de sus dígitos, de las palabras con números largos
 *  de un cuadro. La OF se arma como en nomina.ts (`ofDeRenglon`): solo los dígitos,
 *  los primeros LARGO_OF (el TOTAL pegado sobra) y sin los ceros a la izquierda. */
export function confianzasDelCuadro(renglones: RenglonCaja[]): Map<string, number[]> {
  const porOf = new Map<string, number[]>();
  for (const r of renglones) {
    for (const n of r.numeros ?? []) {
      // Sin una confianza por carácter (otra cantidad) no se puede alinear: se ignora.
      if (n.confianzas.length !== n.texto.length) continue;
      const digitos = [...n.texto]
        .flatMap((c, i) => (/\d/.test(c) ? [{ c, confianza: n.confianzas[i] }] : []))
        .slice(0, LARGO_OF);
      const desde = digitos.findIndex((d) => d.c !== "0");
      if (desde < 0) continue;
      const of = digitos.slice(desde);
      porOf.set(
        of.map((d) => d.c).join(""),
        of.map((d) => d.confianza),
      );
    }
  }
  return porOf;
}

/** Los renglones agrupados por fila de la hoja: de arriba abajo y, en cada fila,
 *  de izquierda a derecha. ML Kit puede entregar una tabla por columnas (todas las
 *  OF y después todos los destinos), y así la OF no queda al lado de su destino.
 *  Cada fila dice qué renglones del cuadro la forman (para marcarlos en la cámara). */
export function filasDe(renglones: RenglonCaja[]): { texto: string; indices: number[] }[] {
  const filas: { centro: number; alto: number; indices: number[] }[] = [];
  const orden = renglones.map((r, i) => ({ r, i })).sort((a, b) => a.r.y + a.r.alto / 2 - (b.r.y + b.r.alto / 2));
  for (const { r, i } of orden) {
    const centro = r.y + r.alto / 2;
    const fila = filas.at(-1);
    if (fila && Math.abs(centro - fila.centro) <= Math.min(fila.alto, r.alto) / 2) fila.indices.push(i);
    else filas.push({ centro, alto: r.alto, indices: [i] });
  }
  return filas.map((f) => {
    const indices = f.indices.sort((a, b) => renglones[a].x - renglones[b].x);
    return { texto: indices.map((i) => renglones[i].texto).join(" "), indices };
  });
}

export function textoPorFilas(renglones: RenglonCaja[]): string {
  return filasDe(renglones)
    .map((f) => f.texto)
    .join("\n");
}
