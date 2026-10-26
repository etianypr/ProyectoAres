// Spec 005: el texto de una foto con Google Cloud Vision (servidor), contra un
// doble del fetch. La clave no sale del servidor y la foto no se registra.
import test from "node:test";
import assert from "node:assert/strict";

const { textoConVision, visionDisponible, VisionNoRespondio } = await import("@/lib/encomiendas/lectura/vision");

const fetchOriginal = globalThis.fetch;
let pedidos = [];
function responder(cuerpo, estado = 200) {
  pedidos = [];
  globalThis.fetch = async (url, init) => {
    pedidos.push({ url: String(url), cuerpo: JSON.parse(init.body) });
    return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
  };
}
test.after(() => {
  globalThis.fetch = fetchOriginal;
});
test.beforeEach(() => {
  delete process.env.GOOGLE_VISION_KEY;
  delete process.env.GOOGLE_MAPS_KEY;
});

const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test("sin clave, Cloud Vision está apagado", async () => {
  assert.equal(visionDisponible(), false);
  await assert.rejects(textoConVision(FOTO), VisionNoRespondio);
});

test("pide el texto del documento con la clave de Vision o la de Google Maps", async () => {
  process.env.GOOGLE_MAPS_KEY = "clave-maps";
  responder({ responses: [{ fullTextAnnotation: { text: "DESTINATARIO: JUAN PEREZ\nTel. 912345678" } }] });
  assert.equal(visionDisponible(), true);
  assert.equal(await textoConVision(FOTO), "DESTINATARIO: JUAN PEREZ\nTel. 912345678");
  const { url, cuerpo } = pedidos[0];
  assert.ok(url.startsWith("https://vision.googleapis.com/v1/images:annotate?key=clave-maps"));
  assert.equal(cuerpo.requests[0].features[0].type, "DOCUMENT_TEXT_DETECTION");
  assert.equal(cuerpo.requests[0].image.content, Buffer.from(FOTO).toString("base64"));

  process.env.GOOGLE_VISION_KEY = "clave-vision";
  responder({ responses: [{}] });
  assert.equal(await textoConVision(FOTO), "", "foto sin texto");
  assert.ok(pedidos[0].url.includes("key=clave-vision"));
});

test("un error de Google (clave, API apagada) se informa y no devuelve texto", async () => {
  process.env.GOOGLE_VISION_KEY = "clave";
  responder({ error: { message: "API not enabled" } }, 403);
  await assert.rejects(textoConVision(FOTO), VisionNoRespondio);
  responder({ responses: [{ error: { message: "Bad image" } }] });
  await assert.rejects(textoConVision(FOTO), VisionNoRespondio);
});
