// La pantalla del conductor, partida en piezas (spec 002, T035–T037): lo puro
// que salió de pantalla.tsx. En qué paso está la parada activa decide qué botón
// ve el conductor manejando, así que cada rama tiene su caso.
import test from "node:test";
import assert from "node:assert/strict";

const { faseDeParada, SALIDAS } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/fase-parada");
const { cifrasPantalla } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/cifras-pantalla");

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

test("cifrasPantalla: fuera de la ruta, sin ubicar y avance de la ruta", () => {
  const p = (id, resultado = "pendiente", punto = true) => ({ id, resultado, lat: punto ? -18.47 : null, lng: punto ? -70.3 : null });
  const enRuta = [p("a", "entregado"), p("b", "no_entregado"), p("c"), p("d", "entregado")];
  const paradas = enRuta.map((pedido, i) => ({ secuencia: i + 1, pedido, hayQueContactar: false }));
  const pedidos = [...enRuta, p("x"), p("y", "pendiente", false), p("z", "entregado")];
  const c = cifrasPantalla(paradas, pedidos);
  assert.deepEqual(c.sinRutear.map((x) => x.id), ["x", "y"], "lo cerrado fuera de la ruta no cuenta");
  assert.equal(c.sinUbicar, 1);
  assert.equal(c.entregadas, 2);
  assert.equal(c.noEntregadas, 1);
  assert.equal(c.porcentaje, 50);
  assert.equal(cifrasPantalla([], []).porcentaje, 0);
});
