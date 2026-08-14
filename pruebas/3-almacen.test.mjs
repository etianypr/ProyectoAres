// Prueba intensiva del guardado local del chofer (IndexedDB real vía
// fake-indexeddb) contra src/lib/encomiendas/local/almacen.ts + idb.ts reales.
// Es lo que sostiene la jornada sin señal: si acá se pierde un evento, el
// chofer trabaja gratis; si se duplica, se le paga dos veces.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const {
  guardarPedido,
  leerPedidos,
  pedidosPendientes,
  contarPendientes,
  idsGuardados,
  agregarFaltantes,
  fijarCoordenadas,
  borrarPedido,
  guardarRuta,
  leerRuta,
  marcarLlamada,
  marcarEntrega,
  leerCola,
  quitarDeCola,
} = almacen;

const HOY = "2026-08-06";
const CHOFER = "11111111-1111-7111-8111-111111111111";

async function limpiar() {
  // Borra la base entre pruebas para que cada una arranque de cero.
  const { pedidos, rutas, cola } = await import("@/lib/encomiendas/local/idb").then((m) => m.STORES);
  const idb = await import("@/lib/encomiendas/local/idb");
  for (const store of [pedidos, rutas, cola]) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, fila.id ?? fila.fecha);
    });
  }
}

const P = (n, conCoord = true) => ({
  nombre: `Destinatario ${n}`,
  telefono: `+5691222000${n}`,
  direccion: `Calle ${n} 100, Arica`,
  lat: conCoord ? -18.47 - n / 1000 : null,
  lng: conCoord ? -70.29 - n / 1000 : null,
  notas: null,
});

async function cargar(cantidad, conCoord = true) {
  const ids = [];
  for (let i = 1; i <= cantidad; i++) {
    const p = await guardarPedido(P(i, conCoord));
    ids.push(p.id);
  }
  return ids;
}

test.beforeEach(limpiar);

// -------------------------------------------------------------- pedidos
test("guardarPedido crea con id propio y estado pendiente", async () => {
  const p = await guardarPedido(P(1));
  assert.match(p.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "no es UUIDv7");
  assert.equal(p.estado, "pendiente");
  assert.equal((await leerPedidos()).length, 1);
  assert.equal(await contarPendientes(), 1);
});

test("editar un pedido no lo reabre ni lo cierra, ni le cambia la fecha de carga", async () => {
  const p = await guardarPedido(P(1));
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [p.id], geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: p.id, choferId: CHOFER }, "entregado");

  const editado = await guardarPedido({ ...P(1), nombre: "Corregido" }, p.id);
  assert.equal(editado.estado, "entregado", "editar reabrió un pedido ya entregado");
  assert.equal(editado.cargadoEn, p.cargadoEn);
  assert.equal(editado.nombre, "Corregido");
  assert.equal(await contarPendientes(), 0);
});

test("agregarFaltantes no pisa lo que ya está (traspaso idempotente)", async () => {
  const ids = await cargar(3);
  const ajenos = ids.map((id, i) => ({
    id,
    ...P(i + 1),
    estado: "pendiente",
    cargadoEn: "2020-01-01T00:00:00.000Z",
  }));
  assert.equal(await agregarFaltantes(ajenos), 0, "volvió a traer pedidos que ya estaban");
  assert.equal(await agregarFaltantes([...ajenos, { id: "otro-id", ...P(9), estado: "pendiente", cargadoEn: "2026-01-01T00:00:00.000Z" }]), 1);
  assert.equal((await leerPedidos()).length, 4);
  const original = (await leerPedidos()).find((p) => p.id === ids[0]);
  assert.notEqual(original.cargadoEn, "2020-01-01T00:00:00.000Z", "pisó la fecha de carga original");
});

test("idsGuardados incluye los entregados (para no volver a traerlos)", async () => {
  const [id] = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [id], geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");
  assert.ok((await idsGuardados()).has(id));
});

test("fijarCoordenadas solo toca lat/lng y se saltea los borrados sin lanzar", async () => {
  const ids = await cargar(2, false);
  await fijarCoordenadas([
    { id: ids[0], lat: -18.5, lng: -70.3 },
    { id: "no-existe", lat: 0, lng: 0 },
  ]);
  const pedidos = await leerPedidos();
  const arreglado = pedidos.find((p) => p.id === ids[0]);
  assert.equal(arreglado.lat, -18.5);
  assert.equal(arreglado.nombre, "Destinatario 1", "cambió otros campos");
  assert.equal(pedidos.find((p) => p.id === ids[1]).lat, null);
  await fijarCoordenadas([]); // no debe lanzar
});

