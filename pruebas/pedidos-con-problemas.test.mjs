// Spec 022: los ⚠ guardados en el pedido, sobre el almacén real (fake-indexeddb).
// La dirección en duda entra con su primera opción, elegir otra no consulta a
// nadie, «Va igual» se conserva, y el aviso dos paradas antes.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { problemasDelArmado } = await import("@/lib/encomiendas/local/generar-ruta");
const { avisoAdelante, lineaAvisoAdelante } = await import(
  "@/app/(conductor)/conductor/encomiendas/_hooks/aviso-adelante"
);

const HOY = "2026-11-06";
const opcion = (n) => ({ direccion: "Pasaje 5 1765", detalle: `sector ${n}`, lat: -18.47 - n / 100, lng: -70.3 });
const calleRepetida = { tipo: "calle_repetida", opciones: [opcion(1), opcion(2), opcion(3)] };

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

const datos = (extra = {}) => ({
  nombre: "Destinatario uno",
  telefono: "",
  direccion: "Pasaje 5 1765",
  lat: null,
  lng: null,
  notas: null,
  ...extra,
});
const leer = (id) => almacen.leerPedidos(HOY).then((ps) => ps.find((p) => p.id === id));

test("la dirección en duda entra con la primera opción y su ⚠; elegir otra no consulta a nadie", async () => {
  const p = await almacen.guardarPedido(datos(), HOY);
  await almacen.ubicarConDuda([{ id: p.id, punto: { lat: opcion(1).lat, lng: opcion(1).lng }, problema: calleRepetida }]);
  let guardado = await leer(p.id);
  assert.deepEqual([guardado.lat, guardado.lng], [opcion(1).lat, opcion(1).lng], "entra con la primera");
  assert.deepEqual(guardado.problemas, [calleRepetida]);

  // Elegir una de las guardadas: sin red.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("elegir un lugar no puede consultar a un proveedor");
  };
  try {
    await almacen.elegirLugar(p.id, opcion(2));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  guardado = await leer(p.id);
  assert.deepEqual([guardado.lat, guardado.lng], [opcion(2).lat, opcion(2).lng]);
  assert.deepEqual(guardado.problemas, [], "elegido el lugar, no queda ⚠");
});

test("editar conserva los ⚠; cambiar la dirección quita los del lugar y deja los demás", async () => {
  const p = await almacen.guardarPedido(datos({ lat: -18.47, lng: -70.3 }), HOY);
  await almacen.ubicarConDuda([{ id: p.id, punto: { lat: -18.47, lng: -70.3 }, problema: calleRepetida }]);
  await almacen.fijarProblemasDeRuta(HOY, new Map([[p.id, [{ tipo: "horario", texto: "No alcanza su horario" }]]]));

  await almacen.guardarPedido(datos({ lat: -18.47, lng: -70.3, notas: "timbre malo" }), HOY, p.id);
  assert.deepEqual((await leer(p.id)).problemas.map((x) => x.tipo), ["calle_repetida", "horario"], "una nota no los borra");

  await almacen.guardarPedido(datos({ direccion: "Pasaje 5 1765, sector 2", lat: -18.49, lng: -70.3 }), HOY, p.id);
  assert.deepEqual((await leer(p.id)).problemas.map((x) => x.tipo), ["horario"], "el horario no es del lugar");

  await almacen.cambiarDireccion(p.id, "Otra 99", null);
  assert.deepEqual((await leer(p.id)).problemas.map((x) => x.tipo), ["horario"]);
});

test("un pedido de antes, sin el campo, se lee con la lista vacía", async () => {
  const p = await almacen.guardarPedido(datos(), HOY);
  const crudo = await idb.leerUno(idb.STORES.pedidos, p.id);
  delete crudo.problemas;
  await idb.escribir([idb.STORES.pedidos], ({ guardar }) => guardar(idb.STORES.pedidos, crudo));
  assert.deepEqual((await leer(p.id)).problemas, []);
});

test("el paquete que no estaba en la guía: origen etiqueta y ⚠, que «Es así» deja revisado", async () => {
  const p = await almacen.guardarPedido(datos({ of: "300000199" }), HOY, undefined, {
    origen: "etiqueta",
    problemas: [{ tipo: "fuera_de_guia" }],
  });
  assert.equal(p.origenCarga, "etiqueta");
  await almacen.marcarRevisado(p.id, "fuera_de_guia");
  assert.deepEqual((await leer(p.id)).problemas, [{ tipo: "fuera_de_guia", revisado: true }]);
});

test("los ⚠ del armado se reemplazan al rehacer la ruta y «Va igual» se conserva", async () => {
  const a = await almacen.guardarPedido(datos(), HOY);
  const b = await almacen.guardarPedido(datos({ nombre: "Destinatario dos" }), HOY);
  const lejana = { tipo: "lejana", texto: "Queda a 6,2 km del resto" };
  await almacen.fijarProblemasDeRuta(HOY, new Map([[a.id, [lejana]], [b.id, [{ tipo: "horario", texto: "No alcanza su horario" }]]]));
  await almacen.marcarRevisado(a.id, "lejana");

  // La ruta nueva: A sigue lejana (con otro texto), B ya alcanza su horario.
  await almacen.fijarProblemasDeRuta(HOY, new Map([[a.id, [{ tipo: "lejana", texto: "Queda a 5,9 km del resto" }]]]));
  assert.deepEqual((await leer(a.id)).problemas, [{ tipo: "lejana", texto: "Queda a 5,9 km del resto", revisado: true }]);
  assert.deepEqual((await leer(b.id)).problemas, [], "lo que ya no pasa se va");
});

