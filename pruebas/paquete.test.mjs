// El paquete de cada pedido (spec 003): la OF, cómo es y su foto.
//
// Funciones puras de src/lib/encomiendas/paquete.ts y el almacén real sobre
// IndexedDB (fake-indexeddb): la foto se va al cerrarse el pedido y con el día.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const {
  formatoOf,
  ofDistinta,
  ofValida,
  textoReferencia,
  notaPaquete,
  referenciaOVacia,
  buscarPorOf,
} = await import("@/lib/encomiendas/paquete");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

const HOY = "2026-10-24";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

// ------------------------------------------------------------- funciones puras

test("la OF se muestra en grupos de tres", () => {
  assert.equal(formatoOf("123456789"), "123 456 789");
  assert.equal(formatoOf("7000123"), "7 000 123", "OF corta");
  assert.equal(formatoOf("12a45"), "12a45", "lo que no es una OF queda como vino");
});

test("la OF acepta espacios, puntos y guiones, y exige 9 dígitos", () => {
  assert.equal(ofValida("275388184"), "275388184");
  assert.equal(ofValida(" 275 388 184 "), "275388184");
  assert.equal(ofValida("275-388-184"), "275388184");
  assert.equal(ofValida("275.388.184"), "275388184");
  assert.equal(ofValida("7000123"), "7000123", "sin regla de largo");
  assert.equal(ofValida("2753881845"), "2753881845", "sin regla de largo");
  assert.equal(ofValida("007000123"), "7000123", "sin ceros a la izquierda (código de barras)");
  assert.equal(ofValida("000000000"), null, "cero");
  assert.equal(ofDistinta("275388184"), false);
  assert.equal(ofDistinta("7000123"), true);
  assert.equal(ofValida("27538818a"), null);
  assert.equal(ofValida(""), null);
});

test("la referencia se lee como se habla, concordando en género", () => {
  const ref = (tipo, color, tamano, nota = null) => ({ tipo, color, tamano, nota });
  assert.equal(textoReferencia(ref("bolsa", "gris", "grande", "cinta roja")), "Bolsa gris grande · cinta roja");
  assert.equal(textoReferencia(ref("caja", "blanco", "chico")), "Caja blanca chica");
  assert.equal(textoReferencia(ref("sobre", "amarillo", "mediano")), "Sobre amarillo mediano");
  assert.equal(textoReferencia(ref("otro", "rojo", null)), "Paquete rojo");
  assert.equal(textoReferencia(ref("bolsa", "cafe", null)), "Bolsa café");
});

test("una referencia parcial dice lo que hay; vacía, nada", () => {
  const ref = (tipo, color, tamano, nota = null) => ({ tipo, color, tamano, nota });
  assert.equal(textoReferencia(ref(null, "negro", "grande")), "Negro grande");
  assert.equal(textoReferencia(ref(null, null, null, "cinta roja")), "cinta roja");
  assert.equal(textoReferencia(ref(null, null, null, "  ")), null);
  assert.equal(textoReferencia(null), null);
  assert.equal(referenciaOVacia(ref(null, null, null, null)), null);
  assert.deepEqual(referenciaOVacia(ref("caja", null, null)), ref("caja", null, null));
});

test("la nota se recorta a 40 caracteres", () => {
  assert.equal(notaPaquete("  cinta roja  "), "cinta roja");
  assert.equal(notaPaquete("x".repeat(60)).length, 40);
  assert.equal(notaPaquete("   "), null);
});

test("buscar por los últimos dígitos de la OF", () => {
  const p = (id, of, resultado = "pendiente") => ({ id, of, resultado });
  const pedidos = [p("a", "123456789"), p("b", "999996789"), p("c", "111111111"), p("d", "555556789", "entregado"), p("e", null)];
  assert.deepEqual(buscarPorOf(pedidos, "6789").map((x) => x.id), ["a", "b"], "varios coinciden; los cerrados no");
  assert.deepEqual(buscarPorOf(pedidos, "89"), [], "con menos de 3 dígitos no se busca");
  assert.deepEqual(buscarPorOf(pedidos, "000"), []);
  assert.deepEqual(buscarPorOf(pedidos, "6 789").map((x) => x.id), ["a", "b"], "los espacios no cuentan");
});

// ------------------------------------------------------------------- almacén

async function limpiar() {
  for (const store of Object.values(idb.STORES)) {
    await idb.escribir([store], ({ vaciar }) => vaciar(store));
  }
}
test.beforeEach(limpiar);

const datos = (n, extra = {}) => ({
  nombre: `Destinatario ${n}`,
  telefono: `+5691234000${n}`,
  direccion: `Calle ${n} 100, Arica`,
  lat: -18.47,
  lng: -70.29,
  notas: null,
  ...extra,
});
const foto = (n = 3) => new Blob([new Uint8Array(n)], { type: "image/jpeg" });
const REF = { tipo: "bolsa", tamano: "grande", color: "gris", nota: "cinta roja" };

