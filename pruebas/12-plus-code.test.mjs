// Plus Codes: la única pieza del sistema que ubica una casa SIN preguntarle a
// nadie. Por eso esta prueba no tiene fixture ni doble de red — es aritmética,
// y si un día deja de ser aritmética hay que enterarse acá.
//
// Lo que protege: que un código dictado por teléfono ("GMCP+MX, Arica") caiga
// en Arica y no en otra ciudad, que el viaje de ida y vuelta no mueva la casa,
// y que un código mal escrito devuelva null en vez de tumbar la pantalla.
import test from "node:test";
import assert from "node:assert/strict";

import {
  resolverPlusCode,
  plusCodeDe,
  CENTRO_ARICA,
} from "@/lib/geo/plus-code";

// El código completo del centro de Arica, calculado por la librería y fijado
// acá: si un día cambia, es que cambió el algoritmo y no un detalle nuestro.
const ARICA_COMPLETO = "57HFGMCP+MX";
const ARICA_CORTO = "GMCP+MX";
const SANTIAGO = { lat: -33.4489, lng: -70.6693 };

const metros = (a, b) => {
  const latMedia = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  return Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(latMedia));
};

// ---------------------------------------------------------------------------
// Códigos completos: se resuelven solos
// ---------------------------------------------------------------------------

test("un código completo se resuelve sin referencia y sin red", () => {
  const r = resolverPlusCode(ARICA_COMPLETO);
  assert.ok(r, "un código completo válido tiene que resolverse");
  assert.equal(r.eraCorto, false);
  assert.equal(r.codigoCompleto, ARICA_COMPLETO);
  assert.ok(metros(r, CENTRO_ARICA) < 50, "el centro de Arica se fue de lugar");
});

test("el recuadro contiene al punto que se devuelve", () => {
  // Si esto se rompe es que se invirtió norte/sur u oeste/este — el mismo error
  // que en el mapa estático pone el marcador en el mar, y que acá no daría
  // ningún síntoma hasta que alguien dibuje el recuadro.
  const r = resolverPlusCode(ARICA_COMPLETO);
  assert.ok(r.recuadro.sur < r.lat && r.lat < r.recuadro.norte, "la latitud quedó fuera");
  assert.ok(r.recuadro.oeste < r.lng && r.lng < r.recuadro.este, "la longitud quedó fuera");
  assert.ok(r.recuadro.sur < r.recuadro.norte, "sur y norte están dados vuelta");
  assert.ok(r.recuadro.oeste < r.recuadro.este, "oeste y este están dados vuelta");
});

// ---------------------------------------------------------------------------
// Códigos cortos: la forma en que la gente los comparte
// ---------------------------------------------------------------------------

test("un código corto sin referencia cae en Arica, no en cualquier parte", () => {
  // Es el caso real: alguien dicta "GMCP+MX" por teléfono. Sin referencia por
  // defecto, ese código no significa nada.
  const r = resolverPlusCode(ARICA_CORTO);
  assert.ok(r, "un código corto válido tiene que resolverse");
  assert.equal(r.eraCorto, true);
  assert.equal(r.codigoCompleto, ARICA_COMPLETO, "no se recuperó el código global");
  assert.ok(metros(r, CENTRO_ARICA) < 50);
});

test("la referencia MANDA: el mismo código corto en Santiago es otro lugar", () => {
  // Esta es la razón de que la referencia sea un parámetro y no una constante
  // escondida: un código corto es ambiguo por diseño, y quien lo resuelve tiene
  // que decir respecto de dónde.
  const enArica = resolverPlusCode(ARICA_CORTO, CENTRO_ARICA);
  const enSantiago = resolverPlusCode(ARICA_CORTO, SANTIAGO);

  assert.notEqual(
    enSantiago.codigoCompleto,
    enArica.codigoCompleto,
    "la referencia no cambió nada: un código corto se estaría resolviendo solo",
  );
  assert.ok(
    metros(enSantiago, CENTRO_ARICA) > 100_000,
    "recuperado contra Santiago tenía que caer lejísimo de Arica",
  );
});

