// Prueba intensiva de la cola offline: src/lib/encomiendas/local/enviar.ts real,
// con un doble del cliente de Supabase. Lo que se verifica es la regla de oro:
// nada se borra del teléfono sin confirmación del servidor.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { enviarActividadPendiente } = await import("@/lib/encomiendas/local/enviar");
const { leerCola, marcarEntrega, guardarPedido, guardarRuta } = await import(
  "@/lib/encomiendas/local/almacen"
);
const idb = await import("@/lib/encomiendas/local/idb");
const { espia } = await import("./dobles/supabase-client.mjs");

const HOY = "2026-08-06";
const CHOFER = "11111111-1111-7111-8111-111111111111";

async function limpiar() {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, fila.id ?? fila.fecha);
    });
  }
  espia.reset();
}

/** Encola n eventos reales pasando por marcarEntrega (no a mano). */
async function encolar(n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const p = await guardarPedido({
      nombre: `D${i}`,
      telefono: "+56911111111",
      direccion: `Calle ${i}`,
      lat: -18.47,
      lng: -70.29,
      notas: null,
    });
    ids.push(p.id);
  }
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  for (const id of ids) {
    await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");
  }
  return ids;
}

test.beforeEach(limpiar);

test("cola vacía: no consulta al servidor", async () => {
  const res = await enviarActividadPendiente();
  assert.deepEqual(res, { enviados: 0, pendientes: 0 });
  assert.equal(espia.llamadas.length, 0);
});

test("manda los eventos con las columnas exactas de encomienda_actividad", async () => {
  await encolar(3);
  const res = await enviarActividadPendiente();
  assert.deepEqual(res, { enviados: 3, pendientes: 0 });
  assert.equal(espia.llamadas.length, 1);

  const { tabla, filas, opciones } = espia.llamadas[0];
  assert.equal(tabla, "encomienda_actividad");
  assert.deepEqual(opciones, { onConflict: "id", ignoreDuplicates: true });
  for (const f of filas) {
    assert.deepEqual(Object.keys(f).sort(), ["chofer_id", "fecha", "hora", "id", "tipo"]);
    assert.ok(!("origen" in f), "no debe mandar 'origen': la base pone 'app' por defecto");
    assert.ok(!("choferId" in f), "quedó el nombre del dominio local en vez de la columna");
    assert.equal(f.fecha, HOY);
    assert.equal(f.chofer_id, CHOFER);
    assert.match(f.hora, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(["entrega", "omision", "llamada"].includes(f.tipo));
  }
  assert.equal((await leerCola()).length, 0, "no vació la cola después de confirmar");
});

test("si el servidor falla, LANZA y la cola queda intacta", async () => {
  await encolar(4);
  espia.responder = () => ({ error: { message: "sin señal" } });
  await assert.rejects(() => enviarActividadPendiente(), /sin señal/);
  assert.equal((await leerCola()).length, 4, "se perdieron eventos que el servidor no confirmó");

  // Y al volver la señal se envían igual, con los MISMOS ids (idempotencia).
  const idsEncolados = (await leerCola()).map((e) => e.id);
  espia.responder = () => ({ error: null });
  const res = await enviarActividadPendiente();
  assert.equal(res.enviados, 4);
  assert.deepEqual(
    espia.llamadas.at(-1).filas.map((f) => f.id).sort(),
    idsEncolados.sort(),
    "los ids cambiaron al reintentar: el servidor contaría las entregas dos veces",
  );
  assert.equal((await leerCola()).length, 0);
});

test("reintento tras un corte a mitad de confirmación no duplica (ignoreDuplicates)", async () => {
  await encolar(2);
  const ids = (await leerCola()).map((e) => e.id);
  // Primer envío: el servidor lo recibe pero la respuesta no llega (se simula
  // como fallo) → la cola queda con todo.
  espia.responder = () => ({ error: { message: "timeout" } });
  await assert.rejects(() => enviarActividadPendiente());
  espia.responder = () => ({ error: null });
  await enviarActividadPendiente();
  const enviadosTotales = espia.llamadas.flatMap((l) => l.filas.map((f) => f.id));
  // Los mismos ids se mandaron dos veces, y el "on conflict do nothing" del
  // servidor es lo que evita el doble conteo.
  assert.deepEqual([...new Set(enviadosTotales)].sort(), ids.sort());
  assert.ok(espia.llamadas.every((l) => l.opciones.ignoreDuplicates === true));
});

test("más de 100 eventos: se vacía por lotes sin perder ni repetir ninguno", async () => {
  await encolar(250);
  assert.equal((await leerCola()).length, 250);

  const mandados = [];
  let vueltas = 0;
  for (;;) {
    const { enviados, pendientes } = await enviarActividadPendiente();
    mandados.push(...espia.llamadas.at(-1).filas.map((f) => f.id));
    vueltas++;
    assert.ok(enviados <= 100, `un lote llevó ${enviados} eventos`);
    if (enviados === 0 || pendientes === 0) break;
    assert.ok(vueltas < 10, "el bucle de vaciado no termina");
  }
  assert.equal(vueltas, 3);
  assert.equal(mandados.length, 250);
  assert.equal(new Set(mandados).size, 250, "algún evento se mandó dos veces");
  assert.equal((await leerCola()).length, 0);
});

test("los lotes salen del más viejo al más nuevo", async () => {
  await encolar(120);
  const orden = (await leerCola()).map((e) => e.id);
  await enviarActividadPendiente();
  await enviarActividadPendiente();
  const mandados = espia.llamadas.flatMap((l) => l.filas.map((f) => f.id));
  assert.deepEqual(mandados, orden, "la cola no salió en orden de antigüedad");
});

test("un fallo en el lote 2 conserva exactamente lo que no se confirmó", async () => {
  await encolar(150);
  await enviarActividadPendiente(); // los 100 primeros, OK
  assert.equal((await leerCola()).length, 50);
  espia.responder = () => ({ error: { message: "se cortó" } });
  await assert.rejects(() => enviarActividadPendiente());
  assert.equal((await leerCola()).length, 50, "perdió los 50 que nunca se confirmaron");
});
