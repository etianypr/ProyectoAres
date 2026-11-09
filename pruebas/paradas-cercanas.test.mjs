// Spec 023: en cada parada, las paradas que quedan cerca (dueño, 2026-11-08: a
// menos de 300 m en línea recta, sin las 2 que siguen, hasta 3) y «Hacer ahora»,
// que deja una como la próxima. La selección es pura; «Hacer ahora» corre sobre
// IndexedDB de verdad (fake-indexeddb) y no consulta nada.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { paradasCercanas, METROS_CERCA } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/paradas-cercanas");
const almacen = await import("@/lib/encomiendas/local/almacen");
const { guardarPedido, guardarRuta, leerRuta, marcarResultado } = almacen;
const { hacerAhora } = await import("@/lib/encomiendas/local/sumar-a-ruta");
const idb = await import("@/lib/encomiendas/local/idb");

const BASE = { lat: -18.4783, lng: -70.2979 };
/** Grados de latitud por metro. */
const LAT_POR_M = 1 / 110_540;

/** Un pedido a `m` metros al sur de la base. */
const P = (id, m, extra = {}) => ({
  id,
  lat: BASE.lat - m * LAT_POR_M,
  lng: BASE.lng,
  resultado: "pendiente",
  direccion: `Calle ${id}`,
  telefono: null,
  ...extra,
});
const enRuta = (pedidos) => pedidos.map((pedido, i) => ({ secuencia: i + 1, pedido, hayQueContactar: false }));

test("paradasCercanas: las de más adelante a menos de 300 m, sin las 2 que siguen", () => {
  // La 1 está entregada; la activa es la 2. La 3 y la 4 vienen igual; la 5 (a
  // 250 m) y la 6 (a 100 m) quedaron atrás en la ruta; la 7 está a 600 m.
  const paradas = enRuta([
    P("a", 0, { resultado: "entregado" }),
    P("activa", 0),
    P("sigue1", 50),
    P("sigue2", 60),
    P("lejos-en-ruta", 250),
    P("dejada", 100),
    P("muy-lejos", 600),
  ]);
  const cercanas = paradasCercanas(paradas, paradas[1], paradas.map((p) => p.pedido));
  assert.deepEqual(
    cercanas.map((c) => [c.pedido.id, c.secuencia]),
    [
      ["dejada", 6],
      ["lejos-en-ruta", 5],
    ],
  );
  assert.ok(cercanas.every((c) => c.metros <= METROS_CERCA));
});

test("paradasCercanas: entran los pendientes de fuera de la ruta con punto, y como mucho tres", () => {
  const paradas = enRuta([P("activa", 0), P("s1", 900), P("s2", 950)]);
  const fuera = [
    P("f1", 40),
    P("f2", 80),
    P("f3", 120),
    P("f4", 160),
    P("sin-punto", 0, { lat: null, lng: null }),
    P("cerrado", 10, { resultado: "no_entregado" }),
  ];
  const cercanas = paradasCercanas(paradas, paradas[0], [...paradas.map((p) => p.pedido), ...fuera]);
  assert.deepEqual(
    cercanas.map((c) => [c.pedido.id, c.secuencia]),
    [
      ["f1", null],
      ["f2", null],
      ["f3", null],
    ],
  );
});

test("paradasCercanas: sin parada activa o sin su punto, ninguna", () => {
  const paradas = enRuta([P("activa", 0, { lat: null, lng: null }), P("s1", 10), P("s2", 20), P("cerca", 30)]);
  assert.deepEqual(paradasCercanas(paradas, null, []), []);
  assert.deepEqual(paradasCercanas(paradas, paradas[0], []), []);
});

// ----------------------------------------------------------------- «Hacer ahora»
const HOY = "2026-08-23";
const CLAVE = {
  [idb.STORES.pedidos]: (f) => f.id,
  [idb.STORES.rutas]: (f) => f.fecha,
  [idb.STORES.cola]: (f) => f.id,
};

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, CLAVE[store](fila));
    });
  }
  // «Hacer ahora» no pide trazado: cualquier consulta es un error.
  globalThis.fetch = async (url) => {
    throw new Error(`consulta inesperada: ${url}`);
  };
});

async function pedido(n) {
  const p = { nombre: `Cliente ${n}`, telefono: null, direccion: `Calle ${n}`, lat: BASE.lat - n * 0.001, lng: BASE.lng, notas: null };
  return (await guardarPedido(p, HOY)).id;
}

async function rutaDe(n) {
  const ids = [];
  for (let k = 1; k <= n; k++) ids.push(await pedido(k));
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: [[BASE.lng, BASE.lat]], distanciaM: null, duracionS: null });
  return ids;
}

test("hacerAhora: una parada de más adelante pasa a ser la próxima; lo cerrado y la activa no se mueven", async () => {
  const ids = await rutaDe(6);
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: "11111111-1111-7111-8111-111111111111" }, "entregado");
  await hacerAhora(HOY, ids[5]);
  assert.deepEqual((await leerRuta(HOY)).orden, [ids[0], ids[1], ids[5], ids[2], ids[3], ids[4]]);
});

test("hacerAhora: un pedido de fuera de la ruta entra como la próxima", async () => {
  const ids = await rutaDe(3);
  const fuera = await pedido(9);
  await hacerAhora(HOY, fuera);
  assert.deepEqual((await leerRuta(HOY)).orden, [ids[0], fuera, ids[1], ids[2]]);
});

test("hacerAhora: un pedido que ya no está pendiente no se mueve", async () => {
  const ids = await rutaDe(3);
  await marcarResultado({ fecha: HOY, pedidoId: ids[2], conductorId: "11111111-1111-7111-8111-111111111111" }, "no_entregado");
  await assert.rejects(hacerAhora(HOY, ids[2]), /ya no está pendiente/);
  assert.deepEqual((await leerRuta(HOY)).orden.length, 3);
});
