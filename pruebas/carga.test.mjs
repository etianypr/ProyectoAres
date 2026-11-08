// Carga del día (spec 005): pedidos desde la guía y el escaneo de cada etiqueta,
// sobre el almacén real (fake-indexeddb). La OF une guía, pedido, parada y etiqueta.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { leerGuia } = await import("@/lib/encomiendas/lectura/guia");
const { leerEtiqueta } = await import("@/lib/encomiendas/lectura/etiqueta");
const { leerCodigoEtiqueta } = await import("@/lib/encomiendas/lectura/codigo-barras");

const HOY = "2026-10-24";
const fixture = (n) => readFileSync(new URL(`./fixtures/lectura/${n}`, import.meta.url), "utf8");

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

/** La guía del fixture → pedidos (solo las líneas buenas) → ruta en ese orden. */
async function diaDesdeGuia() {
  const guia = leerGuia(fixture("guia.txt"));
  const buenas = guia.lineas.filter((l) => !l.dudosa);
  const { creados } = await almacen.crearDesdeGuia(buenas, HOY, { folio: guia.folio, origen: "guia_pegada" });
  await almacen.guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: creados.map((p) => p.id),
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
  return creados;
}

test("la guía crea un pedido por línea, con OF, destino y origen", async () => {
  const guia = leerGuia(fixture("guia.txt"));
  const { creados, yaEstaban } = await almacen.crearDesdeGuia(guia.lineas.filter((l) => !l.dudosa), HOY, {
    folio: guia.folio,
    origen: "guia_pegada",
  });
  assert.equal(creados.length, 5);
  assert.equal(yaEstaban, 0);
  const [p] = await almacen.leerPedidos(HOY).then((ps) => ps.filter((x) => x.of === "200000002"));
  assert.equal(p.direccion, "PASAJE LOS PINOS 56");
  assert.deepEqual([p.nombre, p.telefono, p.lat], ["", "", null], "nombre y teléfono llegan con la etiqueta");
  assert.deepEqual([p.folioGuia, p.origenCarga, p.resultado], ["1000001", "guia_pegada", "pendiente"]);
});

test("cargar la guía dos veces no duplica pedidos", async () => {
  const lineas = [{ of: "200000001", destino: "CALLE 1" }];
  await almacen.crearDesdeGuia(lineas, HOY, { folio: null, origen: "guia_pegada" });
  const segunda = await almacen.crearDesdeGuia(lineas, HOY, { folio: null, origen: "guia_pegada" });
  assert.deepEqual([segunda.creados.length, segunda.yaEstaban], [0, 1]);
  assert.equal((await almacen.leerPedidos(HOY)).length, 1);
});

test("escanear la etiqueta dice la parada y completa el pedido", async () => {
  await diaDesdeGuia();
  const codigo = leerCodigoEtiqueta("92000022560000200000002001");
  const texto = leerEtiqueta(fixture("etiqueta-por-pagar.txt"));
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { ...codigo, ...texto });

  assert.deepEqual(r.parada, { n: 2, total: 5 }, "PARADA 2 de 5");
  assert.deepEqual(
    [r.pedido.nombre, r.pedido.telefono, r.pedido.porPagar, r.pedido.montoPorPagar],
    ["JUAN PEREZ SOTO", "+56912345678", true, 12990],
  );
  assert.deepEqual([r.pedido.bultos, r.pedido.bultosEscaneados], [2, [1]]);
  assert.equal(r.direccionDistinta, null, "\"…, ARICA\" es la misma dirección");
});

test("sin texto, el código solo ya alcanza para saber la parada", async () => {
  await diaDesdeGuia();
  const r = await almacen.aplicarLecturaEtiqueta(HOY, leerCodigoEtiqueta("92000022560000200000005001"));
  assert.deepEqual(r.parada, { n: 5, total: 5 });
  assert.equal(r.pedido.nombre, "");
});

test("varios bultos: el mismo escaneado dos veces no cuenta dos", async () => {
  await diaDesdeGuia();
  const bulto = (n) => ({ ...leerCodigoEtiqueta(`9200002256000020000000200${n}`), bultosTotal: 2 });
  await almacen.aplicarLecturaEtiqueta(HOY, bulto(1));
  await almacen.aplicarLecturaEtiqueta(HOY, bulto(1));
  const r = await almacen.aplicarLecturaEtiqueta(HOY, bulto(2));
  assert.deepEqual(r.pedido.bultosEscaneados, [1, 2]);
});

test("spec 027: la OF escrita a mano suma un bulto cada vez, con el primer número libre", async () => {
  await diaDesdeGuia();
  const aMano = { ...leerCodigoEtiqueta("200000002"), escaneo: true };
  const primera = await almacen.aplicarLecturaEtiqueta(HOY, aMano);
  assert.deepEqual([primera.pedido.bultosEscaneados, primera.bultoAMano], [[1], 1]);
  assert.equal(primera.pedido.bultos, null, "con un solo bulto no se inventa el total");
  assert.deepEqual(almacen.avanceCarga([primera.pedido]), { escaneados: 1, total: 1 }, "cuenta para cargar el auto");

  const segunda = await almacen.aplicarLecturaEtiqueta(HOY, aMano);
  assert.deepEqual([segunda.pedido.bultosEscaneados, segunda.bultoAMano], [[1, 2], 2]);
  assert.equal(segunda.pedido.bultos, 2, "repetida: el envío tiene un bulto más");
});

