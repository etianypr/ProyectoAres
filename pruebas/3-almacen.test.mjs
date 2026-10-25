// Prueba intensiva del guardado local del conductor (IndexedDB real vía
// fake-indexeddb) contra src/lib/encomiendas/local/almacen/ + idb.ts reales.
// Es lo que sostiene el día sin señal: si acá se pierde un evento, el
// conductor trabaja gratis; si se duplica, se le paga dos veces.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const {
  guardarPedido,
  leerPedidos,
  pedidosPendientes,
  fijarCoordenadas,
  borrarPedido,
  restaurarPedido,
  registrarAvisoEnviado,
  guardarRuta,
  leerRuta,
  marcarLlamada,
  marcarResultado,
  cerrarDia,
  leerDias,
  leerCola,
  quitarDeCola,
} = almacen;

const HOY = "2026-08-06";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

async function limpiar() {
  // Borra la base entre pruebas para que cada una arranque de cero.
  const idb = await import("@/lib/encomiendas/local/idb");
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, fila.id ?? fila.fecha ?? fila.pedidoId);
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
    const p = await guardarPedido(P(i, conCoord), HOY);
    ids.push(p.id);
  }
  return ids;
}

test.beforeEach(limpiar);

// -------------------------------------------------------------- pedidos
test("guardarPedido crea con id propio, del día y pendiente", async () => {
  const p = await guardarPedido(P(1), HOY);
  assert.match(p.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "no es UUIDv7");
  assert.equal(p.resultado, "pendiente");
  assert.equal(p.llamada, "pendiente");
  assert.equal(p.fecha, HOY);
  assert.equal((await leerPedidos(HOY)).length, 1);
  assert.equal((await pedidosPendientes(HOY)).length, 1);
});

test("editar un pedido no lo reabre ni lo cierra, ni le cambia la fecha de carga", async () => {
  const p = await guardarPedido(P(1), HOY);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [p.id], trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: p.id, conductorId: CONDUCTOR }, "entregado");

  const editado = await guardarPedido({ ...P(1), nombre: "Corregido" }, HOY, p.id);
  assert.equal(editado.resultado, "entregado", "editar reabrió un pedido ya entregado");
  assert.equal(editado.fecha, HOY);
  assert.equal(editado.cargadoEn, p.cargadoEn);
  assert.equal(editado.nombre, "Corregido");
  assert.equal((await pedidosPendientes(HOY)).length, 0);
});

test("fijarCoordenadas solo toca lat/lng y se saltea los borrados sin lanzar", async () => {
  const ids = await cargar(2, false);
  await fijarCoordenadas([
    { id: ids[0], lat: -18.5, lng: -70.3 },
    { id: "no-existe", lat: 0, lng: 0 },
  ]);
  const pedidos = await leerPedidos(HOY);
  const arreglado = pedidos.find((p) => p.id === ids[0]);
  assert.equal(arreglado.lat, -18.5);
  assert.equal(arreglado.nombre, "Destinatario 1", "cambió otros campos");
  assert.equal(pedidos.find((p) => p.id === ids[1]).lat, null);
  await fijarCoordenadas([]); // no debe lanzar
});

test("borrarPedido lo saca también de la ruta del día", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await borrarPedido(ids[1]);
  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, [ids[0], ids[2]]);
  assert.equal((await leerPedidos(HOY)).length, 2);
});

test("borrarPedido no borra los eventos ya contados", async () => {
  const [id] = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [id], trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");
  // Una entrega ya prueba el día trabajado: no hace falta encolar una 'llamada'.
  assert.equal((await leerCola()).length, 1);
  await borrarPedido(id);
  assert.equal((await leerCola()).length, 1, "se perdió una entrega ya hecha del sueldo del conductor");
});

// Eliminar deslizando la fila (ver conductor/encomiendas/_componentes/fila-deslizable.tsx)
// tiene que poder deshacerse: el conductor escribió esa dirección y ese teléfono a
// mano, y no están en ningún otro lado. Lo que se prueba acá es el recibo.
test("borrarPedido devuelve el recibo con el lugar que ocupaba en la ruta", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  const recibo = await borrarPedido(ids[1]);
  assert.equal(recibo.pedido.id, ids[1]);
  assert.equal(recibo.posicion, 1);
});