test("borrarPedido lo saca también de la ruta del día", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await borrarPedido(ids[1], HOY);
  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.paradas.map((p) => p.pedidoId), [ids[0], ids[2]]);
  assert.equal((await leerPedidos()).length, 2);
});

test("borrarPedido no borra los eventos ya contados", async () => {
  const [id] = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [id], geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");
  // Una entrega ya prueba el día trabajado: no hace falta encolar una 'llamada'.
  assert.equal((await leerCola()).length, 1);
  await borrarPedido(id, HOY);
  assert.equal((await leerCola()).length, 1, "se perdió una entrega ya hecha del sueldo del chofer");
});

// ----------------------------------------------------------- ruta del día
test("guardarRuta conserva lo cerrado y le pone detrás el orden nuevo", async () => {
  const ids = await cargar(5);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: [[1, 2]], distanciaM: 100, duracionS: 10 });
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado");
  await marcarEntrega({ fecha: HOY, pedidoId: ids[1], choferId: CHOFER }, "omitido");

  // Regeneración a media mañana con el orden invertido y un pedido nuevo.
  const nuevo = await guardarPedido(P(6));
  const ruta = await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [nuevo.id, ids[4], ids[3], ids[2], ids[1], ids[0]],
    geometria: null,
    distanciaM: null,
    duracionS: null,
  });

  assert.deepEqual(
    ruta.paradas.map((p) => p.pedidoId),
    [ids[0], ids[1], nuevo.id, ids[4], ids[3], ids[2]],
    "las cerradas deben quedar primero, en su orden, y no repetirse",
  );
  assert.equal(ruta.paradas.filter((p) => p.entrega !== "pendiente").length, 2);
  assert.equal(new Set(ruta.paradas.map((p) => p.pedidoId)).size, ruta.paradas.length, "parada duplicada");
  assert.deepEqual(ruta.geometria, [[1, 2]], "sin trazado nuevo debe conservar el anterior");
  assert.equal(ruta.distanciaM, 100);
});

test("regenerar la ruta conserva la llamada ya hecha de una parada pendiente", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await marcarLlamada({ fecha: HOY, pedidoId: ids[2], choferId: CHOFER }, "contesto");

  const ruta = await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [ids[2], ids[1], ids[0]],
    geometria: null,
    distanciaM: null,
    duracionS: null,
  });
  const parada = ruta.paradas.find((p) => p.pedidoId === ids[2]);
  assert.equal(parada.llamada, "contesto", "el chofer tendría que volver a llamar sin motivo");
  assert.ok(parada.horaLlamada);
  assert.equal(parada.entrega, "pendiente");
});

test("regenerar 50 veces no duplica paradas ni pierde lo cerrado", async () => {
  const ids = await cargar(12);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  for (let i = 0; i < 12; i += 3) {
    await marcarEntrega({ fecha: HOY, pedidoId: ids[i], choferId: CHOFER }, "entregado");
  }
  for (let v = 0; v < 50; v++) {
    const mezcla = [...ids].sort(() => Math.random() - 0.5);
    await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: mezcla, geometria: null, distanciaM: null, duracionS: null });
    const ruta = await leerRuta(HOY);
    assert.equal(new Set(ruta.paradas.map((p) => p.pedidoId)).size, ruta.paradas.length);
    assert.equal(ruta.paradas.filter((p) => p.entrega === "entregado").length, 4);
    assert.equal(ruta.paradas.length, 12);
  }
  assert.equal((await leerCola()).length, 4, "regenerar la ruta alteró la cola de eventos");
});

test("cada día tiene su propia ruta y no se pisan", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: "2026-08-05", pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [ids[1]], geometria: null, distanciaM: null, duracionS: null });
  assert.equal((await leerRuta("2026-08-05")).paradas.length, 2);
  assert.equal((await leerRuta(HOY)).paradas.length, 1);
  assert.equal(await leerRuta("2026-01-01"), null);
});

