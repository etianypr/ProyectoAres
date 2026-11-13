// Spec 033, G3 (recorrer y cerrar): el doble toque, deshacer varias paradas juntas,
// deshacer «Dejar como pendiente», «Ahora» y «Pidió otra hora», reubicar una parada
// cuya dirección cambió, sumar a una ruta ya completa, el POR PAGAR «por revisar»
// en el cierre, los botones nuevos de la parada y el escáner abierto desde la
// parada. IndexedDB real (fake-indexeddb); sin red: el `fetch` global falla, así que
// el trazado queda el de antes y no se gasta ninguna consulta. Calles reales de
// Arica con números y nombres inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { dejarParaMasTarde, hacerAhora, sumarALaRuta } = await import("@/lib/encomiendas/local/sumar-a-ruta");
const reubicar = await import("@/lib/encomiendas/local/reubicar");
const H = "@/app/(conductor)/conductor/encomiendas/_hooks";
const { toqueValido, MS_TRAS_CAMBIO } = await import(`${H}/guarda-toque`);
const { paradasJuntas } = await import(`${H}/misma-direccion`);
const { botonesDeParada, atenderBoton } = await import(`${H}/botones-parada`);
const { bloquesPorDelante, faseDeParada } = await import(`${H}/fase-parada`);
const { porPagarPorRevisar, entregadosPorRevisar, cobroDelFormulario, montoEscrito } = await import(`${H}/por-pagar`);
const { vistaDeBurbuja } = await import(`${H}/vista-burbuja`);
const { textoOtraParada, tituloEsperado } = await import(`${H}/otra-parada`);

const HOY = "2026-11-13";
const CONDUCTOR = "c-prueba";

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

const fetchOriginal = globalThis.fetch;
test.before(() => {
  process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";
  globalThis.fetch = async () => {
    throw new TypeError("sin red (prueba)");
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});

/** Pedidos en una línea hacia el sur por la costa (≈ 220 m entre cada uno). */
async function rutaEnLinea(n, { extra = {} } = {}) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const p = await almacen.guardarPedido(
      {
        nombre: `Prueba ${i + 1}`,
        telefono: "",
        direccion: `Avenida Comandante San Martín ${100 + i * 10}, Arica`,
        lat: -18.47 - i * 0.002,
        lng: -70.32,
        notas: null,
        of: String(900100 + i),
        ...extra,
      },
      HOY,
    );
    ids.push(p.id);
  }
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null, partida: { lat: -18.468, lng: -70.32 } });
  return ids;
}

const ordenPendiente = async () => reubicar.leerOrdenPendiente(HOY);
const cola = () => idb.leerTodos(idb.STORES.cola);
const marca = (pedidoId) => ({ fecha: HOY, pedidoId, conductorId: CONDUCTOR });

// ------------------------------------------------- doble toque
test("toqueValido: lo que llega a menos de 600 ms del cambio de parada no vale; «Deshacer» siempre", () => {
  assert.equal(toqueValido("entregado", 1_000, 1_250), false, "el segundo toque del doble toque");
  assert.equal(toqueValido("llamar", 1_000, 1_000 + MS_TRAS_CAMBIO - 1), false);
  assert.equal(toqueValido("entregado", 1_000, 1_000 + MS_TRAS_CAMBIO), true);
  assert.equal(toqueValido("deshacer", 1_000, 1_001), true);
});

test("Deshacer varios: dos paradas cerradas en la misma ventana vuelven las dos, y la cola queda vacía", async () => {
  const [a, b] = await rutaEnLinea(3);
  const ea = await almacen.marcarResultado(marca(a), "entregado", 8_000);
  const eb = await almacen.marcarResultado(marca(b), "entregado", 8_000);
  // Lo que hace la pantalla al juntar el segundo cierre: los dos quedan retenidos
  // con el mismo plazo, contado desde el segundo.
  const hasta = new Date(Date.now() + 8_000).toISOString();
  for (const e of [ea, eb]) await almacen.retenerEvento(e, hasta);
  assert.equal((await cola()).length, 2);
  assert.ok((await cola()).every((e) => e.retenidoHasta >= hasta), "ninguno puede salir mientras se puede deshacer");
  // Del último al primero.
  assert.equal(await almacen.deshacerResultado({ fecha: HOY, pedidoId: b }, eb), true);
  assert.equal(await almacen.deshacerResultado({ fecha: HOY, pedidoId: a }, ea), true);
  const pedidos = await almacen.leerPedidos(HOY);
  assert.ok(pedidos.every((p) => p.resultado === "pendiente"));
  assert.equal((await cola()).length, 0);
  assert.deepEqual((await ordenPendiente()).slice(0, 2), [a, b], "la ruta vuelve a empezar por la primera");
});

