// Lectura de la guía y de la etiqueta (spec 005): los lectores puros, con textos
// inventados en el formato real (pruebas/fixtures/lectura/, sin datos de nadie).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { leerCodigoEtiqueta } = await import("@/lib/encomiendas/lectura/codigo-barras");
const { leerGuia, limpiarDestino } = await import("@/lib/encomiendas/lectura/guia");

const fixture = (n) => readFileSync(new URL(`./fixtures/lectura/${n}`, import.meta.url), "utf8");

// ----------------------------------------------------------- código de barras

test("el código de 26 dígitos trae la OF en 15–23 y el bulto al final", () => {
  assert.deepEqual(leerCodigoEtiqueta("92000022560000200000002001"), { of: "200000002", bulto: 1 });
  assert.deepEqual(leerCodigoEtiqueta("92100022561234200000002002"), { of: "200000002", bulto: 2 }, "prefijo EXPRES");
});

test("la OF escrita a mano (9 dígitos) también sirve, sin bulto", () => {
  assert.deepEqual(leerCodigoEtiqueta("200 000 002"), { of: "200000002", bulto: null });
  // OF corta (terreno 2026-10-27): el código la trae con ceros, la guía sin ellos.
  assert.deepEqual(leerCodigoEtiqueta("92000022560000007000123001"), { of: "7000123", bulto: 1 }, "OF de 7 dígitos");
  assert.deepEqual(leerCodigoEtiqueta("7000123"), { of: "7000123", bulto: null }, "OF corta a mano");
});

test("de los códigos que ve la cámara, solo el de Starken da la OF (spec 028)", async () => {
  const { codigoEnLaFoto } = await import("@/lib/encomiendas/lectura/codigo-barras");
  assert.deepEqual(codigoEnLaFoto(["https://ejemplo.cl/qr", "7801234567890", "92000022560000200000002001"]), {
    of: "200000002",
    bulto: 1,
  });
  assert.equal(codigoEnLaFoto(["200000002", "7801234567890"]), null, "un número suelto no es una OF de la cámara");
  assert.equal(codigoEnLaFoto([]), null);
});

test("lo que no es un código de etiqueta no se enlaza", () => {
  assert.deepEqual(leerCodigoEtiqueta("1234567890"), { of: "1234567890", bulto: null }, "sin regla de largo");
  assert.deepEqual(leerCodigoEtiqueta("12000022560000200000002001").bulto, null, "sin el prefijo 92 no es etiqueta");
  assert.equal(leerCodigoEtiqueta("sin números"), null);
  assert.equal(leerCodigoEtiqueta(""), null);
});

// ---------------------------------------------------------------------- guía

test("la guía se lee línea por línea, con destinos limpios", () => {
  const guia = leerGuia(fixture("guia.txt"));
  assert.equal(guia.folio, "1000001");
  assert.equal(guia.totalDeclarado, 8);
  assert.deepEqual(
    guia.lineas.map((l) => [l.of, l.destino, l.dudosa]),
    [
      ["200000001", "AVENIDA SANTA MARIA 1234 EDIFICIO 02", false],
      ["200000002", "PASAJE LOS PINOS 56", false],
      ["200000003", "MARACAIBO 1472", false],
      ["200000004", "CALLE UNO 100", false],
      ["200000005", "SAN MARCOS 1085 B", false],
      ["200000006", "", true],
    ],
  );
});

test("el número de casa repetido en la guía queda una vez", () => {
  const g = leerGuia("OF:200000010 DESTINO:MARACAIBO 1472 1472 OF:200000011 DESTINO:CALLE UNO 100, 100 OF:200000012 DESTINO:CALLE UNO 10 100");
  assert.deepEqual(
    g.lineas.map((l) => l.destino),
    ["MARACAIBO 1472", "CALLE UNO 100", "CALLE UNO 10 100"],
    "dos números distintos no se tocan",
  );
});

test("la guía avisa repetidas, dudosas y la diferencia con el total", () => {
  const { avisos } = leerGuia(fixture("guia.txt"));
  assert.ok(avisos.some((a) => /repetida/.test(a)), "repetida por fotos superpuestas");
  assert.ok(avisos.some((a) => /sin OF o sin destino/.test(a)), "línea sin destino");
  assert.ok(avisos.some((a) => /dice 8 y se leyeron 6/.test(a)), "faltan 2");
});

test("una OF de otro largo vale igual: sin marca de error y sin ceros a la izquierda", () => {
  const g = leerGuia("OF:7000123 DESTINO:CALLE CORTA 5 OF:007000124 DESTINO:CALLE LARGA 6 OF:2000000066 DESTINO:CALLE OTRA 7");
  assert.deepEqual(
    g.lineas.map((l) => [l.of, l.dudosa]),
    [
      ["7000123", false],
      ["7000124", false],
      ["2000000066", false],
    ],
  );
});

test("un texto sin líneas de guía lo dice", () => {
  const g = leerGuia("hola, esto no es una guía");
  assert.deepEqual(g.lineas, []);
  assert.ok(g.avisos.some((a) => /ninguna línea/.test(a)));
});

test("la basura del destino se va", () => {
  assert.equal(limpiarDestino("MARACAIBO&amp;amp;1472 ."), "MARACAIBO 1472");
  assert.equal(limpiarDestino("CHILE, BRAULIO MUNOS 649 NO. 649, XV REGION DE ARICA Y"), "BRAULIO MUNOS 649");
  assert.equal(limpiarDestino("LUIS FERRADA 1368 ,"), "LUIS FERRADA 1368");
  assert.equal(limpiarDestino("PASAJE 1 NORTE #173 VILLA ALTOS MAR ."), "PASAJE 1 NORTE #173 VILLA ALTOS MAR");
  assert.equal(limpiarDestino("CALLE 5 NO. 12"), "CALLE 5 NO. 12", "un número distinto no se toca");
});

// La etiqueta tiene su archivo: pruebas/lectura-etiqueta.test.mjs (spec 021).

test("la O de 'OF' leída como cero no pierde las líneas de la guía", () => {
  // Así lo leyó ML Kit en el teléfono (2026-10-24, guía inventada).
  const g = leerGuia("0F:200000001 DESTINO: CALLE UNO 100\nOF:200000002 DESTINO : CALLE DOS 200\nMONTO NETO: 2");
  assert.deepEqual(g.lineas.map((l) => l.of), ["200000001", "200000002"]);
});

test("si el teléfono ve una OF que la IA no trajo, la guía se relee", async () => {
  const { faltanEnLaPrimera } = await import("@/lib/encomiendas/lectura/guia");
  const ia = leerGuia("OF:200000001 DESTINO: CALLE UNO 100\nOF:200000002 DESTINO: CALLE DOS 200");
  const igual = leerGuia("OF:200000002 DESTINO: CALLE DOS 200");
  const conOtra = leerGuia("OF:200000001 DESTINO: CALLE UNO 100\nOF:200000003 DESTINO: CALLE TRES 300");
  const malLeida = leerGuia("OF:20000 DESTINO: CALLE TRES 300");
  assert.equal(faltanEnLaPrimera(ia, igual), false);
  assert.equal(faltanEnLaPrimera(ia, conOtra), true);
  assert.equal(faltanEnLaPrimera(ia, malLeida), false, "una OF corta vista solo por el teléfono no obliga a releer");
});