// ------------------------------------------------- marcar en terreno (plata)
test("la primera acción del día encola una 'llamada' (prueba del día trabajado) y solo una", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });

  await marcarLlamada({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "contesto");
  let cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "llamada");

  await marcarLlamada({ fecha: HOY, pedidoId: ids[1], choferId: CHOFER }, "no_contesto");
  cola = await leerCola();
  assert.equal(cola.filter((e) => e.tipo === "llamada").length, 1, "encoló una segunda llamada de más");
});

test("un día en que solo se llama igual queda registrado como trabajado", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await marcarLlamada({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "no_contesto");
  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].fecha, HOY);
  assert.equal(cola[0].choferId, CHOFER);
});

test("marcar entrega cierra el pedido y encola el evento en la MISMA transacción", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado");

  const pedido = (await leerPedidos()).find((p) => p.id === ids[0]);
  assert.equal(pedido.estado, "entregado");
  const cola = await leerCola();
  assert.equal(cola.filter((e) => e.tipo === "entrega").length, 1);
  const ruta = await leerRuta(HOY);
  assert.equal(ruta.paradas.find((p) => p.pedidoId === ids[0]).entrega, "entregado");
  assert.ok(ruta.paradas.find((p) => p.pedidoId === ids[0]).horaEntrega);
});

test("omitir NO cierra el pedido: se arrastra al día siguiente", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "omitido");

  assert.equal((await pedidosPendientes()).length, 1, "una omisión cerró el pedido");
  assert.equal(await contarPendientes(), 1);
  assert.equal((await leerCola()).filter((e) => e.tipo === "omision").length, 1);
  // Y al día siguiente entra de nuevo en la ruta.
  const manana = await guardarRuta({ fecha: "2026-08-07", pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  assert.equal(manana.paradas[0].entrega, "pendiente");
});

test("marcar dos veces la misma parada no duplica el evento (ni el pago)", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado");
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado");
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "omitido");
  assert.equal((await leerCola()).filter((e) => e.tipo !== "llamada").length, 1);
});

test("doble toque simultáneo (dos dedos / doble tap) tampoco duplica", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  const marca = { fecha: HOY, pedidoId: ids[0], choferId: CHOFER };
  await Promise.all([
    marcarEntrega(marca, "entregado"),
    marcarEntrega(marca, "entregado"),
    marcarEntrega(marca, "entregado"),
  ]);
  const entregas = (await leerCola()).filter((e) => e.tipo === "entrega");
  assert.equal(entregas.length, 1, `se encolaron ${entregas.length} entregas por el mismo pedido`);
});

test("ubicar direcciones mientras el chofer marca no reabre lo ya entregado", async () => {
  // fijarCoordenadas corre al rearmar la ruta, con consultas de red en el
  // medio: lee el pedido, y si el chofer lo marca entregado mientras tanto, al
  // guardar las coordenadas lo devolvía a "pendiente" y el paquete reaparecía
  // al día siguiente como no entregado.
  const ids = await cargar(3, false);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });

  await Promise.all([
    fijarCoordenadas(ids.map((id, i) => ({ id, lat: -18.47 - i / 1000, lng: -70.29 }))),
    marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado"),
  ]);

  const pedido = (await leerPedidos()).find((p) => p.id === ids[0]);
  assert.equal(pedido.estado, "entregado", "la geocodificación reabrió un pedido ya entregado");
  assert.equal(pedido.lat, -18.47, "se perdieron las coordenadas");
  assert.equal((await pedidosPendientes()).length, 2);
});