test("restaurarPedido lo devuelve al MISMO lugar de la ruta, no al final", async () => {
  const ids = await cargar(4);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  const recibo = await borrarPedido(ids[1]);
  await restaurarPedido(recibo);

  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, ids, "la parada volvió en otro orden");
  assert.equal((await leerPedidos(HOY)).length, 4);
});

test("restaurarPedido conserva lo que ya se había marcado en ese pedido", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarLlamada({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "no_contesto");

  const recibo = await borrarPedido(ids[0]);
  await restaurarPedido(recibo);

  const ruta = await leerRuta(HOY);
  assert.equal(ruta.orden[0], ids[0]);
  assert.equal((await leerPedidos(HOY)).find((p) => p.id === ids[0]).llamada, "no_contesto");
});

test("restaurarPedido dos veces deja UNA sola parada", async () => {
  // El aviso de "Deshacer" vive sobre el mapa y se puede tocar dos veces antes
  // de que la pantalla se rehaga. Duplicado, el conductor iría dos veces al mismo
  // domicilio.
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  const recibo = await borrarPedido(ids[0]);
  await restaurarPedido(recibo);
  await restaurarPedido(recibo);

  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, ids);
});

test("borrarPedido de uno que ya no está no lanza y devuelve null", async () => {
  const [id] = await cargar(1);
  assert.ok(await borrarPedido(id));
  assert.equal(await borrarPedido(id), null, "dos gestos sobre la misma fila no son un error");
});

test("el aviso va dentro del pedido: borrar se lo lleva y restaurar lo devuelve", async () => {
  // Si se perdiera al restaurar, al receptor le llegaría el mismo aviso dos veces.
  const [id] = await cargar(1);
  await registrarAvisoEnviado({ pedidoId: id, codigo: "corr-1", mensajeId: "wamid.1" });

  const recibo = await borrarPedido(id);
  assert.deepEqual(await leerPedidos(HOY), []);
  assert.equal(recibo.pedido.aviso.codigo, "corr-1");

  await restaurarPedido(recibo);
  const [pedido] = await leerPedidos(HOY);
  assert.equal(pedido.aviso.codigo, "corr-1");
  assert.equal(pedido.aviso.estado, "enviado");
});

test("borrarPedido de un pedido fuera de la ruta no toca la ruta del día", async () => {
  const ids = await cargar(3);
  await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [ids[0], ids[1]],
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });

  const recibo = await borrarPedido(ids[2]);
  assert.equal(recibo.posicion, null);
  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, [ids[0], ids[1]]);
});

// ----------------------------------------------------------- ruta del día
test("guardarRuta conserva lo cerrado y le pone detrás el orden nuevo", async () => {
  const ids = await cargar(5);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: [[1, 2]], distanciaM: 100, duracionS: 10 });
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");
  await marcarResultado({ fecha: HOY, pedidoId: ids[1], conductorId: CONDUCTOR }, "no_entregado");

  // Regeneración a media mañana con el orden invertido y un pedido nuevo.
  const nuevo = await guardarPedido(P(6), HOY);
  const ruta = await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [nuevo.id, ids[4], ids[3], ids[2], ids[1], ids[0]],
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });

  assert.deepEqual(
    ruta.orden,
    [ids[0], ids[1], nuevo.id, ids[4], ids[3], ids[2]],
    "las cerradas deben quedar primero, en su orden, y no repetirse",
  );
  assert.equal((await leerPedidos(HOY)).filter((p) => p.resultado !== "pendiente").length, 2);
  assert.equal(new Set(ruta.orden).size, ruta.orden.length, "pedido duplicado en la ruta");
  assert.deepEqual(ruta.trazado, [[1, 2]], "sin trazado nuevo debe conservar el anterior");
  assert.equal(ruta.distanciaM, 100);
});

