// Spec 004: el aviso que pide confirmar la dirección, de punta a punta sin red.
//
// Lo que se cuida:
//  1. Lo que sale a Meta: la plantilla con nombre y dirección (la excepción que
//     aceptó el dueño, 2026-11-09) y el código como flow_token. Sin coordenadas.
//  2. Lo que vuelve del formulario se lee sin confiar en él: un JSON raro no
//     tumba nada y lo escrito se limpia y se corta.
//  3. En el teléfono: el aviso sale recién cuando el pedido tiene teléfono y
//     nombre (al leer la etiqueta), «Sí» deja la referencia, «No» deja un ⚠ con la
//     dirección que dio, una vez por mensaje y sin reabrir lo cerrado.
// Las direcciones son calles reales de Arica con números inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { enviarConfirmarDireccion } = await import("@/lib/whatsapp/confirmar-direccion");
const { leerFormularioDireccion, limpiarTextoReceptor, MAX_TEXTO_RECEPTOR } = await import(
  "@/lib/encomiendas/config"
);
const { problemasDelPedido } = await import("@/lib/encomiendas/problemas");
const { meta, instalarMeta, desinstalarMeta } = await import("./dobles/meta-whatsapp.mjs");
const almacen = await import("@/lib/encomiendas/local/almacen");
const { guardarPedido, guardarRuta, leerPedidos, marcarResultado, reiniciarDisponibilidad } = almacen;
const { aplicarRespuestas, pedidosSinAviso } = await import("@/lib/encomiendas/local/sincronizar-whatsapp");
const idb = await import("@/lib/encomiendas/local/idb");

const HOY = "2026-11-10";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";
const yaMismo = async () => {};

// ===========================================================================
// Lo que sale a Meta
// ===========================================================================

const AVISO = {
  telefono: "+56912340001",
  nombre: "Ana",
  direccion: "Pasaje Los Aromos 1234, Arica",
  correlationId: "corr-dir-0001",
};

test.before(() => {
  process.env.WHATSAPP_EN_PAUSA = "no";
  process.env.WHATSAPP_TOKEN = "EAAG-token-de-prueba";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID_1";
  process.env.WHATSAPP_PLANTILLA_IDIOMA = "es";
  delete process.env.WHATSAPP_PLANTILLA_DIRECCION;
  instalarMeta();
});
test.after(desinstalarMeta);

test("la dirección sale como plantilla con el nombre y la dirección en el cuerpo", async () => {
  meta.reset();
  const r = await enviarConfirmarDireccion(AVISO, yaMismo);
  assert.equal(r.ok, true);
  const c = meta.llamadas.at(-1).cuerpo;
  assert.equal(c.type, "template");
  assert.equal(c.to, "+56912340001");
  assert.equal(c.template.name, "confirmar_direccion");
  const body = c.template.components.find((x) => x.type === "body");
  assert.deepEqual(
    body.parameters.map((p) => p.text),
    ["Ana", "Pasaje Los Aromos 1234, Arica"],
  );
});

test("un solo botón, el del formulario, con el código como flow_token", async () => {
  meta.reset();
  await enviarConfirmarDireccion(AVISO, yaMismo);
  const botones = meta.llamadas.at(-1).cuerpo.template.components.filter((x) => x.type === "button");
  assert.equal(botones.length, 1);
  assert.equal(botones[0].sub_type, "flow");
  assert.equal(botones[0].index, "0");
  assert.deepEqual(botones[0].parameters, [{ type: "action", action: { flow_token: "corr-dir-0001" } }]);
});

test("a Meta no salen coordenadas ni el id del pedido", async () => {
  meta.reset();
  await enviarConfirmarDireccion(AVISO, yaMismo);
  const crudo = JSON.stringify(meta.llamadas.at(-1).cuerpo);
  for (const prohibido of ["lat", "lng", "pedidoId", "pedido_id"]) {
    assert.ok(!crudo.includes(`"${prohibido}"`), `salió «${prohibido}» a Meta`);
  }
});