test("una operación que falla no deja la fila trabada para el resto de la jornada", async () => {
  const ids = await cargar(2);
  // Esta lanza (no hay ruta todavía) y no debe romper las siguientes.
  await assert.rejects(() => marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado"));
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado");
  assert.equal((await leerCola()).length, 1);
});

test("marcar sobre una ruta o un pedido que no existen falla con mensaje claro y sin escribir nada", async () => {
  const ids = await cargar(1);
  await assert.rejects(
    () => marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado"),
    /No hay una ruta/,
  );
  await assert.rejects(
    () => marcarLlamada({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "contesto"),
    /No hay una ruta/,
  );
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  await assert.rejects(
    () => marcarEntrega({ fecha: HOY, pedidoId: "fantasma", choferId: CHOFER }, "entregado"),
    /ya no existe|no está en la ruta/,
  );
  await assert.rejects(
    () => marcarLlamada({ fecha: HOY, pedidoId: "fantasma", choferId: CHOFER }, "contesto"),
    /no está en la ruta/,
  );
  assert.equal((await leerCola()).length, 0, "escribió eventos de una marca que falló");
});

test("un pedido borrado del teléfono pero aún en la ruta no se puede marcar (y no rompe)", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  // Se borra del store de pedidos sin tocar la ruta (estado imposible por la
  // app, pero es lo que quedaría si una escritura se cortara a mitad).
  const idb = await import("@/lib/encomiendas/local/idb");
  await idb.escribir([idb.STORES.pedidos], ({ borrar }) => borrar(idb.STORES.pedidos, ids[0]));
  await assert.rejects(
    () => marcarEntrega({ fecha: HOY, pedidoId: ids[0], choferId: CHOFER }, "entregado"),
    /ya no existe/,
  );
});

// ------------------------------------------------------------------ cola
test("la cola sale de la más vieja a la más nueva", async () => {
  const ids = await cargar(4);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  for (const id of ids) {
    await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");
  }
  const cola = await leerCola();
  const horas = cola.map((e) => e.hora);
  assert.deepEqual(horas, [...horas].sort(), "la cola no está ordenada por hora");
  assert.equal(new Set(cola.map((e) => e.id)).size, cola.length, "id de evento repetido: el servidor descartaría uno");
});

test("quitarDeCola solo saca los confirmados", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  for (const id of ids) await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");
  const cola = await leerCola();
  await quitarDeCola(cola.slice(0, 2).map((e) => e.id));
  const quedan = await leerCola();
  assert.equal(quedan.length, cola.length - 2);
  await quitarDeCola(["no-existe"]); // no debe lanzar
  await quitarDeCola([]);
  assert.equal((await leerCola()).length, quedan.length);
});

// -------------------------------------------------- jornada completa real
test("jornada completa de 30 paradas: los eventos cuadran exactamente con el pago", async () => {
  const { agruparPorDia, contarActividad } = await import("@/lib/encomiendas/pago");
  const ids = await cargar(30);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });

  let entregadas = 0;
  let omitidas = 0;
  for (const [i, id] of ids.entries()) {
    // Cada 5 paradas el destinatario no contesta: llamada + omisión.
    if (i % 5 === 4) {
      await marcarLlamada({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "no_contesto");
      await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "omitido");
      omitidas++;
    } else {
      await marcarLlamada({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "contesto");
      await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");
      entregadas++;
    }
  }

  const cola = await leerCola();
  // 30 eventos de cierre + 1 sola llamada (la primera acción del día).
  assert.equal(cola.length, 31, `la cola tiene ${cola.length} eventos, esperaba 31`);
  const conteo = contarActividad(cola.map((e) => ({ tipo: e.tipo })));
  assert.deepEqual(conteo, { entregados: entregadas, omitidos: omitidas });

  // Lo que vería el panel al recibir esa cola.
  const [dia] = agruparPorDia(
    cola.map((e) => ({ chofer_id: e.choferId, fecha: e.fecha, tipo: e.tipo, origen: "app" })),
  );
  assert.deepEqual(dia.conteo, { entregados: 24, omitidos: 6 });
  assert.equal(dia.eventos.length, 31);

  // Estado final del teléfono: las omitidas siguen pendientes para mañana.
  assert.equal((await pedidosPendientes()).length, 6);
  assert.equal(await contarPendientes(), 6);
  const ruta = await leerRuta(HOY);
  assert.equal(ruta.paradas.filter((p) => p.entrega === "pendiente").length, 0);
});

test("contarPendientes por índice coincide siempre con el filtrado a mano", async () => {
  const ids = await cargar(20);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, geometria: null, distanciaM: null, duracionS: null });
  for (let i = 0; i < 20; i++) {
    await marcarEntrega(
      { fecha: HOY, pedidoId: ids[i], choferId: CHOFER },
      i % 3 === 0 ? "omitido" : "entregado",
    );
    assert.equal(await contarPendientes(), (await pedidosPendientes()).length, `desfase en la parada ${i}`);
  }
});