test("regenerar la ruta conserva la llamada ya hecha de un pedido pendiente", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarLlamada({ fecha: HOY, pedidoId: ids[2], conductorId: CONDUCTOR }, "contesto");

  const ruta = await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [ids[2], ids[1], ids[0]],
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
  assert.deepEqual(ruta.orden, [ids[2], ids[1], ids[0]]);
  const pedido = (await leerPedidos(HOY)).find((p) => p.id === ids[2]);
  assert.equal(pedido.llamada, "contesto", "el conductor tendría que volver a llamar sin motivo");
  assert.ok(pedido.horaLlamada);
  assert.equal(pedido.resultado, "pendiente");
});

test("regenerar 50 veces no duplica pedidos ni pierde lo cerrado", async () => {
  const ids = await cargar(12);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  for (let i = 0; i < 12; i += 3) {
    await marcarResultado({ fecha: HOY, pedidoId: ids[i], conductorId: CONDUCTOR }, "entregado");
  }
  for (let v = 0; v < 50; v++) {
    const mezcla = [...ids].sort(() => Math.random() - 0.5);
    await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: mezcla, trazado: null, distanciaM: null, duracionS: null });
    const ruta = await leerRuta(HOY);
    assert.equal(new Set(ruta.orden).size, ruta.orden.length);
    assert.equal(ruta.orden.length, 12);
    const primeros = ruta.orden.slice(0, 4);
    assert.deepEqual(primeros, [ids[0], ids[3], ids[6], ids[9]], "lo entregado tiene que quedar primero");
  }
  assert.equal((await leerCola()).length, 4, "regenerar la ruta alteró la cola de eventos");
});

test("cada día tiene su propia ruta y no se pisan", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: "2026-08-05", pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [ids[1]], trazado: null, distanciaM: null, duracionS: null });
  assert.equal((await leerRuta("2026-08-05")).orden.length, 2);
  assert.equal((await leerRuta(HOY)).orden.length, 1);
  assert.equal(await leerRuta("2026-01-01"), null);
});

// La lista de días del menú lateral. Es lo único que el conductor tiene para
// comprobar lo que hizo: el detalle pedido por pedido lo mira la oficina.
test("leerDias devuelve los días del más nuevo al más viejo", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: "2026-08-04", pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await guardarRuta({ fecha: "2026-08-05", pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  const dias = await leerDias();
  assert.deepEqual(
    dias.map((d) => d.fecha),
    [HOY, "2026-08-05", "2026-08-04"],
    "el día de hoy tiene que quedar arriba de todo",
  );
});

test("leerDias cuenta entregadas y no entregadas; la pendiente no es ninguna", async () => {
  const ids = await cargar(4);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");
  await marcarResultado({ fecha: HOY, pedidoId: ids[1], conductorId: CONDUCTOR }, "no_entregado");
  await marcarResultado({ fecha: HOY, pedidoId: ids[2], conductorId: CONDUCTOR }, "no_entregado");

  const [dia] = await leerDias();
  assert.equal(dia.paradas, 4);
  assert.equal(dia.entregadas, 1);
  assert.equal(dia.noEntregadas, 2, "la pendiente no es una no entregada");
});

test("leerDias distingue un día cerrado de uno que quedó abierto", async () => {
  // Un día sin cerrar es lo único que este resumen tiene que poder gritar: el
  // servidor no valora el día mientras cierre sea null.
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  assert.equal((await leerDias())[0].cierre, null);

  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");
  await cerrarDia(HOY);
  assert.ok((await leerDias())[0].cierre, "el día cerrado tiene que traer la hora");
});

test("un día sin ruta armada no aparece en la lista", async () => {
  await cargar(2);
  assert.deepEqual(await leerDias(), [], "sin ruta no hubo día que resumir");
});

// ------------------------------------------------- marcar en terreno (plata)
test("la primera acción del día encola una 'llamada' (prueba del día trabajado) y solo una", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  await marcarLlamada({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "contesto");
  let cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "llamada");

  await marcarLlamada({ fecha: HOY, pedidoId: ids[1], conductorId: CONDUCTOR }, "no_contesto");
  cola = await leerCola();
  assert.equal(cola.filter((e) => e.tipo === "llamada").length, 1, "encoló una segunda llamada de más");
});