// ------------------------------------------------- paquetes en el mismo punto
test("paradasJuntas: las que siguen en el mismo punto (≤ 15 m), cortando en la primera que no", () => {
  const parada = (id, lat, resultado = "pendiente") => ({ secuencia: 0, hayQueContactar: false, pedido: { id, lat, lng: -70.32, resultado } });
  const paradas = [parada("x", -18.46, "entregado"), parada("a", -18.47), parada("b", -18.47005), parada("c", -18.48), parada("d", -18.47)];
  assert.deepEqual(paradasJuntas(paradas, paradas[1]).map((p) => p.pedido.id), ["b"]);
  assert.deepEqual(paradasJuntas(paradas, paradas[3]).map((p) => p.pedido.id), []);
  assert.deepEqual(paradasJuntas(paradas, null), []);
});

test("«Los 2»: botones, fase y cada uno llama a lo suyo", () => {
  const activa = { secuencia: 3, hayQueContactar: false, pedido: { id: "a", telefono: "+56900000000" } };
  assert.equal(faseDeParada(activa, { dandoResultadoDe: null, juntasDe: "a" }), "juntas");
  const filas = botonesDeParada(activa, "juntas", { juntas: 1 });
  assert.deepEqual(filas.map((f) => f.map((b) => b.id)), [["todos", "solo_este"], ["volver"]]);
  assert.equal(filas[0][0].texto, "Los 2");
  const llamadas = [];
  const a = new Proxy({}, { get: (_, k) => (...args) => llamadas.push([k, ...args]) });
  atenderBoton("todos", a);
  atenderBoton("solo_este", a);
  atenderBoton("hora:14-16", a);
  atenderBoton("otra_hora", a);
  assert.deepEqual(llamadas, [["todos"], ["soloEste"], ["hora", "14-16"], ["otraHora"]]);
});

// ------------------------------------------------- salidas
test("«Dejar como pendiente» no se ofrece con una sola pendiente; «Pidió otra hora» si queda un bloque", () => {
  const activa = { secuencia: 1, hayQueContactar: false, pedido: { id: "a", telefono: "+56900000000" } };
  const ids = (extra) => botonesDeParada(activa, "salidas", extra).map((f) => f.map((b) => b.id));
  assert.deepEqual(ids({ pendientes: 1 }), [["no_entregado"], ["volver"]]);
  assert.deepEqual(ids({ pendientes: 4 }), [["pendiente"], ["no_entregado"], ["volver"]]);
  const bloques = bloquesPorDelante(15 * 60);
  assert.deepEqual(bloques.map((b) => b.id), ["14-16", "16-18"], "a las 15:00 quedan dos bloques");
  assert.deepEqual(ids({ pendientes: 4, bloques }), [["pendiente"], ["otra_hora"], ["no_entregado"], ["volver"]]);
  assert.deepEqual(
    botonesDeParada(activa, "horas", { bloques }).map((f) => f.map((b) => b.id)),
    [["hora:14-16", "hora:16-18"], ["volver"]],
  );
  assert.deepEqual(bloquesPorDelante(18 * 60), [], "pasadas las 18, ninguno");
});

// ------------------------------------------------- deshacer un cambio de orden
test("Deshacer «Dejar como pendiente»: vuelve al orden de antes, sin tocar la cola", async () => {
  const ids = await rutaEnLinea(8);
  const antes = await ordenPendiente();
  await dejarParaMasTarde(HOY, ids[0]);
  assert.notDeepEqual(await ordenPendiente(), antes);
  await reubicar.volverAlOrden(HOY, { ordenAntes: antes });
  assert.deepEqual(await ordenPendiente(), antes);
  assert.equal((await cola()).length, 0);
});

