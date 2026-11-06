// Specs 027 y 022: los ⚠ de un pedido. Son los que la hoja pone primero, los que
// «Resolver» abre de a uno y los que se avisan dos paradas antes.
import test from "node:test";
import assert from "node:assert/strict";

const { problemasDelPedido, lugarProvisorio } = await import("@/lib/encomiendas/problemas");

const pedido = (extra = {}) => ({
  lat: -18.48,
  lng: -70.31,
  of: "412803557",
  origenCarga: "guia_foto",
  problemas: [],
  ...extra,
});
const tipos = (p) => problemasDelPedido(p).map((x) => x.tipo);

test("un pedido ubicado y con OF no tiene problemas", () => {
  assert.deepEqual(problemasDelPedido(pedido()), []);
});

test("la OF de otro largo NO es un problema (dueño, 2026-11-06)", () => {
  for (const of of ["41280377", "4128035571", "7"]) assert.deepEqual(tipos(pedido({ of })), [], of);
});

test("sin punto en el mapa: sin ubicar, va primero y no avisa antes (no está en la ruta)", () => {
  const [p] = problemasDelPedido(pedido({ lng: null, of: null }));
  assert.deepEqual(p, { tipo: "sin_ubicar", texto: "Sin ubicar", avisaAntes: false });
  assert.deepEqual(tipos(pedido({ lat: null, lng: null, of: null })), ["sin_ubicar", "sin_of"]);
});

test("sin OF: solo si vino de la guía; a mano no es un problema", () => {
  assert.deepEqual(problemasDelPedido(pedido({ of: null })), [{ tipo: "sin_of", texto: "No se leyó la OF", avisaAntes: false }]);
  assert.deepEqual(tipos(pedido({ of: null, origenCarga: "guia_pegada" })), ["sin_of"]);
  assert.deepEqual(tipos(pedido({ of: null, origenCarga: "manual" })), []);
});

test("spec 022: los ⚠ guardados, con su texto y si avisan dos paradas antes", () => {
  const opcion = { direccion: "Pje. 5 1765", detalle: null, lat: -18.47, lng: -70.3 };
  const guardados = [
    { tipo: "calle_repetida", opciones: [opcion, opcion, opcion] },
    { tipo: "solo_calle", opciones: [opcion] },
    { tipo: "lejana", texto: "Queda a 6,2 km del resto" },
    { tipo: "horario", texto: "No alcanza su horario" },
    { tipo: "etiqueta_otra_direccion", direccion: "Otra 99" },
    { tipo: "fuera_de_guia" },
  ];
  assert.deepEqual(
    problemasDelPedido(pedido({ problemas: guardados })).map((x) => [x.texto, x.avisaAntes]),
    [
      ["Calle en 3 lugares", true],
      ["Sin número: va a mitad de cuadra", true],
      ["Queda a 6,2 km del resto", true],
      ["No alcanza su horario", true],
      ["La etiqueta dice otra dirección", true],
      ["No estaba en la guía", false],
    ],
  );
});

test("spec 022: lo marcado «Va igual» o «Es así» ya no cuenta", () => {
  const problemas = [
    { tipo: "lejana", texto: "Queda a 6,2 km del resto", revisado: true },
    { tipo: "fuera_de_guia", revisado: true },
    { tipo: "horario", texto: "No alcanza su horario" },
  ];
  assert.deepEqual(tipos(pedido({ problemas })), ["horario"]);
});

test("spec 022: la dirección en duda con opciones entra con la primera; sin opciones, no", () => {
  const c = (n) => ({ id: `c${n}`, direccion: `Pje. 5 1765`, detalle: `sector ${n}`, lat: -18.4 - n / 100, lng: -70.3, soloCalle: false });
  const ambigua = lugarProvisorio({ tipo: "ambigua", elegida: null, candidatos: [c(1), c(2), c(3)] });
  assert.deepEqual(ambigua.punto, { lat: -18.41, lng: -70.3 }, "la primera de la búsqueda");
  assert.equal(ambigua.problema.tipo, "calle_repetida");
  assert.deepEqual(ambigua.problema.opciones.map((o) => o.detalle), ["sector 1", "sector 2", "sector 3"]);

  const calle = lugarProvisorio({ tipo: "solo_calle", elegida: null, candidatos: [c(4)] });
  assert.equal(calle.problema.tipo, "solo_calle");

  assert.equal(lugarProvisorio({ tipo: "no_encontrada", elegida: null, candidatos: [] }), null, "sin opciones no hay adonde ir");
  assert.equal(lugarProvisorio({ tipo: "exacta", elegida: c(1), candidatos: [c(1)] }), null, "la elegida no es duda");
  const muchas = lugarProvisorio({ tipo: "ambigua", elegida: null, candidatos: [1, 2, 3, 4, 5, 6, 7].map(c) });
  assert.equal(muchas.problema.opciones.length, 5, "se guardan las que se alcanzan a mirar");
});