test("un día en que solo se llama igual queda registrado como trabajado", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarLlamada({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "no_contesto");
  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].fecha, HOY);
  assert.equal(cola[0].conductorId, CONDUCTOR);
});

test("marcar entrega cierra el pedido y encola el evento en la MISMA transacción", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");

  const pedido = (await leerPedidos(HOY)).find((p) => p.id === ids[0]);
  assert.equal(pedido.resultado, "entregado");
  assert.ok(pedido.horaResultado);
  const cola = await leerCola();
  assert.equal(cola.filter((e) => e.tipo === "entrega").length, 1);
});

test("no entregado cierra el pedido del día: no pasa al siguiente", async () => {
  // Specs 009 y 012: lo no entregado se tacha; si vuelve a salir, se escanea de
  // nuevo. Si el registro se arrastrara, el paquete aparecería dos veces.
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "no_entregado");

  assert.equal((await pedidosPendientes(HOY)).length, 0, "el pedido sigue en juego");
  assert.equal((await leerCola()).filter((e) => e.tipo === "omision").length, 1);
  assert.equal((await leerPedidos("2026-08-07")).length, 0, "un pedido de hoy apareció mañana");
});

test("los pedidos de otro día no se ven ni entran en la ruta de hoy", async () => {
  const ayer = await guardarPedido(P(1), "2026-08-05");
  const hoy = await guardarPedido(P(2), HOY);

  assert.deepEqual((await leerPedidos(HOY)).map((p) => p.id), [hoy.id]);
  assert.deepEqual((await pedidosPendientes(HOY)).map((p) => p.id), [hoy.id]);
  assert.deepEqual((await leerPedidos("2026-08-05")).map((p) => p.id), [ayer.id]);
});

test("marcar llamada y entrega no reescribe la ruta: solo el pedido y la cola", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: [[1, 2]], distanciaM: 5, duracionS: 9 });
  const antes = await leerRuta(HOY);

  await marcarLlamada({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "contesto");
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");

  assert.deepEqual(await leerRuta(HOY), antes);
});

test("marcar dos veces la misma parada no duplica el evento (ni el pago)", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "no_entregado");
  assert.equal((await leerCola()).filter((e) => e.tipo !== "llamada").length, 1);
});

test("doble toque simultáneo (dos dedos / doble tap) tampoco duplica", async () => {
  const ids = await cargar(1);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  const marca = { fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR };
  await Promise.all([
    marcarResultado(marca, "entregado"),
    marcarResultado(marca, "entregado"),
    marcarResultado(marca, "entregado"),
  ]);
  const entregas = (await leerCola()).filter((e) => e.tipo === "entrega");
  assert.equal(entregas.length, 1, `se encolaron ${entregas.length} entregas por el mismo pedido`);
});

test("ubicar direcciones mientras el conductor marca no reabre lo ya entregado", async () => {
  // fijarCoordenadas corre al rearmar la ruta, con consultas de red en el
  // medio: lee el pedido, y si el conductor lo marca entregado mientras tanto, al
  // guardar las coordenadas lo devolvía a "pendiente" y el paquete reaparecía
  // al día siguiente como no entregado.
  const ids = await cargar(3, false);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  await Promise.all([
    fijarCoordenadas(ids.map((id, i) => ({ id, lat: -18.47 - i / 1000, lng: -70.29 }))),
    marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado"),
  ]);

  const pedido = (await leerPedidos(HOY)).find((p) => p.id === ids[0]);
  assert.equal(pedido.resultado, "entregado", "la geocodificación reabrió un pedido ya entregado");
  assert.equal(pedido.lat, -18.47, "se perdieron las coordenadas");
  assert.equal((await pedidosPendientes(HOY)).length, 2);
});