test("Deshacer «Ahora»: la parada vuelve a su lugar; retrazar sin señal deja el trazado de antes", async () => {
  const ids = await rutaEnLinea(5);
  const antes = await ordenPendiente();
  await hacerAhora(HOY, ids[3]);
  assert.equal((await ordenPendiente())[1], ids[3]);
  assert.equal(await reubicar.retrazarRuta(HOY), false, "sin red no cambia el trazado");
  await reubicar.volverAlOrden(HOY, { ordenAntes: antes });
  assert.deepEqual(await ordenPendiente(), antes);
  assert.equal((await almacen.leerRuta(HOY)).trazado, null);
});

test("«Pidió otra hora»: guarda el bloque como disponibilidad (sin evento), mueve la parada y se deshace entera", async () => {
  const ids = await rutaEnLinea(6);
  const antes = await ordenPendiente();
  // A las 09:00, el bloque de 16 a 18 queda lejos: la parada sale de la primera.
  const r = await reubicar.pedirOtraHora(HOY, ids[0], "16-18", new Date(2026, 10, 13, 9, 0));
  const p = (await almacen.leerPedidos(HOY)).find((x) => x.id === ids[0]);
  assert.equal(p.disponibilidad, "horario_indicado");
  assert.equal(p.bloqueHorarioId, "16-18");
  assert.equal(p.resultado, "pendiente", "es disponibilidad, no un resultado");
  assert.notEqual((await ordenPendiente())[0], ids[0]);
  assert.ok(r.parada > 1);
  assert.equal((await cola()).length, 0, "no se encola nada");
  await reubicar.volverAlOrden(HOY, r);
  const vuelto = (await almacen.leerPedidos(HOY)).find((x) => x.id === ids[0]);
  assert.equal(vuelto.disponibilidad, "pendiente_respuesta");
  assert.equal(vuelto.bloqueHorarioId, null);
  assert.deepEqual(await ordenPendiente(), antes);
});

// ------------------------------------------------- cambio de dirección
test("Cambio de dirección: > 150 m reubica donde menos alarga; la activa pregunta; < 150 m no mueve", async () => {
  const ids = await rutaEnLinea(6);
  const pedidos = await almacen.leerPedidos(HOY);
  const de = (id) => pedidos.find((p) => p.id === id);
  const mover = async (id, lat) => {
    const p = de(id);
    await almacen.guardarPedido({ nombre: p.nombre, telefono: p.telefono, direccion: `${p.direccion} B`, lat, lng: p.lng, notas: null }, HOY, id);
    return { lat: p.lat, lng: p.lng };
  };

  // La 2.ª (índice 1) se va al lado de la 6.ª.
  const antes = await ordenPendiente();
  const puntoAntes = await mover(ids[1], de(ids[5]).lat - 0.0005);
  const r = await reubicar.reubicarPorPunto(HOY, ids[1], puntoAntes);
  assert.equal(r.tipo, "movida");
  const ahora = await ordenPendiente();
  assert.equal(ahora[0], ids[0], "la activa no se mueve");
  assert.ok(ahora.indexOf(ids[1]) >= 4, `quedó en ${ahora.indexOf(ids[1])}`);
  assert.equal(r.parada, ahora.indexOf(ids[1]) + 1);
  assert.deepEqual(r.ordenAntes, antes);
  await reubicar.volverAlOrden(HOY, r);
  assert.deepEqual(await ordenPendiente(), antes);

  // Unos metros: es la misma cuadra.
  const cerca = await mover(ids[2], de(ids[2]).lat - 0.0005);
  assert.equal((await reubicar.reubicarPorPunto(HOY, ids[2], cerca)).tipo, "igual");

  // La activa: primero pregunta; con «Moverla», se mueve. (La 2.ª vuelve a su
  // punto: si no, la que va al sur seguiría siendo la primera más barata.)
  await mover(ids[1], de(ids[1]).lat);
  const activaAntes = await mover(ids[0], de(ids[5]).lat - 0.001);
  assert.equal((await reubicar.reubicarPorPunto(HOY, ids[0], activaAntes)).tipo, "activa");
  assert.deepEqual(await ordenPendiente(), antes, "sin elegir, nada se mueve");
  const movida = await reubicar.reubicarPorPunto(HOY, ids[0], activaAntes, { moverActiva: true });
  assert.equal(movida.tipo, "movida");
  assert.notEqual((await ordenPendiente())[0], ids[0]);
  assert.equal((await cola()).length, 0);
});

