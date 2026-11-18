// Spec 038, lo dorado del catálogo de calles: distanciaEdicion (3 filas reutilizadas) y
// callesParecidas (palabras partidas una vez al cargar) dan exactamente lo mismo que el código de
// antes de la 038. fixtures/038-calles.json se generó con la copia congelada sobre todas las
// palabras y nombres del catálogo y sus variantes con tipeo (038-corpus-calles.mjs). Va aparte de
// 038-ubicar.test.mjs para que las dos corran a la vez (esta es CPU; la otra espera la fila de OSM).
//
// Solo calles públicas de OpenStreetMap: sin direcciones de nadie.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corpus, huellaCoincidencias, huellaDistancias, huellaParecidas } from "./038-corpus-calles.mjs";

const { CALLES_ARICA } = await import("@/lib/geo/geocoding/calles-arica");
const { distanciaEdicion, coincidenciaCalle } = await import("@/lib/geo/geocoding/consulta");
const { callesParecidas } = await import("@/lib/geo/geocoding/calles");

const DORADO = JSON.parse(readFileSync("pruebas/fixtures/038-calles.json", "utf8"));
const CORPUS = corpus(CALLES_ARICA);

/** distanciaEdicion como era antes de la 038 (matriz entera): la referencia. */
function distanciaDeAntes(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cambio = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cambio);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

test("dorado: distanciaEdicion da lo mismo que antes en cada par de palabras del catálogo", () => {
  assert.equal(CORPUS.palabras.length, DORADO.palabras);
  assert.deepEqual(huellaDistancias(CORPUS.palabras, distanciaEdicion), DORADO.distancias);
});

test("dorado: distanciaEdicion igual a la de antes con vacíos, tildes, largos y cruzadas", () => {
  const casos = ["", "a", "ab", "ba", "witnig", "witting", "wittnig", "muñoz", "munoz", "ñandú", "abcdefghijklmnopqrstuvwxyz0123456789".repeat(3), "zyxwvutsrqponmlkjihgfedcba", "aaaa", "aaab", "abab", "baba"];
  for (const a of casos) for (const b of casos) assert.equal(distanciaEdicion(a, b), distanciaDeAntes(a, b), `${a} / ${b}`);
});

test("dorado: coincidenciaCalle da lo mismo que antes (muestra × cada nombre del catálogo)", () => {
  assert.deepEqual(huellaCoincidencias(CORPUS.muestra, CORPUS.nombres, coincidenciaCalle), DORADO.coincidencias);
});

test("dorado: callesParecidas da lo mismo que antes para cada palabra, nombre y tipeo del catálogo", async () => {
  assert.deepEqual(await huellaParecidas(CORPUS.escritos, callesParecidas), DORADO.parecidas);
});
