// Las llamadas en altavoz (dueño, 2026-11-14): lo que el conductor elige en
// Menú → Accesibilidad llega al plugin `Telefono` con cada llamada, dentro de una
// APK simulada (el puente de Capacitor contesta como Android). Que el teléfono
// parta en altavoz se prueba con una llamada real.
import test from "node:test";
import assert from "node:assert/strict";

const llamadas = [];
globalThis.window = globalThis;
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders: [{ name: "Telefono", methods: [{ name: "llamar", rtype: "promise" }] }],
  nativePromise: async (plugin, metodo, opciones) => {
    llamadas.push({ plugin, metodo, opciones });
  },
};

const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => guardado.get(k) ?? null,
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
};

const { altavozAlLlamar, elegirAltavozAlLlamar, llamar } = await import("@/lib/nativo/telefono");

test("sin elegir nada, la llamada sale en altavoz", async () => {
  assert.equal(altavozAlLlamar(), true);
  assert.equal(await llamar("+56 9 1234 5678"), "directa");
  assert.deepEqual(llamadas.at(-1), { plugin: "Telefono", metodo: "llamar", opciones: { numero: "+56912345678", altavoz: true } });
});

test("desactivado en Accesibilidad, sale sin altavoz; activado de nuevo, con altavoz", async () => {
  elegirAltavozAlLlamar(false);
  assert.equal(altavozAlLlamar(), false);
  await llamar("+56912345678");
  assert.equal(llamadas.at(-1).opciones.altavoz, false);

  elegirAltavozAlLlamar(true);
  assert.equal(altavozAlLlamar(), true);
  await llamar("+56912345678");
  assert.equal(llamadas.at(-1).opciones.altavoz, true);
});

test("sin localStorage queda en altavoz y no se cae", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("bloqueado");
    },
    removeItem: () => {
      throw new Error("bloqueado");
    },
  };
  try {
    elegirAltavozAlLlamar(false);
    assert.equal(altavozAlLlamar(), true);
  } finally {
    globalThis.localStorage = original;
  }
});