// ------------------------------------------------- llega tarde con la ruta completa
test("Sumar a una ruta ya completa: entra, la ruta se reabre (cierre null) y no es día terminado", async () => {
  const ids = await rutaEnLinea(2);
  for (const id of ids) await almacen.marcarResultado(marca(id), "entregado");
  await almacen.cerrarDia(HOY);
  assert.ok((await almacen.leerRuta(HOY)).cierre);
  const tarde = await almacen.guardarPedido(
    { nombre: "Tarde", telefono: "", direccion: "Avenida Comandante San Martín 900, Arica", lat: -18.475, lng: -70.321, notas: null },
    HOY,
  );
  assert.equal(await sumarALaRuta(HOY), 1);
  const ruta = await almacen.leerRuta(HOY);
  assert.equal(ruta.cierre, null);
  assert.equal(ruta.orden.at(-1), tarde.id);
  assert.equal(almacen.rutaTerminada(ruta, await almacen.leerPedidos(HOY)), false);
});

// ------------------------------------------------- POR PAGAR por revisar
test("POR PAGAR por revisar: se cuenta aparte en el cierre (solo entregados de guía o etiqueta), y el formulario lo guarda", async () => {
  assert.equal(porPagarPorRevisar({ porPagar: null, origenCarga: "guia_foto" }), true);
  assert.equal(porPagarPorRevisar({ porPagar: null, origenCarga: "manual" }), false);
  assert.equal(porPagarPorRevisar({ porPagar: false, origenCarga: "guia_ia" }), false);
  const pedidos = [
    { resultado: "entregado", porPagar: null, origenCarga: "guia_pegada" },
    { resultado: "entregado", porPagar: true, origenCarga: "guia_pegada" },
    { resultado: "no_entregado", porPagar: null, origenCarga: "guia_pegada" },
    { resultado: "entregado", porPagar: null, origenCarga: "manual" },
  ];
  assert.equal(entregadosPorRevisar(pedidos), 1);

  assert.equal(montoEscrito("$ 12.345"), 12345);
  assert.equal(montoEscrito(""), null);
  assert.deepEqual(cobroDelFormulario(true, "12.345"), { porPagar: true, montoPorPagar: 12345 });
  assert.deepEqual(cobroDelFormulario(true, ""), { porPagar: true, montoPorPagar: null }, "nunca se supone $0");
  assert.deepEqual(cobroDelFormulario(false, "500"), { porPagar: false, montoPorPagar: null });
  assert.deepEqual(cobroDelFormulario(null, "500"), { porPagar: null, montoPorPagar: null });

  // Guardar sin tocar la sección conserva lo que había; con ella, lo cambia.
  const p = await almacen.guardarPedido(
    { nombre: "Prueba", telefono: "", direccion: "Calle Sotomayor 100, Arica", lat: null, lng: null, notas: null },
    HOY,
  );
  await almacen.guardarPedido({ nombre: "Prueba", telefono: "", direccion: p.direccion, lat: null, lng: null, notas: null, porPagar: true, montoPorPagar: 4500, bultos: 2 }, HOY, p.id);
  await almacen.guardarPedido({ nombre: "Prueba 2", telefono: "", direccion: p.direccion, lat: null, lng: null, notas: null }, HOY, p.id);
  const guardado = (await almacen.leerPedidos(HOY))[0];
  assert.equal(guardado.porPagar, true);
  assert.equal(guardado.montoPorPagar, 4500);
  assert.equal(guardado.bultos, 2);
  assert.equal((await cola()).length, 0);
});