test("la plantilla se puede cambiar por entorno", async () => {
  meta.reset();
  process.env.WHATSAPP_PLANTILLA_DIRECCION = "otra_plantilla";
  try {
    await enviarConfirmarDireccion(AVISO, yaMismo);
    assert.equal(meta.llamadas.at(-1).cuerpo.template.name, "otra_plantilla");
  } finally {
    delete process.env.WHATSAPP_PLANTILLA_DIRECCION;
  }
});

// ===========================================================================
// Lo que vuelve del formulario
// ===========================================================================

const formulario = (datos) => JSON.stringify({ flow_token: "corr-dir-0001", ...datos });

test("«Sí, es correcta» con referencia", () => {
  assert.deepEqual(leerFormularioDireccion(formulario({ confirma: "si", texto: "reja verde" })), {
    accion: "DIRECCION_SI",
    correlationId: "corr-dir-0001",
    texto: "reja verde",
  });
});

test("«No, es otra» con la dirección correcta, y sin texto queda null", () => {
  assert.equal(
    leerFormularioDireccion(formulario({ confirma: "no", texto: "Av. Santa María 2050" })).accion,
    "DIRECCION_NO",
  );
  assert.equal(leerFormularioDireccion(formulario({ confirma: "si" })).texto, null);
  assert.equal(leerFormularioDireccion(formulario({ confirma: "si", texto: "   " })).texto, null);
});

test("lo que no se entiende se descarta sin lanzar", () => {
  for (const basura of [
    null,
    42,
    "",
    "no es json",
    "[]",
    JSON.stringify({ confirma: "si" }),
    formulario({ confirma: "quizas" }),
    JSON.stringify({ flow_token: "  ", confirma: "si" }),
  ]) {
    assert.equal(leerFormularioDireccion(basura), null, `aceptó ${JSON.stringify(basura)}`);
  }
});

test("lo escrito queda en una línea, sin control y con tope", () => {
  assert.equal(limpiarTextoReceptor("  reja\nverde\t\u0007 al lado  "), "reja verde al lado");
  const largo = limpiarTextoReceptor("a".repeat(MAX_TEXTO_RECEPTOR + 50));
  assert.equal(largo.length, MAX_TEXTO_RECEPTOR);
  assert.equal(limpiarTextoReceptor(7), null);
});

// ===========================================================================
// En el teléfono
// ===========================================================================

const CLAVE = { [idb.STORES.pedidos]: (f) => f.id, [idb.STORES.rutas]: (f) => f.fecha, [idb.STORES.cola]: (f) => f.id };

async function limpiar() {
  for (const store of Object.keys(CLAVE)) {
    const todos = await idb.leerTodos(store);
    if (todos.length === 0) continue;
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todos) borrar(store, CLAVE[store](fila));
    });
  }
}
test.beforeEach(limpiar);

const pedidoCon = (datos = {}) =>
  guardarPedido(
    {
      nombre: "Destinatario 1",
      telefono: "+56912340001",
      direccion: "Pasaje Los Aromos 1234, Arica",
      lat: -18.47,
      lng: -70.29,
      notas: null,
      ...datos,
    },
    HOY,
  );

const leer = async (id) => (await leerPedidos(HOY)).find((p) => p.id === id);
const respuesta = (pedidoId, accion, texto, mensajeId = "wamid.D1") => ({
  pedidoId,
  mensajeId,
  accion,
  bloqueHorarioId: null,
  texto,
  recibidoEn: "2026-11-10T12:00:00.000Z",
});

test("sin teléfono o sin nombre no se avisa: la guía espera a la etiqueta", async () => {
  const sinTelefono = await pedidoCon({ telefono: "" });
  const sinNombre = await pedidoCon({ nombre: "" });
  const listo = await pedidoCon();
  assert.deepEqual(
    pedidosSinAviso(await leerPedidos(HOY)).map((p) => p.id),
    [listo.id],
  );
  // Sin teléfono no se gastan intentos: cuando llega la etiqueta, sale.
  assert.equal((await leer(sinTelefono.id)).aviso.intentos, 0);
  assert.equal((await leer(sinNombre.id)).aviso.intentos, 0);
});