test("spec 027: volver a leer el pedido (sin escaneo) no suma bultos", async () => {
  await diaDesdeGuia();
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000002", bulto: null });
  assert.deepEqual([r.pedido.bultosEscaneados, r.bultoAMano], [[], null]);
});

test("spec 027: el código de un bulto ya contado no suma; uno nuevo sube el total", async () => {
  await diaDesdeGuia();
  const codigo = (n) => ({ ...leerCodigoEtiqueta(`9200002256000020000000200${n}`), escaneo: true });
  await almacen.aplicarLecturaEtiqueta(HOY, codigo(1));
  const repetido = await almacen.aplicarLecturaEtiqueta(HOY, codigo(1));
  assert.deepEqual(repetido.pedido.bultosEscaneados, [1], "la misma etiqueta otra vez es la misma caja");
  const otro = await almacen.aplicarLecturaEtiqueta(HOY, codigo(2));
  assert.deepEqual([otro.pedido.bultosEscaneados, otro.pedido.bultos], [[1, 2], 2]);
});

test("spec 027: la etiqueta de la caja escrita a mano cambia el número provisorio por el suyo", async () => {
  await diaDesdeGuia();
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { ...leerCodigoEtiqueta("200000002"), escaneo: true });
  // La foto (o el texto) de esa etiqueta dice "Bulto N° 002/002".
  const conEtiqueta = await almacen.aplicarLecturaEtiqueta(HOY, {
    of: "200000002",
    bulto: 2,
    bultosTotal: 2,
    reemplazaBulto: r.bultoAMano,
  });
  assert.deepEqual([conEtiqueta.pedido.bultosEscaneados, conEtiqueta.pedido.bultos], [[2], 2], "una caja, no dos");
  const laOtra = await almacen.aplicarLecturaEtiqueta(HOY, {
    ...leerCodigoEtiqueta("92000022560000200000002001"),
    escaneo: true,
  });
  assert.deepEqual(laOtra.pedido.bultosEscaneados, [1, 2], "el código del bulto 1 sigue sumando");
});

test("una OF que no está en el día no enlaza nada", async () => {
  await diaDesdeGuia();
  assert.equal(await almacen.aplicarLecturaEtiqueta(HOY, leerCodigoEtiqueta("999999999")), null);
});

test("la dirección distinta de la etiqueta se avisa y no se cambia sola", async () => {
  await diaDesdeGuia();
  const r = await almacen.aplicarLecturaEtiqueta(HOY, {
    ...leerCodigoEtiqueta("200000001"),
    direccion: "OTRA CALLE 99, ARICA",
  });
  assert.equal(r.direccionDistinta, "OTRA CALLE 99, ARICA");
  assert.equal(r.pedido.direccion, "AVENIDA SANTA MARIA 1234 EDIFICIO 02");
});

test("lo que el conductor ya escribió no lo pisa la etiqueta", async () => {
  const p = await almacen.guardarPedido(
    { nombre: "Juan", telefono: "+56911111111", direccion: "Calle 1", lat: null, lng: null, notas: null, of: "200000009" },
    HOY,
  );
  const r = await almacen.aplicarLecturaEtiqueta(HOY, {
    of: "200000009",
    bulto: 1,
    destinatario: "JUAN PEREZ",
    telefono: "+56922222222",
  });
  assert.deepEqual([r.pedido.id, r.pedido.nombre, r.pedido.telefono], [p.id, "Juan", "+56911111111"]);
});

// El pago, el monto y los bultos siguen la misma regla que el nombre y el
// teléfono: lo ya cargado solo lo corrige una etiqueta de OF confirmada (es plata
// del conductor). Antes cualquier lectura los pisaba (hueco de la skill
// lectura-starken, 2026-11-08).
async function pedidoCobrando() {
  await almacen.guardarPedido(
    { nombre: "Ana", telefono: "+56911111111", direccion: "Calle 1", lat: null, lng: null, notas: null, of: "200000009" },
    HOY,
  );
  return almacen.aplicarLecturaEtiqueta(HOY, {
    of: "200000009",
    bulto: 1,
    porPagar: true,
    montoPorPagar: 12990,
    bultosTotal: 2,
    ofConfirmada: true,
  });
}

test("una lectura sin OF confirmada no pisa el POR PAGAR, el monto ni los bultos", async () => {
  await pedidoCobrando();
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000009", bulto: null, porPagar: false, montoPorPagar: null, bultosTotal: 5 });
  assert.deepEqual([r.pedido.porPagar, r.pedido.montoPorPagar, r.pedido.bultos], [true, 12990, 2]);
  const otro = await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000009", bulto: null, porPagar: true, montoPorPagar: 9990 });
  assert.equal(otro.pedido.montoPorPagar, 12990, "otro monto sin OF confirmada no reemplaza el que había");
});