test("el pedido guarda OF y referencia, y editarlo no las pierde", async () => {
  const p = await almacen.guardarPedido(datos(1, { of: "123456789", referencia: REF }), HOY);
  assert.equal(p.of, "123456789");
  assert.deepEqual(p.referencia, REF);
  const editado = await almacen.guardarPedido(datos(1, { direccion: "Otra 200" }), HOY, p.id);
  assert.equal(editado.of, "123456789", "un guardado sin paquete conserva el que tenía");
  assert.deepEqual(editado.referencia, REF);
});

test("guardarPaquete valida la OF y avisa si se repite en el día", async () => {
  const a = await almacen.guardarPedido(datos(1, { of: "123456789" }), HOY);
  const b = await almacen.guardarPedido(datos(2), HOY);
  assert.deepEqual(await almacen.guardarPaquete(b.id, { of: "987 654 321" }), { ofRepetida: false });
  assert.deepEqual(await almacen.guardarPaquete(b.id, { of: "123-456-789" }), { ofRepetida: true }, "se guarda igual");
  assert.equal((await almacen.leerPedidos(HOY)).find((p) => p.id === b.id).of, "123456789");
  await assert.rejects(() => almacen.guardarPaquete(b.id, { of: "12a45" }), /solo números/);
  assert.equal(await almacen.ofRepetida(HOY, "123456789", a.id), true);
  assert.equal(await almacen.ofRepetida(HOY, null), false);
  assert.equal((await almacen.guardarPaquete(b.id, { of: "7000123" })).ofRepetida, false, "una OF de otro largo vale igual");
});

test("una foto nueva reemplaza a la anterior", async () => {
  const p = await almacen.guardarPedido(datos(1), HOY);
  const primera = await almacen.guardarFoto(p.id, foto(3));
  const segunda = await almacen.guardarFoto(p.id, foto(5));
  assert.notEqual(primera, segunda);
  assert.equal(await almacen.leerFoto(primera), null, "la anterior se borró");
  assert.equal((await almacen.leerFoto(segunda)).size, 5);
  assert.equal((await almacen.leerPedidos(HOY))[0].fotoId, segunda);
  await almacen.borrarFoto(p.id);
  assert.equal((await almacen.leerPedidos(HOY))[0].fotoId, null);
  assert.deepEqual(await idb.leerTodos(idb.STORES.fotos), []);
});

test("la foto se va cuando el pedido se cierra y vence el deshacer", async () => {
  const a = await almacen.guardarPedido(datos(1), HOY);
  const b = await almacen.guardarPedido(datos(2), HOY);
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [a.id, b.id], trazado: null, distanciaM: null, duracionS: null });
  const fotoA = await almacen.guardarFoto(a.id, foto());
  const fotoB = await almacen.guardarFoto(b.id, foto());
  await almacen.marcarResultado({ fecha: HOY, pedidoId: a.id, conductorId: CONDUCTOR }, "entregado");
  assert.ok(await almacen.leerFoto(fotoA), "mientras se puede deshacer, la foto sigue");

  assert.equal(await almacen.purgarFotosCerradas(HOY), 1);
  assert.equal(await almacen.leerFoto(fotoA), null);
  assert.ok(await almacen.leerFoto(fotoB), "la del pendiente se queda");
  assert.equal((await almacen.leerPedidos(HOY)).find((p) => p.id === a.id).fotoId, null);
});

test("eliminar y restaurar un pedido conserva su paquete y su foto", async () => {
  const p = await almacen.guardarPedido(datos(1, { of: "123456789", referencia: REF }), HOY);
  const fotoId = await almacen.guardarFoto(p.id, foto());
  const eliminado = await almacen.borrarPedido(p.id);
  await almacen.restaurarPedido(eliminado);
  const [vuelto] = await almacen.leerPedidos(HOY);
  assert.deepEqual([vuelto.of, vuelto.referencia, vuelto.fotoId], ["123456789", REF, fotoId]);
  assert.ok(await almacen.leerFoto(fotoId));
});

test("ninguna foto sobrevive al cierre del día", async () => {
  const p = await almacen.guardarPedido(datos(1), HOY);
  await almacen.guardarFoto(p.id, foto());
  // Una que quedó huérfana (pedido eliminado sin restaurar) también se va.
  const q = await almacen.guardarPedido(datos(2), HOY);
  await almacen.guardarFoto(q.id, foto());
  await almacen.borrarPedido(q.id);

  await almacen.cerrarYBorrarDia(HOY);
  assert.deepEqual(await idb.leerTodos(idb.STORES.fotos), []);
});

test("cerrar sesión borra todas las fotos", async () => {
  const p = await almacen.guardarPedido(datos(1), HOY);
  await almacen.guardarFoto(p.id, foto());
  await almacen.borrarDatosDestinatarios();
  assert.deepEqual(await idb.leerTodos(idb.STORES.fotos), []);
});

test("un pedido de la guía sin etiqueta escaneada se nombra por su OF", async () => {
  const { nombreVisible } = await import("@/lib/encomiendas/paquete");
  assert.equal(nombreVisible({ nombre: "Juan", of: "123456789" }), "Juan");
  assert.equal(nombreVisible({ nombre: "", of: "123456789" }), "OF 123 456 789");
  assert.equal(nombreVisible({ nombre: " ", of: null }), "Sin nombre");
});
