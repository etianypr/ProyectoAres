// Los enteros compactos de red-arica.ts (spec 031). Cada entero va en zigzag
// (los negativos intercalados con los positivos) y en grupos de 5 bits, del menos
// al más significativo; cada grupo es una letra y las letras 32–63 dicen «sigue».
// Lo escribe scripts/generar-red.mjs con el mismo alfabeto. Puro.

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const VALOR = new Int8Array(128).fill(-1);
for (let i = 0; i < ALFABETO.length; i++) VALOR[ALFABETO.charCodeAt(i)] = i;

/** Todos los enteros de un texto compacto, en orden. */
export function leerEnteros(texto: string): number[] {
  const salida: number[] = [];
  let v = 0;
  let peso = 1;
  for (let i = 0; i < texto.length; i++) {
    const c = VALOR[texto.charCodeAt(i)];
    if (c >= 32) {
      v += (c - 32) * peso;
      peso *= 32;
    } else {
      v += c * peso;
      salida.push(v % 2 === 1 ? -(v + 1) / 2 : v / 2);
      v = 0;
      peso = 1;
    }
  }
  return salida;
}

/** Un entero en el formato compacto (lo usan las pruebas para armar redes de juguete). */
export function escribirEntero(n: number): string {
  let v = n < 0 ? -2 * n - 1 : 2 * n;
  let salida = "";
  while (v >= 32) {
    salida += ALFABETO[32 + (v % 32)];
    v = Math.floor(v / 32);
  }
  return salida + ALFABETO[v];
}
