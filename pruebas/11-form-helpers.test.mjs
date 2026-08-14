// Cómo se leen los números que escribe la gente. Es el punto donde un formato
// mal interpretado se convierte en plata equivocada guardada en la base, sin
// ningún error a la vista.
import test from "node:test";
import assert from "node:assert/strict";
import { s, sReq, num, numNull, intNull, bool } from "@/lib/form-helpers";

test("num entiende el formato chileno de miles", () => {
  assert.equal(num("1.234.567"), 1234567);
  assert.equal(num("1.234"), 1234);
  assert.equal(num("950"), 950);
  assert.equal(num("$ 1.234.567"), 1234567, "tolera el signo pesos");
  assert.equal(num("1.234.567 CLP"), 1234567);
});

test("num entiende la coma decimal", () => {
  assert.equal(num("1.234,56"), 1234.56);
  assert.equal(num("0,5"), 0.5);
});

test("⚠ num TRATA EL PUNTO COMO SEPARADOR DE MILES, nunca como decimal", () => {
  // Esto no es un bug, es la decisión de formato — pero hay que tenerlo fijado
  // porque es la trampa que motivó el parser aparte para los porcentajes:
  // un <input type="number" step="0.1"> manda "7.5", y acá eso vale 75.
  assert.equal(num("7.5"), 75);
  assert.equal(num("0.5"), 5);
  // Por eso guardarReglaPago NO usa num() para el porcentaje. Si alguien lo
  // cambia, esta prueba deja de tener sentido y hay que revisar aquel código.
});

test("num nunca devuelve NaN: lo que no se entiende vale 0", () => {
  for (const entrada of ["", "   ", "abc", "$", "-", null, undefined, "1.2.3.4.5"]) {
    const r = num(entrada);
    assert.ok(Number.isFinite(r), `${JSON.stringify(entrada)} dio ${r}`);
  }
  assert.equal(num("abc"), 0);
  assert.equal(num(""), 0);
});

test("num conserva el signo negativo", () => {
  assert.equal(num("-500"), -500);
  assert.equal(num("-1.500"), -1500);
});

test("numNull distingue 'vacío' de 'cero'", () => {
  // Es la diferencia entre "no lo cargué" y "no gastó nada", y en una columna
  // opcional eso cambia lo que se muestra.
  assert.equal(numNull(""), null);
  assert.equal(numNull("   "), null);
  assert.equal(numNull(null), null);
  assert.equal(numNull("0"), 0);
  assert.equal(numNull("1.500"), 1500);
});

test("intNull redondea y respeta el vacío", () => {
  assert.equal(intNull(""), null);
  assert.equal(intNull("0"), 0, "cero NO es vacío");
  assert.equal(intNull("1.500"), 1500);
  assert.equal(intNull("1,4"), 1);
  assert.equal(intNull("1,6"), 2);
  assert.equal(intNull("-1,6"), -2);
  assert.ok(Number.isInteger(intNull("1,5")));
});

test("s recorta y convierte el vacío en null; sReq siempre devuelve texto", () => {
  assert.equal(s("  hola  "), "hola");
  assert.equal(s(""), null);
  assert.equal(s("   "), null);
  assert.equal(s(null), null);

  assert.equal(sReq("  hola  "), "hola");
  assert.equal(sReq(""), "");
  assert.equal(sReq(null), "", "nunca null: el llamador valida el string vacío");
});

test("bool solo acepta las formas que manda un formulario", () => {
  for (const si of ["on", "true", "1"]) assert.equal(bool(si), true, si);
  for (const no of ["", "off", "false", "0", null, undefined, "sí"]) {
    assert.equal(bool(no), false, JSON.stringify(no));
  }
});

test("una checkbox sin marcar no manda nada, y eso es false", () => {
  // El navegador omite el campo cuando está desmarcada: llega null.
  assert.equal(bool(null), false);
});
