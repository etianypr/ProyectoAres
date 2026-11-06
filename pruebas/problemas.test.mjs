// Spec 027: los ⚠ que se deducen del pedido. Son los que la hoja pone primero y
// los que «Resolver» abre de a uno, así que cada tipo tiene su caso.
import test from "node:test";
import assert from "node:assert/strict";

const { problemasDelPedido } = await import("@/lib/encomiendas/problemas");

const pedido = (extra = {}) => ({ lat: -18.48, lng: -70.31, of: "412803557", origenCarga: "guia_foto", ...extra });
const tipos = (p) => problemasDelPedido(p).map((x) => x.tipo);

test("un pedido ubicado y con OF de 9 dígitos no tiene problemas", () => {
  assert.deepEqual(problemasDelPedido(pedido()), []);
});

test("sin punto en el mapa: sin ubicar, y va primero", () => {
  assert.deepEqual(tipos(pedido({ lat: null, lng: null, of: "41280377" })), ["sin_ubicar", "of_distinta"]);
  assert.deepEqual(tipos(pedido({ lng: null })), ["sin_ubicar"]);
});

test("OF distinta: dice cuántos dígitos tiene", () => {
  const [p] = problemasDelPedido(pedido({ of: "41280377" }));
  assert.deepEqual(p, { tipo: "of_distinta", texto: "OF de 8 dígitos" });
  assert.equal(problemasDelPedido(pedido({ of: "4128035571" }))[0].texto, "OF de 10 dígitos");
  assert.equal(problemasDelPedido(pedido({ of: "7" }))[0].texto, "OF de 1 dígito");
});

test("sin OF: solo si vino de la guía; a mano no es un problema", () => {
  assert.deepEqual(problemasDelPedido(pedido({ of: null })), [{ tipo: "sin_of", texto: "No se leyó la OF" }]);
  assert.deepEqual(tipos(pedido({ of: null, origenCarga: "guia_pegada" })), ["sin_of"]);
  assert.deepEqual(tipos(pedido({ of: null, origenCarga: "manual" })), []);
});
