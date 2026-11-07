// La foto de la etiqueta no sale del teléfono (spec 021, SC-001). El dueño: "no
// quiero que se envíen fotos a anthropic por temas legales de privacidad"
// (2026-11-07).
//
// Corre el `leerFotoEtiqueta` REAL dentro de una APK simulada: el puente de
// Capacitor contesta como ML Kit y el `fetch` global anota todo lo que intente
// salir. Lo que se afirma es que se leen el nombre, el teléfono y el pago, y
// que no hubo ni una consulta de red (ni /api/lectura ni /api/texto). Datos
// inventados (pruebas/fixtures/lectura/).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const TEXTO_ML_KIT = readFileSync(new URL("./fixtures/lectura/etiqueta-por-pagar.txt", import.meta.url), "utf8");

// --- La APK simulada: Capacitor la reconoce por `androidBridge` al importarse.
const alPlugin = [];
let respuestaMlKit = { texto: TEXTO_ML_KIT };
globalThis.window = globalThis;
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders: [{ name: "Telefono", methods: [{ name: "leerTexto", rtype: "promise" }] }],
  nativePromise: async (plugin, metodo, opciones) => {
    alPlugin.push({ plugin, metodo, opciones });
    return respuestaMlKit;
  },
};

// --- Lo del navegador que usa la compresión de la foto (foto.ts).
globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
globalThis.document = {
  createElement: () => ({
    getContext: () => ({ drawImage() {} }),
    toBlob: (listo) => listo(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })),
  }),
};
globalThis.FileReader = class {
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
      this.onload?.();
    });
  }
};

// --- Todo lo que intente salir a la red queda anotado.
const salidas = [];
globalThis.fetch = async (url) => {
  salidas.push(String(url));
  throw new Error("la etiqueta no puede salir a la red");
};

const { leerFotoEtiqueta, ErrorLectura } = await import("@/lib/encomiendas/local/lectura-cliente");
const { esApp } = await import("@/lib/nativo/entorno");

const FOTO = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

test.beforeEach(() => {
  alPlugin.length = 0;
  salidas.length = 0;
  respuestaMlKit = { texto: TEXTO_ML_KIT };
});

test("la APK simulada se reconoce como APK", () => {
  assert.equal(esApp(), true);
});

test("la etiqueta se lee con ML Kit en el teléfono, sin ninguna consulta de red", async () => {
  const e = await leerFotoEtiqueta(FOTO);

  assert.deepEqual(salidas, [], "la foto o su texto salieron a la red");
  assert.equal(alPlugin.length, 1);
  assert.deepEqual([alPlugin[0].plugin, alPlugin[0].metodo], ["Telefono", "leerTexto"]);

  assert.equal(e.destinatario, "JUAN PEREZ SOTO");
  assert.equal(e.telefono, "+56912345678");
  assert.deepEqual([e.porPagar, e.montoPorPagar], [true, 12990]);
  assert.equal(e.ofImpresa, "200000002", "la OF impresa sirve para rechazar la foto de otra etiqueta");
});

test("si ML Kit no lee nada, se ofrece pegar el texto; la foto tampoco sale a la red", async () => {
  respuestaMlKit = { texto: "   " };
  await assert.rejects(
    () => leerFotoEtiqueta(FOTO),
    (e) => e instanceof ErrorLectura && e.estado === 422 && /pega el texto/.test(e.message),
  );
  assert.deepEqual(salidas, []);
});

test("si el lector del teléfono falla, no hay respaldo en la nube", async () => {
  globalThis.Capacitor.nativePromise = async () => {
    throw new Error("ML Kit no disponible");
  };
  await assert.rejects(() => leerFotoEtiqueta(FOTO), ErrorLectura);
  assert.deepEqual(salidas, [], "sin ML Kit, la foto no puede ir a Cloud Vision ni a la IA");
});