test("se acepta como lo escribe la gente: minúsculas y con la ciudad al lado", () => {
  const esperado = resolverPlusCode(ARICA_CORTO).codigoCompleto;
  for (const escrito of ["gmcp+mx", "  GMCP+MX  ", "GMCP+MX, Arica", "GMCP+MX Arica, Chile"]) {
    const r = resolverPlusCode(escrito);
    assert.ok(r, `no se aceptó "${escrito}"`);
    assert.equal(r.codigoCompleto, esperado, `"${escrito}" resolvió a otro lugar`);
  }
});

// ---------------------------------------------------------------------------
// Lo que NO es un código
// ---------------------------------------------------------------------------

test("un código inválido devuelve null y NO lanza", () => {
  // La librería tira un STRING pelado, no un Error: un catch que espere
  // e.message recibe undefined y rompe lejos de acá. Se atrapa en el módulo.
  for (const basura of ["", "   ", "BASURA+", "ABCD+EF", "hola", "+", "1234+56", "57HF"]) {
    assert.doesNotThrow(() => resolverPlusCode(basura), `lanzó con "${basura}"`);
  }
  assert.equal(resolverPlusCode("ABCD+EF"), null, "las letras que no son del alfabeto no valen");
  assert.equal(resolverPlusCode(""), null);
  assert.equal(resolverPlusCode("hola"), null);
});

// ---------------------------------------------------------------------------
// Anotar una casa: el viaje de ida y vuelta
// ---------------------------------------------------------------------------

test("marcar la casa y volver a leerla no la mueve", () => {
  // El uso de verdad: el chofer marca el punto una vez, se guarda el código, y
  // mañana se lee. Si el viaje redondo corre la casa, corre la entrega.
  const puntos = [
    CENTRO_ARICA,
    { lat: -18.4712, lng: -70.2899 }, // Quinsachata 1749, la puerta real medida
    { lat: -18.5211, lng: -70.2402 }, // valle de Azapa
    { lat: -18.4785, lng: -70.3132 },
  ];

  for (const p of puntos) {
    const codigo = plusCodeDe(p);
    const vuelta = resolverPlusCode(codigo);
    assert.ok(vuelta, `no se pudo releer el código de ${p.lat},${p.lng}`);
    assert.ok(
      metros(vuelta, p) < 3,
      `la casa se movió ${metros(vuelta, p).toFixed(1)} m en el viaje de ida y vuelta`,
    );
  }
});

test("once dígitos apuntan a la puerta; diez, a la cuadra", () => {
  // Es la razón de que se anote con once. Diez dígitos son ~14 m: en un pasaje
  // de Arica eso es la casa de al lado.
  const once = resolverPlusCode(plusCodeDe(CENTRO_ARICA, 11));
  const diez = resolverPlusCode(plusCodeDe(CENTRO_ARICA, 10));

  assert.ok(once.precisionMetros < 5, `once dígitos dieron ${once.precisionMetros} m`);
  assert.ok(diez.precisionMetros > 10, `diez dígitos dieron ${diez.precisionMetros} m`);
  assert.ok(once.precisionMetros < diez.precisionMetros);
});

test("un punto imposible no produce un código", () => {
  assert.equal(plusCodeDe({ lat: NaN, lng: -70.3 }), null);
  assert.equal(plusCodeDe({ lat: -18.4, lng: undefined }), null);
});

// ---------------------------------------------------------------------------
// Lo que hace a esta pieza distinta de todo el resto del geocodificador
// ---------------------------------------------------------------------------

test("no se consulta la red ni una sola vez", () => {
  // Es la propiedad que la hace valiosa: sin límite de consultas, sin API key,
  // sin latencia y sin poder fallar. Si alguien mete un fetch acá adentro,
  // esta prueba lo dice.
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("los Plus Codes consultaron la red");
  };
  try {
    assert.ok(resolverPlusCode(ARICA_CORTO));
    assert.ok(plusCodeDe(CENTRO_ARICA));
  } finally {
    globalThis.fetch = original;
  }
});
