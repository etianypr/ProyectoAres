// Cuándo la app pide instalar una APK nueva (spec 015, US5).
import test from "node:test";
import assert from "node:assert/strict";

const { esMasVieja } = await import("@/lib/nativo/version");

test("una versión menor que la mínima es vieja", () => {
  assert.equal(esMasVieja("1.0.0", "1.0.1"), true);
  assert.equal(esMasVieja("1.9.9", "2.0.0"), true);
  assert.equal(esMasVieja("1.2", "1.2.1"), true, "parte faltante cuenta como 0");
});

test("igual o mayor no pide nada", () => {
  assert.equal(esMasVieja("1.0.0", "1.0.0"), false);
  assert.equal(esMasVieja("1.10.0", "1.9.0"), false, "se compara por número, no por texto");
  assert.equal(esMasVieja("2.0", "1.9.9"), false);
});

test("sin versión instalada o sin mínima, no hay aviso", () => {
  assert.equal(esMasVieja(null, "1.0.0"), false, "navegador");
  assert.equal(esMasVieja("1.0.0", undefined), false, "sin APK_VERSION_MINIMA");
  assert.equal(esMasVieja("1.0.0", ""), false);
});