test("«Sí» deja la referencia y la dirección confirmada, sin tocar la disponibilidad", async () => {
  const { id } = await pedidoCon();
  const r = await aplicarRespuestas([respuesta(id, "DIRECCION_SI", "reja verde")], CONDUCTOR);
  assert.equal(r.aplicadas, 1);
  assert.deepEqual(r.confirmar, ["wamid.D1"]);
  assert.equal(r.direccionesNuevas, 0);
  const p = await leer(id);
  assert.equal(p.direccionConfirmada, true);
  assert.equal(p.referenciaReceptor, "reja verde");
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  assert.equal(p.aviso.estado, "respondido");
  assert.equal(p.direccion, "Pasaje Los Aromos 1234, Arica");
});

test("«No» deja un ⚠ con la dirección que dio y no cambia la de la guía", async () => {
  const { id } = await pedidoCon();
  const r = await aplicarRespuestas([respuesta(id, "DIRECCION_NO", "Av. Santa María 2050")], CONDUCTOR);
  assert.equal(r.direccionesNuevas, 1);
  const p = await leer(id);
  assert.equal(p.direccionConfirmada, false);
  assert.equal(p.direccion, "Pasaje Los Aromos 1234, Arica");
  assert.deepEqual(p.problemas, [{ tipo: "receptor_otra_direccion", direccion: "Av. Santa María 2050" }]);
  const ps = problemasDelPedido(p);
  assert.deepEqual(
    ps.map((x) => [x.texto, x.avisaAntes]),
    [["El receptor dice otra dirección", true]],
  );
});

test("la misma respuesta dos veces cambia el pedido una vez y se sigue confirmando", async () => {
  const { id } = await pedidoCon();
  const lote = [respuesta(id, "DIRECCION_NO", "Av. Santa María 2050")];
  await aplicarRespuestas(lote, CONDUCTOR);
  const segunda = await aplicarRespuestas(lote, CONDUCTOR);
  assert.equal(segunda.aplicadas, 0);
  assert.deepEqual(segunda.confirmar, ["wamid.D1"]);
  assert.equal((await leer(id)).problemas.length, 1);
});

test("un pedido ya entregado no se reabre con una respuesta tardía", async () => {
  const { id } = await pedidoCon();
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [id], trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");
  const r = await aplicarRespuestas([respuesta(id, "DIRECCION_NO", "Av. Santa María 2050")], CONDUCTOR);
  assert.equal(r.aplicadas, 0);
  assert.deepEqual(r.confirmar, ["wamid.D1"]);
  const p = await leer(id);
  assert.deepEqual(p.problemas, []);
  assert.equal(p.direccionConfirmada, null);
});

test("corregir la dirección quita el ⚠ del receptor y la confirmación de la anterior", async () => {
  const p0 = await pedidoCon();
  await aplicarRespuestas([respuesta(p0.id, "DIRECCION_NO", "Av. Santa María 2050")], CONDUCTOR);
  const actual = await leer(p0.id);
  await guardarPedido(
    { nombre: actual.nombre, telefono: actual.telefono, direccion: "Av. Santa María 2050, Arica", lat: -18.48, lng: -70.3, notas: null },
    HOY,
    p0.id,
  );
  const p = await leer(p0.id);
  assert.deepEqual(p.problemas, []);
  assert.equal(p.direccionConfirmada, null);
});

test("el teléfono equivocado borra lo que contestó la otra persona", async () => {
  const { id } = await pedidoCon();
  await aplicarRespuestas([respuesta(id, "DIRECCION_SI", "reja verde")], CONDUCTOR);
  await aplicarRespuestas([respuesta(id, "DIRECCION_NO", null, "wamid.D2")], CONDUCTOR);
  await reiniciarDisponibilidad(id);
  const p = await leer(id);
  assert.equal(p.direccionConfirmada, null);
  assert.equal(p.referenciaReceptor, null);
  assert.deepEqual(p.problemas, []);
});

test("lo escrito se vuelve a limpiar al bajar: viene de un desconocido", async () => {
  const { id } = await pedidoCon();
  await aplicarRespuestas([respuesta(id, "DIRECCION_SI", "reja\n\nverde")], CONDUCTOR);
  assert.equal((await leer(id)).referenciaReceptor, "reja verde");
});
