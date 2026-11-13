// Spec 033, G5 (dueño, 2026-11-13): cambiar el estado de una parada ya cerrada.
// almacen/correccion.ts y enviar.ts reales sobre fake-indexeddb, con el doble de
// Supabase: el evento viejo se quita de la cola si no salió, o se borra del
// servidor por su id (aunque no haya señal en ese momento); el estado nuevo es
// un evento nuevo. Datos inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { enviarActividadPendiente } = await import("@/lib/encomiendas/local/enviar");
const { volverALaRuta } = await import("@/lib/encomiendas/local/sumar-a-ruta");
const { espia } = await import("./dobles/supabase-client.mjs");

const HOY = "2026-11-13";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";
const marca = (pedidoId) => ({ fecha: HOY, pedidoId, conductorId: CONDUCTOR });

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, fila.id ?? fila.fecha);
    });
  }
  espia.reset();
});

/** n pedidos en la ruta de HOY, en fila hacia el norte (calles inventadas). */
async function ruta(n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const p = await almacen.guardarPedido(
      { nombre: `Persona ${i}`, telefono: "+56911111111", direccion: `Pasaje Inventado ${i + 1}`, lat: -18.48 + i * 0.002, lng: -70.3, notas: null },
      HOY,
    );
    ids.push(p.id);
  }
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  return ids;
}

const cola = async () => idb.leerTodos(idb.STORES.cola);
const pedido = async (id) => (await almacen.leerPedidos(HOY)).find((p) => p.id === id);

test("marcar guarda el id del evento en el pedido", async () => {
  const [a] = await ruta(1);
  const evento = await almacen.marcarResultado(marca(a), "entregado");
  assert.equal((await pedido(a)).eventoResultado, evento);
});

test("en la cola (retenido): el evento viejo sale de la cola y entra el nuevo, sin borrar nada en el servidor", async () => {
  const [a] = await ruta(2);
  const viejo = await almacen.marcarResultado(marca(a), "entregado", 8_000);
  assert.equal(await almacen.cambiarResultado(marca(a), "no_entregado"), true);
  const eventos = await cola();
  assert.equal(eventos.length, 1);
  assert.notEqual(eventos[0].id, viejo);
  assert.equal(eventos[0].tipo, "omision");
  assert.ok(!eventos[0].borrar);
  const p = await pedido(a);
  assert.equal(p.resultado, "no_entregado");
  assert.equal(p.eventoResultado, eventos[0].id);
  await enviarActividadPendiente();
  assert.equal(espia.llamadas.filter((l) => l.borrar).length, 0, "no había nada que borrar allá");
});

test("ya enviado: se borra en el servidor por su id y se sube el nuevo", async () => {
  const [a] = await ruta(2);
  const viejo = await almacen.marcarResultado(marca(a), "entregado");
  await enviarActividadPendiente();
  assert.equal((await cola()).length, 0);
  espia.reset();

  assert.equal(await almacen.cambiarResultado(marca(a), "no_entregado"), true);
  const enCola = await cola();
  assert.deepEqual(enCola.filter((e) => e.borrar).map((e) => e.id), [viejo]);
  assert.equal(enCola.filter((e) => !e.borrar).length, 1);

  const r = await enviarActividadPendiente();
  assert.deepEqual(r, { enviados: 2, pendientes: 0 });
  const [alta, baja] = espia.llamadas;
  assert.equal(alta.filas[0].tipo, "omision", "primero sube el nuevo");
  assert.ok(!alta.filas.some((f) => f.id === viejo), "la corrección no se sube como alta");
  assert.equal(baja.borrar, viejo);
  assert.equal((await cola()).length, 0);
});

test("ya enviado → Pendiente: solo el borrado, la parada vuelve y el día se reabre", async () => {
  const [a, b] = await ruta(2);
  const ea = await almacen.marcarResultado(marca(a), "entregado");
  await almacen.marcarResultado(marca(b), "entregado");
  await almacen.cerrarDia(HOY);
  await enviarActividadPendiente();

  assert.equal(await almacen.cambiarResultado(marca(a), "pendiente"), true);
  const p = await pedido(a);
  assert.equal(p.resultado, "pendiente");
  assert.equal(p.eventoResultado, null);
  assert.equal((await almacen.leerRuta(HOY)).cierre, null, "con una parada por hacer, el día no está cerrado");
  assert.deepEqual((await cola()).map((e) => [e.id, e.borrar]), [[ea, true]]);
});

