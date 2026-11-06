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
const sin = { dandoResultadoDe: null };

test("faseDeParada: en la parada, salvo que se esté eligiendo una salida", () => {
  assert.equal(faseDeParada(null, sin), "en_parada");
  assert.equal(faseDeParada(parada(), sin), "en_parada");
  assert.equal(faseDeParada(parada({ llamada: "no_contesto" }), sin), "en_parada", "ya no hay paso de \"¿contestó?\"");
  assert.equal(faseDeParada(parada(), { dandoResultadoDe: "p1" }), "salidas");
  // De OTRA parada no cuenta.
  assert.equal(faseDeParada(parada(), { dandoResultadoDe: "p2" }), "en_parada");
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