test("una operación que falla no deja la fila trabada para el resto del día", async () => {
  const ids = await cargar(2);
  // Esta lanza (no hay ruta todavía) y no debe romper las siguientes.
  await assert.rejects(() => marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado"));
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado");
  assert.equal((await leerCola()).length, 1);
});

test("marcar sobre una ruta o un pedido que no existen falla con mensaje claro y sin escribir nada", async () => {
  const ids = await cargar(1);
  await assert.rejects(
    () => marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado"),
    /No hay una ruta/,
  );
  await assert.rejects(
    () => marcarLlamada({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "contesto"),
    /No hay una ruta/,
  );
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  await assert.rejects(
    () => marcarResultado({ fecha: HOY, pedidoId: "fantasma", conductorId: CONDUCTOR }, "entregado"),
    /ya no existe|no está en la ruta/,
  );
  await assert.rejects(
    () => marcarLlamada({ fecha: HOY, pedidoId: "fantasma", conductorId: CONDUCTOR }, "contesto"),
    /ya no existe|no está en la ruta/,
  );
  assert.equal((await leerCola()).length, 0, "escribió eventos de una marca que falló");
});

test("un pedido borrado del teléfono pero aún en la ruta no se puede marcar (y no rompe)", async () => {
  const ids = await cargar(2);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  // Se borra del store de pedidos sin tocar la ruta (estado imposible por la
  // app, pero es lo que quedaría si una escritura se cortara a mitad).
  const idb = await import("@/lib/encomiendas/local/idb");
  await idb.escribir([idb.STORES.pedidos], ({ borrar }) => borrar(idb.STORES.pedidos, ids[0]));
  await assert.rejects(
    () => marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: CONDUCTOR }, "entregado"),
    /ya no existe/,
  );
});

// ------------------------------------------------------------------ cola
test("la cola sale de la más vieja a la más nueva", async () => {
  const ids = await cargar(4);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  for (const id of ids) {
    await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");
  }
  const cola = await leerCola();
  const horas = cola.map((e) => e.hora);
  assert.deepEqual(horas, [...horas].sort(), "la cola no está ordenada por hora");
  assert.equal(new Set(cola.map((e) => e.id)).size, cola.length, "id de evento repetido: el servidor descartaría uno");
});

test("quitarDeCola solo saca los confirmados", async () => {
  const ids = await cargar(3);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  for (const id of ids) await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");
  const cola = await leerCola();
  await quitarDeCola(cola.slice(0, 2).map((e) => e.id));
  const quedan = await leerCola();
  assert.equal(quedan.length, cola.length - 2);
  await quitarDeCola(["no-existe"]); // no debe lanzar
  await quitarDeCola([]);
  assert.equal((await leerCola()).length, quedan.length);
});

// -------------------------------------------------- día completo real
test("día completo de 30 pedidos: los eventos cuadran exactamente con el pago", async () => {
  const { agruparPorDia, contarActividad } = await import("@/lib/encomiendas/pago");
  const ids = await cargar(30);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });

  let entregadas = 0;
  let noEntregadas = 0;
  for (const [i, id] of ids.entries()) {
    // Cada 5 paradas el destinatario no contesta: llamada + omisión.
    if (i % 5 === 4) {
      await marcarLlamada({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "no_contesto");
      await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "no_entregado");
      noEntregadas++;
    } else {
      await marcarLlamada({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "contesto");
      await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");
      entregadas++;
    }
  }

  const cola = await leerCola();
  // 30 eventos de cierre + 1 sola llamada (la primera acción del día).
  assert.equal(cola.length, 31, `la cola tiene ${cola.length} eventos, esperaba 31`);
  const conteo = contarActividad(cola.map((e) => ({ tipo: e.tipo })));
  assert.deepEqual(conteo, { entregados: entregadas, omitidos: noEntregadas });

  // Lo que vería el panel al recibir esa cola.
  const [dia] = agruparPorDia(
    cola.map((e) => ({ conductor_id: e.conductorId, fecha: e.fecha, tipo: e.tipo, origen: "app" })),
  );
  assert.deepEqual(dia.conteo, { entregados: 24, omitidos: 6 });
  assert.equal(dia.eventos.length, 31);

  // Estado final del teléfono: todo cerrado. Lo no entregado se tacha; no
  // queda pendiente para mañana.
  assert.equal((await pedidosPendientes(HOY)).length, 0);
  const pedidos = await leerPedidos(HOY);
  assert.equal(pedidos.filter((p) => p.resultado === "no_entregado").length, 6);
  assert.equal(pedidos.filter((p) => p.resultado === "entregado").length, 24);
});

