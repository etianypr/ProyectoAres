// Spec 017: errores del flujo del conductor que no pueden volver (auditoría
// 2026-10-25), sobre el almacén real (fake-indexeddb).
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { armarGuia } = await import("@/lib/encomiendas/lectura/guia");

const HOY = "2026-10-27";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

async function dosParadas() {
  const { creados } = await almacen.crearDesdeGuia(
    [
      { of: "300000001", destino: "CALLE UNO 100" },
      { of: "300000002", destino: "CALLE DOS 200" },
    ],
    HOY,
    { folio: null, origen: "guia_ia" },
  );
  await almacen.fijarCoordenadas(creados.map((p, i) => ({ id: p.id, lat: -18.47 - i / 1000, lng: -70.29 })));
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: creados.map((p) => p.id), trazado: null, distanciaM: null, duracionS: null });
  return creados;
}

test("E2: deshacer funciona dentro de la ventana y no cuando la entrega ya puede haber salido", async () => {
  const [a, b] = await dosParadas();
  const evA = await almacen.marcarResultado({ fecha: HOY, pedidoId: a.id, conductorId: CONDUCTOR }, "entregado", 8000);
  assert.equal(await almacen.deshacerResultado({ fecha: HOY, pedidoId: a.id }, evA), true);

  const evB = await almacen.marcarResultado({ fecha: HOY, pedidoId: b.id, conductorId: CONDUCTOR }, "entregado", 8000);
  // Vencida la retención el envío ya la puede estar subiendo.
  await almacen.retenerEvento(evB, new Date(Date.now() - 1000).toISOString());
  assert.equal(await almacen.deshacerResultado({ fecha: HOY, pedidoId: b.id }, evB), false);
  assert.equal((await almacen.leerPedidos(HOY)).find((p) => p.id === b.id).resultado, "entregado");
  assert.equal((await almacen.leerCola()).filter((e) => e.id === evB).length, 1, "el evento sigue, para salir una sola vez");
});

test("E2: retener un evento que ya salió no lo revive", async () => {
  const [a] = await dosParadas();
  const ev = await almacen.marcarResultado({ fecha: HOY, pedidoId: a.id, conductorId: CONDUCTOR }, "entregado", 8000);
  await almacen.quitarDeCola([ev]);
  await almacen.retenerEvento(ev, "9999-12-31T00:00:00.000Z");
  assert.equal(await idb.leerUno(idb.STORES.cola, ev), null);
});

test("E4: una etiqueta con la OF confirmada corrige lo leído antes; sin confirmar, no pisa", async () => {
  await dosParadas();
  await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000001", bulto: null, destinatario: "OTRA PERSONA", telefono: "+56911111111" });
  const sinConfirmar = await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000001", bulto: null, destinatario: "JUAN PEREZ", telefono: "+56922222222" });
  assert.equal(sinConfirmar.pedido.telefono, "+56911111111");
  const confirmada = await almacen.aplicarLecturaEtiqueta(HOY, {
    of: "300000001",
    bulto: null,
    ofConfirmada: true,
    destinatario: "JUAN PEREZ",
    telefono: "+56922222222",
  });
  assert.deepEqual([confirmada.pedido.nombre, confirmada.pedido.telefono], ["JUAN PEREZ", "+56922222222"]);
});

test("cargar el auto: cuenta los paquetes de la guía escaneados", async () => {
  await dosParadas();
  assert.deepEqual(almacen.avanceCarga(await almacen.leerPedidos(HOY)), { escaneados: 0, total: 2 });
  await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000002", bulto: 1 });
  assert.deepEqual(almacen.avanceCarga(await almacen.leerPedidos(HOY)), { escaneados: 1, total: 2 });
});

test("E11: si una OF sale en dos fotos, queda la lectura buena y no la cortada", () => {
  const g = armarGuia(
    [
      { of: "300000001", destino: "" },
      { of: "300000001", destino: "CALLE UNO 100" },
      { of: "300000002", destino: "CALLE DOS 2" },
      { of: "300000002", destino: "CALLE DOS 200" },
    ],
    null,
    2,
  );
  assert.deepEqual(g.lineas.map((l) => l.destino), ["CALLE UNO 100", "CALLE DOS 200"]);
  assert.equal(g.lineas.some((l) => l.dudosa), false);
});
