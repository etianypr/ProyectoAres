// Modo prueba (terreno 2026-10-28): probar en terreno sin que nada llegue a la
// oficina ni a un cliente. Datos inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

// localStorage del teléfono, en memoria.
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => memoria.get(k) ?? null,
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const prueba = await import("@/lib/encomiendas/local/modo-prueba");
const { enviarActividadPendiente, sincronizarDiaTrabajo } = await import("@/lib/encomiendas/local/enviar");

const HOY = "2026-10-28";
const evento = (id) => ({ id, conductorId: "c-1", fecha: HOY, hora: `${HOY}T12:00:00.000Z`, tipo: "llamada" });

test.beforeEach(async () => {
  memoria.clear();
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

test("encendido no manda la cola ni el día: no sale ninguna consulta", async (t) => {
  await prueba.entrarAlModoPrueba();
  assert.equal(prueba.enModoPrueba(), true);
  await idb.escribir([idb.STORES.cola], ({ guardar }) => guardar(idb.STORES.cola, evento("e-1")));

  const fetchOriginal = globalThis.fetch;
  let consultas = 0;
  globalThis.fetch = async () => {
    consultas++;
    return new Response("{}");
  };
  t.after(() => (globalThis.fetch = fetchOriginal));

  assert.deepEqual(await enviarActividadPendiente(), { enviados: 0, pendientes: 1 });
  await sincronizarDiaTrabajo("c-1", HOY);
  assert.equal(consultas, 0, "salió una consulta en modo prueba");
});

test("salir borra lo de la prueba —pedidos, ruta, cola— y apaga el modo", async () => {
  await prueba.entrarAlModoPrueba();
  const p = await almacen.guardarPedido(
    { nombre: "Cliente Prueba", telefono: "+56911112222", direccion: "Calle Uno 100, Arica", lat: -18.47, lng: -70.3, notas: null },
    HOY,
  );
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [p.id], trazado: null, distanciaM: null, duracionS: null });
  await idb.escribir([idb.STORES.cola], ({ guardar }) => guardar(idb.STORES.cola, evento("e-2")));

  await prueba.salirDelModoPrueba();

  assert.equal(prueba.enModoPrueba(), false);
  assert.equal((await almacen.leerPedidos(HOY)).length, 0);
  assert.equal(await almacen.leerRuta(HOY), null);
  assert.equal((await idb.leerTodos(idb.STORES.cola)).length, 0);
  assert.equal((await idb.leerTodos(idb.STORES.dias)).length, 0, "la prueba no queda en Tus días");
});

test("no se entra con actividad sin enviar: es trabajo de verdad y salir la borraría", async () => {
  await idb.escribir([idb.STORES.cola], ({ guardar }) => guardar(idb.STORES.cola, evento("e-3")));
  await assert.rejects(() => prueba.entrarAlModoPrueba(), /sin enviar/);
  assert.equal(prueba.enModoPrueba(), false);
});