test("con OF confirmada sí se corrige; si pasa a «no se cobra», no queda un monto viejo", async () => {
  await pedidoCobrando();
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000009", bulto: null, porPagar: false, montoPorPagar: null, ofConfirmada: true });
  assert.deepEqual([r.pedido.porPagar, r.pedido.montoPorPagar], [false, null]);
});

test("una lectura sin OF confirmada completa lo que faltaba (el monto por revisar)", async () => {
  await almacen.guardarPedido(
    { nombre: "Ana", telefono: "+56911111111", direccion: "Calle 1", lat: null, lng: null, notas: null, of: "200000009" },
    HOY,
  );
  await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000009", bulto: 1, porPagar: true, montoPorPagar: null });
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000009", bulto: null, porPagar: true, montoPorPagar: 7500 });
  assert.deepEqual([r.pedido.porPagar, r.pedido.montoPorPagar], [true, 7500]);
  const sinMonto = await almacen.aplicarLecturaEtiqueta(HOY, { of: "200000009", bulto: null, porPagar: true, montoPorPagar: null, ofConfirmada: true });
  assert.equal(sinMonto.pedido.montoPorPagar, 7500, "una lectura que no vio el monto no lo borra");
});

// ---------------------------------------------------------------------------
// Cobros del día, origen, paquetes sin etiqueta y cambio de dirección
// (spec 005: T022, T026, T027, T028)
// ---------------------------------------------------------------------------

test("el resumen del día suma lo que hay que cobrar y lo cobrado", async () => {
  const creados = await diaDesdeGuia();
  await almacen.aplicarLecturaEtiqueta(HOY, { ...leerCodigoEtiqueta("200000002"), porPagar: true, montoPorPagar: 12990 });
  await almacen.aplicarLecturaEtiqueta(HOY, { ...leerCodigoEtiqueta("200000003"), porPagar: true, montoPorPagar: 5000 });
  // POR PAGAR sin monto leído: cuenta como por pagar pero no inventa plata.
  await almacen.aplicarLecturaEtiqueta(HOY, { ...leerCodigoEtiqueta("200000004"), porPagar: true, montoPorPagar: null });
  const pedidos = (await almacen.leerPedidos(HOY)).map((p) =>
    p.of === "200000002" ? { ...p, resultado: "entregado" } : p,
  );
  const cifras = almacen.cifrasDelDia(HOY, null, pedidos);
  assert.deepEqual([cifras.porPagar, cifras.aCobrar, cifras.cobrado], [3, 17990, 12990]);
  assert.deepEqual(cifras.porOrigen, { guia_pegada: creados.length });
});

test("dos tramos de un mismo día suman cobros y orígenes", () => {
  const base = { fecha: HOY, asignados: 0, paradas: 0, entregadas: 0, noEntregadas: 0, inicio: null, cierre: null };
  const suma = almacen.sumarResumenes(
    { ...base, porPagar: 1, aCobrar: 1000, cobrado: 1000, porOrigen: { guia_foto: 2 } },
    { ...base, porPagar: 2, aCobrar: 3000, cobrado: 0, porOrigen: { guia_foto: 1, manual: 1 } },
  );
  assert.deepEqual([suma.porPagar, suma.aCobrar, suma.cobrado], [3, 4000, 1000]);
  assert.deepEqual(suma.porOrigen, { guia_foto: 3, manual: 1 });
});

test("un día guardado antes de los cobros se lee con ceros", async () => {
  const viejo = { fecha: "2026-10-20", asignados: 4, paradas: 4, entregadas: 3, noEntregadas: 1, inicio: null, cierre: "x" };
  await idb.escribir([idb.STORES.dias], ({ guardar }) => guardar(idb.STORES.dias, viejo));
  const leido = await almacen.leerResumenDia("2026-10-20");
  assert.deepEqual([leido.porPagar, leido.aCobrar, leido.cobrado, leido.porOrigen], [0, 0, 0, {}]);
});

test("los de la guía sin etiqueta escaneada se avisan; los escaneados no", async () => {
  await diaDesdeGuia();
  await almacen.aplicarLecturaEtiqueta(HOY, leerCodigoEtiqueta("92000022560000200000002001"));
  const faltan = almacen.sinEtiquetaEscaneada(await almacen.leerPedidos(HOY)).map((p) => p.of);
  assert.equal(faltan.length, 4);
  assert.ok(!faltan.includes("200000002"));
});

test("usar la dirección de la etiqueta la cambia y deja el punto nuevo (o ninguno)", async () => {
  const [p] = await diaDesdeGuia();
  const cambiado = await almacen.cambiarDireccion(p.id, "OTRA CALLE 99", { lat: -18.48, lng: -70.31 });
  assert.deepEqual([cambiado.direccion, cambiado.lat, cambiado.lng], ["OTRA CALLE 99", -18.48, -70.31]);
  const sinUbicar = await almacen.cambiarDireccion(p.id, "CALLE QUE NO EXISTE 1", null);
  assert.deepEqual([sinUbicar.lat, sinUbicar.lng], [null, null], "el punto viejo era de la otra dirección");
  assert.equal(await almacen.cambiarDireccion("no-existe", "X", null), null);
});
