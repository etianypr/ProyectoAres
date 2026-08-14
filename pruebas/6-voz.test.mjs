// Elección de voz para las indicaciones habladas. Poner solo lang="es-CL" no
// alcanza: casi ningún teléfono tiene esa variante instalada y el navegador
// termina leyendo en inglés o callado. Acá se fija a qué voz cae cada aparato.
import test from "node:test";
import assert from "node:assert/strict";
import { elegirVoz } from "@/app/(conductor)/conductor/encomiendas/use-voz";

const v = (lang, name = lang) => ({ lang, name });

test("prefiere la voz chilena si el teléfono la tiene", () => {
  assert.equal(elegirVoz([v("en-US"), v("es-ES"), v("es-CL")]).lang, "es-CL");
});

test("sin es-CL, cae al español más cercano y no a España", () => {
  // Android típico
  assert.equal(elegirVoz([v("en-US"), v("es-ES"), v("es-US")]).lang, "es-US");
  // iPhone típico
  assert.equal(elegirVoz([v("en-US"), v("es-MX"), v("es-ES")]).lang, "es-MX");
  // Latinoamericano genérico gana a los nacionales
  assert.equal(elegirVoz([v("es-ES"), v("es-419"), v("es-US")]).lang, "es-419");
  assert.equal(elegirVoz([v("es-AR"), v("es-PE")]).lang, "es-PE");
});

test("solo español de España: se usa igual, es mejor que nada", () => {
  assert.equal(elegirVoz([v("en-US"), v("es-ES")]).lang, "es-ES");
});

test("una variante rara de español sirve igual", () => {
  assert.equal(elegirVoz([v("en-GB"), v("es-CO")]).lang, "es-CO");
});

test("Android reporta 'es_CL' con guion bajo y también tiene que reconocerse", () => {
  assert.equal(elegirVoz([v("en-US"), v("es_ES"), v("es_CL")]).lang, "es_CL");
  assert.equal(elegirVoz([v("EN-US"), v("ES_MX")]).lang, "ES_MX");
});

test("sin ninguna voz en español devuelve null (se habla igual, por lang)", () => {
  assert.equal(elegirVoz([v("en-US"), v("pt-BR"), v("fr-FR")]), null);
  assert.equal(elegirVoz([]), null);
});

test("no confunde otros idiomas que empiezan parecido", () => {
  // "et" (estonio) no es "es"; el filtro es por prefijo "es".
  assert.equal(elegirVoz([v("et-EE"), v("eu-ES")]), null);
});