test("La burbuja: POR PAGAR por revisar, y el ⚠ de adelante en el estado cuando el aviso es un «Deshacer»", () => {
  const activa = {
    secuencia: 2,
    hayQueContactar: false,
    pedido: { id: "a", of: "900100", nombre: "", direccion: "Calle Inventada 1", telefono: "", lat: -18.47, lng: -70.32,
      disponibilidad: "pendiente_respuesta", bloqueHorarioId: null, referencia: null, porPagar: null, montoPorPagar: null, origenCarga: "guia_foto" },
  };
  const vista = vistaDeBurbuja(activa, "en_parada", {
    whatsapp: false,
    aviso: { texto: "Entrega registrada", deshacer: true },
    nueva: false,
    adelante: "⚠ En 2 paradas: calle en 2 lugares",
  });
  assert.equal(vista.porPagar, "POR PAGAR por revisar ⚠");
  assert.equal(vista.estado.texto, "⚠ En 2 paradas: calle en 2 lugares");
  assert.equal(vista.aviso.deshacer, true);
});

// ------------------------------------------------- escanear desde la parada
test("Escanear desde la parada: si el paquete es de otra, lo dice; si es el mismo, nada", () => {
  const esperado = { pedidoId: "a", secuencia: 4, of: "900104" };
  assert.equal(tituloEsperado(esperado), "Parada 4 · OF 900 104");
  assert.equal(textoOtraParada(esperado, { pedido: { id: "a" }, parada: { n: 4, total: 9 } }), null);
  assert.equal(textoOtraParada(esperado, { pedido: { id: "b" }, parada: { n: 7, total: 9 } }), "Este paquete es de la parada 7, no de esta.");
  assert.match(textoOtraParada(esperado, { pedido: { id: "c" }, parada: null }), /no está en la ruta/);
  assert.equal(textoOtraParada(null, { pedido: { id: "b" }, parada: { n: 7, total: 9 } }), null, "desde la carga no compara");
});

// ------------------------------------------------- sin gastar ORS (spec 031)
test("Con la red propia, «Dejar como pendiente», «Ahora», «Pidió otra hora», «Se movió» y sumar no le consultan a ORS", async () => {
  const { readFileSync } = await import("node:fs");
  const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
  // Puntos del fixture (al azar sobre calles de Arica): no son de nadie.
  const ids = [];
  for (let i = 1; i <= 8; i++) {
    const p = DIA.puntos[i];
    const g = await almacen.guardarPedido({ nombre: `Prueba ${i}`, telefono: "", direccion: `Calle inventada ${i}00, Arica`, lat: p.lat, lng: p.lng, notas: null }, HOY);
    ids.push(g.id);
  }
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids.slice(0, 7), trazado: null, distanciaM: null, duracionS: null, partida: DIA.puntos[0] });

  const consultas = [];
  const antes = globalThis.fetch;
  globalThis.fetch = async (entrada) => {
    consultas.push(typeof entrada === "string" ? entrada : entrada.url);
    throw new TypeError("sin red (prueba)");
  };
  try {
    await dejarParaMasTarde(HOY, ids[0]);
    assert.equal(await reubicar.retrazarRuta(HOY), true, "la red propia dibuja el trazado");
    await hacerAhora(HOY, ids[5]);
    assert.equal(await reubicar.retrazarRuta(HOY), true);
    await reubicar.pedirOtraHora(HOY, ids[2], "16-18", new Date(2026, 10, 13, 9, 0));
    assert.equal(await reubicar.retrazarRuta(HOY), true);
    const lejos = DIA.puntos[20];
    await reubicar.reubicarPorPunto(HOY, ids[3], lejos);
    assert.equal(await reubicar.retrazarRuta(HOY), true);
    assert.equal(await sumarALaRuta(HOY), 1, "el de afuera entra");
  } finally {
    globalThis.fetch = antes;
  }
  assert.deepEqual(consultas.filter((u) => u.includes("openrouteservice")), [], "ninguna consulta a ORS");
  const ruta = await almacen.leerRuta(HOY);
  assert.ok(ruta.trazado?.length > 1, "quedó el trazado de la red");
  assert.equal(ruta.orden.length, 8);
});
