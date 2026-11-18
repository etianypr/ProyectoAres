// Lo que miran las pruebas doradas del catálogo de calles (spec 038, 038-calles-dorado.test.mjs):
// todas las palabras y todos los nombres del catálogo, más variantes con una letra cambiada,
// dos letras vecinas cruzadas y sin la primera palabra. Solo calles públicas de OSM, sin
// direcciones de nadie. Lo usan la prueba y el script que generó el fixture con el código de
// antes de la 038 (pruebas/fixtures/038-calles.json): los dos tienen que armar lo mismo.
import { createHash } from "node:crypto";

/** Las palabras como las parte el código (minúsculas, sin tildes, sin puntuación). */
const partir = (t) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** El catálogo (texto de calles-arica.ts) → palabras, nombres y lo que se escribe. */
export function corpus(catalogo) {
  const nombres = [];
  for (const fila of catalogo.split("\n").filter(Boolean)) {
    const [nombre, , otros] = fila.split("|");
    nombres.push(nombre, ...(otros ? otros.split(";") : []));
  }
  const palabras = [...new Set(nombres.flatMap(partir))].sort();
  const variantes = nombres.flatMap((n) => {
    const ps = n.split(" ");
    const k = ps.reduce((m, p, i) => (p.length > ps[m].length ? i : m), 0);
    const larga = ps[k];
    const con = (otra) => [...ps.slice(0, k), otra, ...ps.slice(k + 1)].join(" ");
    const medio = Math.floor(larga.length / 2);
    const fuera = [];
    if (larga.length >= 5) fuera.push(con(`${larga.slice(0, medio)}x${larga.slice(medio + 1)}`));
    if (larga.length >= 4) fuera.push(con(`${larga.slice(0, medio - 1)}${larga[medio]}${larga[medio - 1]}${larga.slice(medio + 1)}`));
    if (ps.length > 1) fuera.push(ps.slice(1).join(" "));
    return fuera;
  });
  const escritos = [...palabras, ...nombres, ...variantes];
  // Para coincidenciaCalle contra todos los nombres: uno de cada 15 escritos.
  const muestra = escritos.filter((_, i) => i % 15 === 0);
  return { palabras, nombres, escritos, muestra };
}

export const sha = (texto) => createHash("sha256").update(texto).digest("hex");

/** distanciaEdicion de cada par ordenado de palabras, en un hash (y el total de pares). */
export function huellaDistancias(palabras, distanciaEdicion) {
  const h = createHash("sha256");
  const fila = new Uint8Array(palabras.length);
  for (const a of palabras) {
    for (let j = 0; j < palabras.length; j++) fila[j] = distanciaEdicion(a, palabras[j]);
    h.update(fila);
  }
  return { pares: palabras.length ** 2, hash: h.digest("hex") };
}

/** Una coincidencia en orden fijo (el orden de las claves del objeto no importa). */
const cifras = (c) => (c ? [c.ediciones, c.faltantes, c.sobrantes] : null);

/** callesParecidas (hasta 5, lo que pide la IA) de cada escrito, en un hash. */
export async function huellaParecidas(escritos, callesParecidas) {
  const h = createHash("sha256");
  for (const e of escritos) {
    const r = (await callesParecidas(e, 5)).map((c) => [c.nombre, c.largo, ...cifras(c)]);
    h.update(`${e}→${JSON.stringify(r)}\n`);
  }
  return { escritos: escritos.length, hash: h.digest("hex") };
}

/** coincidenciaCalle de la muestra contra cada nombre del catálogo, en un hash. */
export function huellaCoincidencias(muestra, nombres, coincidenciaCalle) {
  const h = createHash("sha256");
  for (const e of muestra) h.update(`${e}→${JSON.stringify(nombres.map((n) => cifras(coincidenciaCalle(e, n))))}\n`);
  return { pares: muestra.length * nombres.length, hash: h.digest("hex") };
}
