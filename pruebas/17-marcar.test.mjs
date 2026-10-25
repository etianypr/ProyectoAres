// Marcar la puerta con el GPS: la traducción del radio de error a algo que una
// persona pueda decidir.
//
// Es la última pieza del sistema de direcciones y la que más fácil se
// convierte en el mismo error de siempre. El GPS NUNCA dice "no sé": devuelve
// una posición aunque esté perdido, con un radio de error al lado. Guardar una
// lectura de ±80 m como "la puerta" es exactamente lo que hacía el
// geocodificador cuando decidía por `confidence` — solo que ahora con la firma
// del conductor encima, así que nadie sospecharía.
//
// Lo que se prueba acá es que ese radio nunca se pierda por el camino.
import test from "node:test";
import assert from "node:assert/strict";

import { calidadDe, marcaDe, entraSolo } from "@/lib/geo/marcar";
import { resolverPlusCode } from "@/lib/geo/plus-code";

// Quinsachata 1749: la única puerta de Arica que Mapbox tiene exacta.
const PUERTA = { lat: -18.4712, lng: -70.2899 };

// ---------------------------------------------------------------------------
// El radio de error, que es todo
// ---------------------------------------------------------------------------

test("cada radio de error cae en la calidad que le corresponde", () => {
  const casos = [
    [3, "puerta"],
    [12, "puerta"],
    [12.9, "cuadra"],
    [40, "cuadra"],
    [41, "dudosa"],
    [150, "dudosa"],
  ];
  for (const [metros, esperada] of casos) {
    assert.equal(calidadDe(metros), esperada, `±${metros} m dio ${calidadDe(metros)}`);
  }
});

test("sin radio de error NO se asume lo mejor", () => {
  // Mismo criterio con el que se lee el match_code de Mapbox: lo que el
  // proveedor no afirma, no se da por bueno. Un teléfono que no informa
  // precisión no está diciendo "es perfecta".
  for (const sinDato of [null, undefined, NaN, Infinity]) {
    assert.equal(calidadDe(sinDato), "dudosa", `${sinDato} pasó como buena`);
  }
});

test("solo la puerta entra sin insistir", () => {
  assert.equal(entraSolo(marcaDe(PUERTA, 6)), true);
  assert.equal(entraSolo(marcaDe(PUERTA, 30)), false, "media cuadra no es la puerta");
  assert.equal(entraSolo(marcaDe(PUERTA, 200)), false);
  assert.equal(entraSolo(marcaDe(PUERTA, null)), false, "sin dato entró solo");
});

// ---------------------------------------------------------------------------
// Lo que se le muestra al conductor
// ---------------------------------------------------------------------------

test("el radio de error viaja SIEMPRE en el texto", () => {
  // Es la única defensa contra guardar "por acá" creyendo que es "acá". Si
  // alguna variante deja de nombrar los metros, el conductor pierde lo único que
  // le permite decidir.
  for (const metros of [4, 25, 90]) {
    const m = marcaDe(PUERTA, metros);
    assert.match(m.texto, new RegExp(`${metros}\\s*m`), `±${metros} m no aparece en "${m.texto}"`);
  }
});

test("cuando no hay radio, el texto lo dice en vez de callarlo", () => {
  const m = marcaDe(PUERTA, null);
  assert.equal(m.precisionM, null);
  assert.match(m.texto, /no informó/i);
  // Y no inventa un número.
  assert.ok(!/\d+\s*m\b/.test(m.texto), `se coló un número en "${m.texto}"`);
});

test("una lectura mala no se disfraza de buena", () => {
  const mala = marcaDe(PUERTA, 90);
  assert.equal(mala.calidad, "dudosa");
  assert.match(mala.texto, /floja|no ubica/i);

  const media = marcaDe(PUERTA, 30);
  assert.match(media.texto, /cuadra/i, "media cuadra tiene que decir que es la cuadra");
  assert.match(media.texto, /acércate|vuelve/i, "no le dice qué hacer para mejorarla");
});

// ---------------------------------------------------------------------------
// El Plus Code: lo que hace que esta casa no se busque nunca más
// ---------------------------------------------------------------------------

test("la marca trae el Plus Code del punto, y vuelve al mismo lugar", () => {
  const m = marcaDe(PUERTA, 5);
  assert.ok(m.codigo, "una marca sin código pierde la mitad de su valor");

  const vuelta = resolverPlusCode(m.codigo);
  const metros = Math.hypot(
    (vuelta.lat - PUERTA.lat) * 111320,
    (vuelta.lng - PUERTA.lng) * 111320 * Math.cos(PUERTA.lat * (Math.PI / 180)),
  );
  assert.ok(metros < 3, `el código quedó a ${metros.toFixed(1)} m de lo que se marcó`);
});

test("el código NO cambia de largo según la señal", () => {
  // Acortarlo cuando la lectura es mala parecería más honesto, pero el código
  // se dicta en voz alta: que cambie de largo entre una casa y otra lo vuelve
  // imposible de comparar. La honestidad va en el radio de error, que se
  // muestra siempre al lado.
  const largos = [3, 25, 120].map((p) => marcaDe(PUERTA, p).codigo.length);
  assert.equal(new Set(largos).size, 1, `el largo varió: ${largos.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Bordes
// ---------------------------------------------------------------------------

test("un punto imposible no produce marca", () => {
  assert.equal(marcaDe({ lat: NaN, lng: -70.3 }, 5), null);
  assert.equal(marcaDe({ lat: -18.4, lng: undefined }, 5), null);
});

test("las coordenadas pasan sin tocarse", () => {
  // Lo que se guarda en el pedido sale de acá: redondear o correr un decimal
  // mueve la casa y nada avisaría.
  const m = marcaDe(PUERTA, 7);
  assert.equal(m.lat, PUERTA.lat);
  assert.equal(m.lng, PUERTA.lng);
});

test("el radio se redondea a metros enteros para mostrarlo", () => {
  assert.equal(marcaDe(PUERTA, 6.4).precisionM, 6);
  assert.equal(marcaDe(PUERTA, 6.6).precisionM, 7);
});

test("no se consulta la red", () => {
  // Marcar la puerta tiene que funcionar con el teléfono sin señal: es
  // justamente donde el geocodificador no llega.
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("marcar la puerta consultó la red");
  };
  try {
    assert.ok(marcaDe(PUERTA, 5));
  } finally {
    globalThis.fetch = original;
  }
});