test("la etiqueta con otra dirección queda como ⚠; «Dejar la de la guía» lo quita", async () => {
  const { creados } = await almacen.crearDesdeGuia([{ of: "300000101", destino: "PASAJE 5 1765" }], HOY, {
    folio: null,
    origen: "guia_pegada",
  });
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000101", bulto: 1, escaneo: true, direccion: "OTRA CALLE 99" });
  assert.deepEqual(r.pedido.problemas, [{ tipo: "etiqueta_otra_direccion", direccion: "OTRA CALLE 99" }]);
  assert.equal(r.pedido.direccion, "PASAJE 5 1765", "no se cambia sola");

  await almacen.quitarProblema(creados[0].id, "etiqueta_otra_direccion");
  assert.deepEqual((await leer(creados[0].id)).problemas, []);

  // Una etiqueta que dice lo mismo que la guía no deja ⚠.
  const igual = await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000101", bulto: null, direccion: "Pasaje 5 1765, Arica" });
  assert.deepEqual(igual.pedido.problemas, []);
});

test("bultos incompletos: el envío con 1 de 2 sigue faltando", async () => {
  await almacen.crearDesdeGuia([{ of: "300000101", destino: "CALLE 1" }], HOY, { folio: null, origen: "guia_pegada" });
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000101", bulto: 1, bultosTotal: 2, escaneo: true });
  assert.deepEqual(almacen.bultosIncompletos([r.pedido]).map((p) => p.of), ["300000101"]);
  const completo = await almacen.aplicarLecturaEtiqueta(HOY, { of: "300000101", bulto: 2, escaneo: true });
  assert.deepEqual(almacen.bultosIncompletos([completo.pedido]), []);
});

test("problemasDelArmado: la parada lejana y el horario de la alternativa elegida", () => {
  const propuesta = {
    lejanas: [{ pedidoId: "a", direccion: "x", metrosAlResto: 6234, metrosQueSuma: 9000 }],
    elegida: "horarios",
    alternativas: [
      { estrategia: "corta", fueraDeHorarioIds: ["b", "c"] },
      { estrategia: "horarios", fueraDeHorarioIds: ["c"] },
    ],
  };
  const m = problemasDelArmado(propuesta);
  assert.deepEqual(m.get("a"), [{ tipo: "lejana", texto: "Queda a 6,2 km del resto" }]);
  assert.deepEqual(m.get("c"), [{ tipo: "horario", texto: "No alcanza su horario" }]);
  assert.equal(m.has("b"), false, "solo la alternativa que se usó");
});

// ------------------------------------------------- aviso dos paradas antes
const parada = (secuencia, extra = {}) => ({
  secuencia,
  hayQueContactar: false,
  pedido: {
    id: `p${secuencia}`,
    resultado: "pendiente",
    lat: -18.47,
    lng: -70.3,
    of: "300000101",
    origenCarga: "guia_foto",
    problemas: [],
    ...extra,
  },
});

test("avisoAdelante: el ⚠ a una o dos paradas pendientes; más lejos, no", () => {
  const paradas = [parada(11, { resultado: "entregado" }), parada(12), parada(13), parada(14, { problemas: [calleRepetida] }), parada(15)];
  const a = avisoAdelante(paradas, "p12");
  assert.equal(a.parada.secuencia, 14);
  assert.equal(a.cuantas, 2);
  assert.equal(lineaAvisoAdelante(a), "⚠ En 2 paradas: la 14 · Calle en 3 lugares");

  assert.equal(avisoAdelante(paradas, "p13").cuantas, 1, "la próxima");
  assert.equal(avisoAdelante(paradas, "p11"), null, "a tres paradas todavía no");
  assert.equal(avisoAdelante(paradas, "p14"), null, "la activa lo dice en su tarjeta");
  assert.equal(avisoAdelante(paradas, null), null);
});

test("avisoAdelante: salta las cerradas y no avisa lo que no hace perder el viaje", () => {
  const cerrada = parada(13, { resultado: "no_entregado", problemas: [calleRepetida] });
  const paradas = [parada(12), cerrada, parada(14), parada(15, { problemas: [calleRepetida] })];
  assert.equal(avisoAdelante(paradas, "p12").parada.secuencia, 15, "la 13 está cerrada: la 15 queda a 2");

  const sinOf = [parada(12), parada(13, { of: null }), parada(14, { problemas: [{ tipo: "fuera_de_guia" }] })];
  assert.equal(avisoAdelante(sinOf, "p12"), null, "sin OF y fuera de la guía no avisan antes");
  const revisada = [parada(12), parada(13, { problemas: [{ tipo: "lejana", texto: "Queda a 6 km", revisado: true }] })];
  assert.equal(avisoAdelante(revisada, "p12"), null, "lo marcado «Va igual» no avisa");
});
