// Una APK anterior a la 1.6.0 no trae el plugin `EscanerVivo` (spec 028): el
// escáner en vivo no se ofrece y queda el escaneo de siempre. Va en su propio
// archivo porque Capacitor decide qué plugins hay una sola vez, al cargar.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
globalThis.androidBridge = {};
globalThis.Capacitor = { PluginHeaders: [{ name: "Telefono", methods: [] }] };

// Nada elegido en Diagnóstico: aun así, sin el plugin no hay cámara en vivo.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { escanerVivoDisponible, usarEscanerVivo } = await import("@/lib/nativo/escaner-vivo");

test("con una APK sin el plugin, el escáner en vivo no se ofrece", () => {
  assert.equal(escanerVivoDisponible(), false);
  assert.equal(usarEscanerVivo(), false);
});
