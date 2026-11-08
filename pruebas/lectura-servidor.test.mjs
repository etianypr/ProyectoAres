// La lectura con IA de la guía (spec 005) contra un doble del fetch global: corre
// el adaptador REAL (lib/encomiendas/lectura/servidor.ts) con el SDK de Anthropic,
// así que se comprueba lo que de verdad sale —modelo, foto, salida estructurada,
// encabezados— y cómo se interpreta lo que vuelve. No gasta nada en la API.
// La etiqueta ya no va a la IA (spec 021): ver etiqueta-en-el-telefono.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";

const { leerFoto, leerFotos, lecturaIADisponible, LecturaIlegible } = await import("@/lib/encomiendas/lectura/servidor");

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
  delete process.env.LECTURA_MODELO_GUIA;
  delete process.env.LECTURA_MODELO_GUIA_ALTA;
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});

const GUIA_VACIA = JSON.stringify({ folio: null, totalDeclarado: null, lineas: [] });

test("sin clave, la lectura con IA está apagada", () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(lecturaIADisponible(), false);
});

test("la guía sale con la foto, el modelo y la salida estructurada", async () => {
  instalar(GUIA_VACIA);
  const r = await leerFoto(FOTO, "image/jpeg");

  assert.equal(pedidos.length, 1);
  const { url, headers, cuerpo } = pedidos[0];
  assert.match(url, /\/v1\/messages/);
  assert.equal(headers.authorization, "Bearer sk-ant-api03-de-prueba", "el SDK 1.x manda la clave como Bearer");
  assert.equal(headers["anthropic-workspace-id"], undefined, "sin workspace no se manda");
  // El dueño eligió Opus para la guía (~US$3 al mes, 2026-10-25).
  assert.equal(cuerpo.model, "claude-opus-5");
  assert.deepEqual(cuerpo.thinking, { type: "disabled" });
  assert.equal(cuerpo.output_config.effort, "medium");
  assert.equal(cuerpo.output_config.format.type, "json_schema");
  const [imagen, texto] = cuerpo.messages[0].content;
  assert.deepEqual(imagen.source, { type: "base64", media_type: "image/jpeg", data: Buffer.from(FOTO).toString("base64") });
  assert.match(texto.text, /CADA fila/);
  // La guía no trae nombre ni teléfono, y no se le piden (spec 021).
  assert.doesNotMatch(texto.text, /destinatario|tel[eé]fono/i);
  assert.equal(r.tipo, "guia");
});

test("una clave de usuario manda el workspace", async () => {
  process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_prueba";
  instalar(GUIA_VACIA);
  await leerFoto(FOTO, "image/jpeg");
  assert.equal(pedidos[0].headers["anthropic-workspace-id"], "wrkspc_prueba");
});

test("los dos modelos de la guía se cambian por variable; con Haiku no se manda 'effort'", async () => {
  process.env.LECTURA_MODELO_GUIA = "claude-haiku-4-5";
  process.env.LECTURA_MODELO_GUIA_ALTA = "claude-sonnet-5";
  instalar(GUIA_VACIA);
  await leerFoto(FOTO, "image/jpeg");
  assert.equal(pedidos[0].cuerpo.model, "claude-haiku-4-5");
  assert.equal(pedidos[0].cuerpo.output_config.effort, undefined, "Haiku no acepta effort");
  assert.equal(pedidos[0].cuerpo.output_config.format.type, "json_schema");
  instalar(GUIA_VACIA);
  await leerFoto(FOTO, "image/jpeg", { alta: true });
  assert.equal(pedidos[0].cuerpo.model, "claude-sonnet-5");
});

test("la guía vuelve con sus líneas para juntarlas en el teléfono", async () => {
  instalar(JSON.stringify({ folio: "1000001", totalDeclarado: 2, lineas: [{ of: "200000001", destino: "CALLE 1 ." }] }));
  const r = await leerFoto(FOTO, "image/jpeg");
  assert.equal(r.tipo, "guia");
  assert.equal(r.guia.lineas.length, 1);
  assert.equal(pedidos[0].cuerpo.output_config.format.type, "json_schema");
});

test("un rechazo o una respuesta sin forma es foto ilegible", async () => {
  instalar("", { stop_reason: "refusal" });
  await assert.rejects(() => leerFoto(FOTO, "image/jpeg"), LecturaIlegible);
  instalar(GUIA_VACIA, { stop_reason: "max_tokens" });
  await assert.rejects(() => leerFoto(FOTO, "image/jpeg"), LecturaIlegible);
});

test("varias fotos de la guía van en UNA consulta, con la instrucción una sola vez", async () => {
  // Terreno 2026-10-27: las 3 fotos del día juntas; la IA une las filas
  // repetidas donde las fotos se superponen.
  instalar(JSON.stringify({ folio: "1000001", totalDeclarado: 3, lineas: [] }));
  await leerFotos([1, 2, 3].map(() => ({ datos: FOTO, mediaType: "image/jpeg" })));
  assert.equal(pedidos.length, 1);
  const contenido = pedidos[0].cuerpo.messages[0].content;
  assert.deepEqual(contenido.map((c) => c.type), ["image", "image", "image", "text"]);
  assert.match(contenido[3].text, /^Son 3 fotos de la MISMA guía/);
  assert.equal(pedidos[0].cuerpo.max_tokens, 8192);
});
