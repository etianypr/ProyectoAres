// La regla que decide si el cliente contestó (spec 015, FR-005). Protege dos
// cosas: que una llamada corta o rechazada no quede como "contestó" (el conductor
// iría a una casa donde nadie lo espera) y que ante la duda se pregunte en vez de
// inventar un resultado.
import test from "node:test";
import assert from "node:assert/strict";

const { resultadoDeLlamada, SEGUNDOS_CONTESTO } = await import("@/lib/nativo/llamada");

const TOQUE = Date.parse("2026-10-24T15:00:00.000Z");
const saliente = (duracionS, despuesMs = 1000) => ({ duracionS, tipo: "saliente", fechaMs: TOQUE + despuesMs });

test("con conversación de 5 s o más, contestó", () => {
  assert.equal(resultadoDeLlamada([saliente(SEGUNDOS_CONTESTO)], TOQUE), "contesto");
  assert.equal(resultadoDeLlamada([saliente(42)], TOQUE), "contesto");
});

test("sin conversación o muy corta, no contestó", () => {
  assert.equal(resultadoDeLlamada([saliente(0)], TOQUE), "no_contesto");
  assert.equal(resultadoDeLlamada([saliente(4)], TOQUE), "no_contesto");
});

test("sin datos del registro no se inventa nada: null y se pregunta", () => {
  assert.equal(resultadoDeLlamada(null, TOQUE), null, "sin APK o sin permiso");
  assert.equal(resultadoDeLlamada([], TOQUE), null, "Android todavía no escribió la llamada");
});

test("solo cuentan las salientes hechas después del toque", () => {
  assert.equal(resultadoDeLlamada([{ duracionS: 30, tipo: "entrante", fechaMs: TOQUE + 5000 }], TOQUE), null);
  assert.equal(resultadoDeLlamada([{ duracionS: 0, tipo: "perdida", fechaMs: TOQUE + 5000 }], TOQUE), null);
  assert.equal(resultadoDeLlamada([saliente(60, -60_000)], TOQUE), null, "una llamada de antes del toque");
});

test("acepta que el registro anote el inicio un instante antes del toque", () => {
  assert.equal(resultadoDeLlamada([saliente(20, -1500)], TOQUE), "contesto");
});

test("de varias llamadas, manda la más reciente", () => {
  assert.equal(resultadoDeLlamada([saliente(30, 1000), saliente(0, 40_000)], TOQUE), "no_contesto");
  assert.equal(resultadoDeLlamada([saliente(0, 40_000), saliente(30, 90_000)], TOQUE), "contesto");
});