test("sin señal: la corrección queda en la cola y sale cuando vuelve", async () => {
  const [a] = await ruta(1);
  const viejo = await almacen.marcarResultado(marca(a), "entregado");
  await enviarActividadPendiente();
  await almacen.cambiarResultado(marca(a), "pendiente");

  espia.borrar = () => ({ data: null, error: { message: "TypeError: Failed to fetch" } });
  await assert.rejects(enviarActividadPendiente());
  assert.deepEqual((await almacen.leerCola()).map((e) => e.id), [viejo], "un error de red no borra la corrección");

  espia.borrar = (id) => ({ data: [{ id }], error: null });
  assert.deepEqual(await enviarActividadPendiente(), { enviados: 1, pendientes: 0 });
  assert.equal((await cola()).length, 0);
});

test("pasó el plazo: el servidor no borra y la corrección queda rechazada a la vista", async () => {
  const [a] = await ruta(1);
  const viejo = await almacen.marcarResultado(marca(a), "entregado");
  await enviarActividadPendiente();
  await almacen.cambiarResultado(marca(a), "no_entregado");

  // La policy de delete deja 0 filas, y el evento sigue allá.
  espia.borrar = () => ({ data: [], error: null });
  espia.consultar = (id) => ({ data: { id }, error: null });
  await enviarActividadPendiente();
  const rechazados = await almacen.leerRechazados();
  assert.deepEqual(rechazados.map((e) => [e.id, e.borrar, e.rechazado]), [[viejo, true, almacen.MOTIVO_PLAZO]]);
  assert.equal((await almacen.leerCola()).length, 0, "lo rechazado no traba la cola");
  assert.equal((await cola()).length, 1, "nunca se pierde en silencio");
});

test("reenviar la corrección no hace nada: si el evento ya no está, se da por hecha", async () => {
  const [a] = await ruta(1);
  await almacen.marcarResultado(marca(a), "entregado");
  await enviarActividadPendiente();
  await almacen.cambiarResultado(marca(a), "pendiente");
  // Un intento anterior lo borró y se cortó antes de tachar la corrección.
  espia.borrar = () => ({ data: [], error: null });
  espia.consultar = () => ({ data: null, error: null });
  assert.deepEqual(await enviarActividadPendiente(), { enviados: 1, pendientes: 0 });
  assert.equal((await cola()).length, 0);
  assert.equal((await almacen.leerRechazados()).length, 0);
});

test("un alta que sube mientras se corrige: tacharla no tacha la corrección", async () => {
  const [a] = await ruta(1);
  const viejo = await almacen.marcarResultado(marca(a), "entregado");
  // El envío leyó el alta y la está subiendo; en eso, el conductor la corrige.
  await almacen.cambiarResultado(marca(a), "pendiente");
  await almacen.quitarDeCola([viejo]);
  const quedan = await cola();
  assert.deepEqual(quedan.map((e) => [e.id, e.borrar]), [[viejo, true]], "el borrado tiene que seguir para el servidor");
});

test("no se ofrece fuera de plazo, sin el id del evento ni con el mismo estado", async () => {
  const [a, b] = await ruta(2);
  await almacen.marcarResultado(marca(a), "entregado");
  const p = await pedido(a);
  const hora = Date.parse(p.horaResultado);
  assert.equal(almacen.sePuedeCambiar(p, hora + 60_000), true);
  assert.equal(almacen.sePuedeCambiar(p, hora + almacen.PLAZO_CORREGIR_MS + 1), false);
  assert.equal(almacen.sePuedeCambiar({ ...p, eventoResultado: undefined }, hora), false, "cerrado antes de G5");
  assert.equal(almacen.sePuedeCambiar(await pedido(b), hora), false, "pendiente: no hay nada que cambiar");
  assert.equal(await almacen.cambiarResultado(marca(a), "entregado"), false);
});

