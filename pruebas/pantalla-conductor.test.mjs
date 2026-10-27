// La pantalla del conductor, partida en piezas (spec 002, T035–T037): lo puro
// que salió de pantalla.tsx. En qué paso está la parada activa decide qué botón
// ve el conductor manejando, así que cada rama tiene su caso.
import test from "node:test";
import assert from "node:assert/strict";

const { faseDeParada, SALIDAS } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/fase-parada");

const parada = (pedido = {}, hayQueContactar = true) => ({
  pedido: { id: "p1", llamada: null, ...pedido },
  hayQueContactar,
});
const sin = { dandoResultadoDe: null, esperandoResultadoDe: null };

test("faseDeParada: sin parada activa, antes de llamar", () => {
  assert.equal(faseDeParada(null, sin), "antes_llamar");
});

test("faseDeParada: lo que el conductor está haciendo en pantalla manda", () => {
  assert.equal(faseDeParada(parada(), { ...sin, dandoResultadoDe: "p1" }), "salidas");
  assert.equal(faseDeParada(parada(), { ...sin, esperandoResultadoDe: "p1" }), "esperando_resultado");
  // De OTRA parada no cuenta.
  assert.equal(faseDeParada(parada(), { ...sin, dandoResultadoDe: "p2" }), "antes_llamar");
});

test("faseDeParada: si no, lo guardado (cerrar y abrir la app vuelve al mismo paso)", () => {
  assert.equal(faseDeParada(parada({ llamada: "contesto" }), sin), "confirmado");
  assert.equal(faseDeParada(parada({ llamada: "no_contesto" }), sin), "esperando_resultado");
  assert.equal(faseDeParada(parada({}, false), sin), "esperando_entrega", "confirmó por WhatsApp");
  assert.equal(faseDeParada(parada({}, true), sin), "antes_llamar");
});

test("SALIDAS: dejar como pendiente y no entregado, en ese orden", () => {
  assert.deepEqual(
    SALIDAS.map((s) => s.clave),
    ["pendiente", "no_entregado"],
  );
});
