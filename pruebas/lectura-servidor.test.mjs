// La lectura con IA (spec 005) contra un doble del fetch global: corre el
// adaptador REAL (lib/encomiendas/lectura/servidor.ts) con el SDK de Anthropic, así
// que se comprueba lo que de verdad sale —modelo, foto, salida estructurada,
// encabezados— y cómo se interpreta lo que vuelve. No gasta nada en la API.
import test from "node:test";
import assert from "node:assert/strict";

const { leerFoto, lecturaIADisponible, LecturaIlegible } = await import("@/lib/encomiendas/lectura/servidor");

const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const fetchOriginal = globalThis.fetch;
let pedidos = [];

/** Responde como la API de Mensajes, con `texto` como único bloque. */
function instalar(texto, { stop_reason = "end_turn" } = {}) {
  pedidos = [];
  globalThis.fetch = async (url, init) => {
    const req = new Request(url, init);
    pedidos.push({ url: req.url, headers: Object.fromEntries(req.headers), cuerpo: JSON.parse(await req.text()) });
    return new Response(
      JSON.stringify({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [{ type: "text", text: texto }],
        stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 1500, output_tokens: 200 },
      }),
      { status: 200, headers: { "content-type": "application/json", "request-id": "req_prueba" } },
    );
  };
}

test.beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-de-prueba";
  delete process.env.ANTHROPIC_WORKSPACE_ID;
  delete process.env.LECTURA_MODELO;
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});

const ETIQUETA = {
  of: "200000002",
  bulto: 1,
  bultosTotal: 2,
  destinatario: "JUAN PEREZ SOTO",
  telefono: "9 1234 5678",
  direccion: "PASAJE LOS PINOS 56, ARICA",
  pago: "POR_PAGAR",
  montoPorPagar: 12990,
  descripcion: { tipo: "bolsa", tamano: "grande", color: "gris", nota: "cinta roja" },
  dudosos: [],
};

test("sin clave, la lectura con IA está apagada", () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(lecturaIADisponible(), false);
});

test("la etiqueta sale con la foto, el modelo y la salida estructurada", async () => {
  instalar(JSON.stringify(ETIQUETA));
  const r = await leerFoto("etiqueta", FOTO, "image/jpeg");

  assert.equal(pedidos.length, 1);
  const { url, headers, cuerpo } = pedidos[0];
  assert.match(url, /\/v1\/messages/);
  assert.equal(headers.authorization, "Bearer sk-ant-api03-de-prueba", "el SDK 1.x manda la clave como Bearer");
  assert.equal(headers["anthropic-workspace-id"], undefined, "sin workspace no se manda");
  assert.equal(cuerpo.model, "claude-opus-5");
  assert.deepEqual(cuerpo.thinking, { type: "disabled" });
  assert.equal(cuerpo.output_config.format.type, "json_schema");
  const [imagen, texto] = cuerpo.messages[0].content;
  assert.deepEqual(imagen.source, { type: "base64", media_type: "image/jpeg", data: Buffer.from(FOTO).toString("base64") });
  assert.match(texto.text, /No extraigas RUT, remitente, correo/);

  assert.equal(r.tipo, "etiqueta");
  assert.equal(r.etiqueta.telefono, "+56912345678", "el teléfono sale normalizado");
  assert.deepEqual([r.etiqueta.porPagar, r.etiqueta.montoPorPagar], [true, 12990]);
  assert.deepEqual(r.etiqueta.referencia, { tipo: "bolsa", tamano: "grande", color: "gris", nota: "cinta roja" });
  assert.equal(r.etiqueta.ofImpresa, "200000002");
});

test("una clave de usuario manda el workspace; el modelo se cambia por variable", async () => {
  process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_prueba";
  process.env.LECTURA_MODELO = "claude-sonnet-5";
  instalar(JSON.stringify(ETIQUETA));
  await leerFoto("etiqueta", FOTO, "image/jpeg");
  assert.equal(pedidos[0].headers["anthropic-workspace-id"], "wrkspc_prueba");
  assert.equal(pedidos[0].cuerpo.model, "claude-sonnet-5");
});

test("con Haiku no se manda 'effort' (no lo acepta)", async () => {
  process.env.LECTURA_MODELO = "claude-haiku-4-5";
  instalar(JSON.stringify(ETIQUETA));
  await leerFoto("etiqueta", FOTO, "image/jpeg");
  assert.equal(pedidos[0].cuerpo.model, "claude-haiku-4-5");
  assert.equal(pedidos[0].cuerpo.output_config.effort, undefined);
  assert.equal(pedidos[0].cuerpo.output_config.format.type, "json_schema");
});

test("POR PAGAR sin monto queda por revisar, nunca en 0", async () => {
  instalar(JSON.stringify({ ...ETIQUETA, montoPorPagar: 0 }));
  const { etiqueta } = await leerFoto("etiqueta", FOTO, "image/jpeg");
  assert.equal(etiqueta.montoPorPagar, null);
  assert.ok(etiqueta.dudosos.includes("montoPorPagar"));
});

test("la guía va siempre al modelo grande, aunque las etiquetas usen Haiku", async () => {
  // Terreno 2026-10-25: con un modelo chico cada foto de la guía daba una
  // cantidad distinta de líneas.
  process.env.LECTURA_MODELO = "claude-haiku-4-5";
  instalar(JSON.stringify({ folio: null, totalDeclarado: null, lineas: [] }));
  await leerFoto("guia", FOTO, "image/jpeg");
  assert.equal(pedidos[0].cuerpo.model, "claude-opus-5");
  assert.equal(pedidos[0].cuerpo.output_config.effort, "medium");
  assert.match(pedidos[0].cuerpo.messages[0].content[1].text, /CADA fila/);

  process.env.LECTURA_MODELO_GUIA = "claude-sonnet-5";
  instalar(JSON.stringify({ folio: null, totalDeclarado: null, lineas: [] }));
  await leerFoto("guia", FOTO, "image/jpeg");
  assert.equal(pedidos[0].cuerpo.model, "claude-sonnet-5");
  delete process.env.LECTURA_MODELO_GUIA;
});

test("la guía vuelve con sus líneas para juntarlas en el teléfono", async () => {
  instalar(JSON.stringify({ folio: "1000001", totalDeclarado: 2, lineas: [{ of: "200000001", destino: "CALLE 1 ." }] }));
  const r = await leerFoto("guia", FOTO, "image/jpeg");
  assert.equal(r.tipo, "guia");
  assert.equal(r.guia.lineas.length, 1);
  assert.equal(pedidos[0].cuerpo.output_config.format.type, "json_schema");
});

test("un rechazo o una respuesta sin forma es foto ilegible", async () => {
  instalar("", { stop_reason: "refusal" });
  await assert.rejects(() => leerFoto("etiqueta", FOTO, "image/jpeg"), LecturaIlegible);
  instalar(JSON.stringify(ETIQUETA), { stop_reason: "max_tokens" });
  await assert.rejects(() => leerFoto("etiqueta", FOTO, "image/jpeg"), LecturaIlegible);
});