test("volverALaRuta: la parada reabierta no pasa adelante de la activa", async () => {
  const [a, b, c, d] = await ruta(4);
  await almacen.marcarResultado(marca(a), "entregado");
  await almacen.marcarResultado(marca(b), "entregado");
  await almacen.cambiarResultado(marca(a), "pendiente");
  const parada = await volverALaRuta(HOY, a);
  const orden = (await almacen.leerRuta(HOY)).orden;
  assert.equal(orden[0], b, "lo cerrado sigue primero");
  assert.equal(orden[1], c, "la activa no se mueve");
  assert.ok(orden.includes(a) && orden.includes(d));
  assert.equal(parada, orden.indexOf(a) + 1);
});

// ------------------------------------------------------------ limpieza del día
const { hoyChile, sumarDias } = await import("@/lib/comun/fechas");

test("resumenesQueSobran: más de 60 días y sin eventos en la cola", () => {
  const hoy = "2026-11-13";
  const viejo = sumarDias(hoy, -61);
  const conCola = sumarDias(hoy, -90);
  const reciente = sumarDias(hoy, -60);
  assert.deepEqual(almacen.resumenesQueSobran([viejo, conCola, reciente], new Set([conCola]), hoy), [viejo]);
});

test("borrar el día poda los resúmenes viejos sin tocar la cola", async () => {
  const hoy = hoyChile();
  const resumen = (fecha) => ({ fecha, asignados: 1, paradas: 1, entregadas: 1, noEntregadas: 0, contactados: null, porPagar: 0, aCobrar: 0, cobrado: 0, porOrigen: {}, inicio: null, cierre: null });
  const viejo = sumarDias(hoy, -70);
  const conCola = sumarDias(hoy, -80);
  const reciente = sumarDias(hoy, -10);
  await idb.escribir([idb.STORES.dias, idb.STORES.cola], ({ guardar }) => {
    for (const f of [viejo, conCola, reciente]) guardar(idb.STORES.dias, resumen(f));
    guardar(idb.STORES.cola, { id: "evento-sin-enviar", conductorId: CONDUCTOR, fecha: conCola, tipo: "entrega", hora: `${conCola}T15:00:00.000Z` });
  });
  const p = await almacen.guardarPedido({ nombre: "Persona", telefono: "+56911111111", direccion: "Pasaje Inventado 1", lat: -18.48, lng: -70.3, notas: null }, hoy);
  await almacen.guardarRuta({ fecha: hoy, pedidoIdsEnOrden: [p.id], trazado: null, distanciaM: null, duracionS: null });
  await almacen.cerrarYBorrarDia(hoy);
  const fechas = (await idb.leerTodos(idb.STORES.dias)).map((d) => d.fecha).sort();
  assert.deepEqual(fechas, [conCola, reciente, hoy].sort());
  assert.deepEqual((await cola()).map((e) => e.id), ["evento-sin-enviar"]);
});

test("borrarSueltos: fotos y propuestas de días anteriores sin pedidos se van; las de hoy no", async () => {
  const hoy = "2026-11-13";
  const ayer = "2026-11-12";
  const blob = new Blob([new Uint8Array(3)], { type: "image/jpeg" });
  await idb.escribir([idb.STORES.fotos, idb.STORES.propuestas], ({ guardar }) => {
    guardar(idb.STORES.fotos, { id: "foto-ayer", pedidoId: "ya-no-esta", fecha: ayer, blob });
    guardar(idb.STORES.fotos, { id: "foto-hoy", pedidoId: "x", fecha: hoy, blob });
    guardar(idb.STORES.propuestas, { fecha: ayer, firma: "f", datos: null, guardadaEn: `${ayer}T12:00:00.000Z` });
  });
  assert.equal(await almacen.borrarSueltos(hoy), 1);
  assert.deepEqual((await idb.leerTodos(idb.STORES.fotos)).map((f) => f.id), ["foto-hoy"]);
  assert.deepEqual(await idb.leerTodos(idb.STORES.propuestas), []);
  assert.deepEqual(await almacen.diasPorBorrar(hoy), [], "no aparece como un día por cerrar");
});
