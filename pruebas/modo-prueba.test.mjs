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

// ---------------------------------------------------------------------------
// GPS simulado (terreno 2026-10-28): en el PC el "GPS" decía Santiago.

const gps = await import("@/lib/encomiendas/local/gps-simulado");

test("el punto simulado avanza por el camino y se queda al final", () => {
  // Dos tramos rectos de ~111 m cada uno: al norte y después al este.
  const camino = [[-70.3, -18.47], [-70.3, -18.469], [-70.29895, -18.469]];
  const inicio = gps.puntoEnCamino(camino, 0);
  assert.deepEqual([inicio.lat, inicio.lng, inicio.alFinal], [-18.47, -70.3, false]);
  const medio = gps.puntoEnCamino(camino, 55);
  assert.ok(medio.lat > -18.47 && medio.lat < -18.469, "a mitad del primer tramo");
  assert.ok(Math.abs(medio.rumbo - 0) < 1, "va al norte");
  const despues = gps.puntoEnCamino(camino, 160);
  assert.ok(Math.abs(despues.rumbo - 90) < 2, "dobló al este");
  const fin = gps.puntoEnCamino(camino, 10_000);
  assert.deepEqual([fin.lat, fin.lng, fin.alFinal], [-18.469, -70.29895, true]);
});

test("el GPS simulado es solo del modo prueba, y parte en la central", async () => {
  assert.equal(gps.gpsSimulado(), false, "fuera del modo prueba manda el aparato");
  await prueba.entrarAlModoPrueba();
  assert.equal(gps.gpsSimulado(), true, "en modo prueba viene encendido");
  gps.fijarConfigGps({ activo: false });
  assert.equal(gps.gpsSimulado(), false);
  gps.fijarConfigGps({ activo: true });

  localStorage.setItem("pucarani-partida-empresa", JSON.stringify({ texto: "Central", lat: -18.46734, lng: -70.30377 }));
  const lectura = await new Promise((ok) => gps.fuenteUbicacion().getCurrentPosition(ok));
  assert.deepEqual([lectura.coords.latitude, lectura.coords.longitude], [-18.46734, -70.30377]);
});
