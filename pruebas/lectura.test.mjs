// Lectura de la guía y de la etiqueta (spec 005): los lectores puros, con textos
// inventados en el formato real (pruebas/fixtures/lectura/, sin datos de nadie).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { leerCodigoEtiqueta } = await import("@/lib/encomiendas/lectura/codigo-barras");
const { leerGuia, limpiarDestino } = await import("@/lib/encomiendas/lectura/guia");
const { etiquetaCompleta, leerEtiqueta, pagoDe } = await import("@/lib/encomiendas/lectura/etiqueta");

const fixture = (n) => readFileSync(new URL(`./fixtures/lectura/${n}`, import.meta.url), "utf8");

// ----------------------------------------------------------- código de barras

test("el código de 26 dígitos trae la OF en 15–23 y el bulto al final", () => {
  assert.deepEqual(leerCodigoEtiqueta("92000022560000200000002001"), { of: "200000002", bulto: 1 });
  assert.deepEqual(leerCodigoEtiqueta("92100022561234200000002002"), { of: "200000002", bulto: 2 }, "prefijo EXPRES");
});

test("la OF escrita a mano (9 dígitos) también sirve, sin bulto", () => {
  assert.deepEqual(leerCodigoEtiqueta("200 000 002"), { of: "200000002", bulto: null });
});

test("lo que no es un código de etiqueta no se enlaza", () => {
  assert.equal(leerCodigoEtiqueta("1234567890"), null, "largo cualquiera");
  assert.equal(leerCodigoEtiqueta("1200002256000020000000200"), null, "25 dígitos");
  assert.equal(leerCodigoEtiqueta("12000022560000200000002001"), null, "sin el prefijo 92");
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
      ["20000006", "CALLE CORTA 5", true],
    ],
  );
});

test("la guía avisa repetidas, dudosas y la diferencia con el total", () => {
  const { avisos } = leerGuia(fixture("guia.txt"));
  assert.ok(avisos.some((a) => /repetida/.test(a)), "repetida por fotos superpuestas");
  assert.ok(avisos.some((a) => /se leyó mal/.test(a)), "OF de 8 dígitos");
  assert.ok(avisos.some((a) => /dice 8 y se leyeron 6/.test(a)), "faltan 2");
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

// ------------------------------------------------------------------ etiqueta

test("etiqueta POR PAGAR: destinatario, teléfono +569, monto y bultos", () => {
  const e = leerEtiqueta(fixture("etiqueta-por-pagar.txt"));
  assert.deepEqual(
    {
      ofImpresa: e.ofImpresa,
      destinatario: e.destinatario,
      telefono: e.telefono,
      direccion: e.direccion,
      porPagar: e.porPagar,
      montoPorPagar: e.montoPorPagar,
      bulto: e.bulto,
      bultosTotal: e.bultosTotal,
    },
    {
      ofImpresa: "200000002",
      destinatario: "JUAN PEREZ SOTO",
      telefono: "+56912345678",
      direccion: "PASAJE LOS PINOS 56, ARICA",
      porPagar: true,
      montoPorPagar: 12990,
      bulto: 1,
      bultosTotal: 2,
    },
  );
  assert.deepEqual(e.dudosos, []);
});

test("etiqueta CONTADO queda pagada aunque traiga monto", () => {
  const e = leerEtiqueta(fixture("etiqueta-contado.txt"));
  assert.equal(e.porPagar, false);
  assert.equal(e.montoPorPagar, null, "no hay nada que cobrar");
  assert.equal(e.telefono, "+56987654321");
});

test("Lion × Starken con cuenta corriente queda pagada", () => {
  const e = leerEtiqueta(fixture("etiqueta-lion.txt"));
  assert.equal(e.porPagar, false);
  assert.equal(e.telefono, "+56987654321");
  assert.equal(e.destinatario, "PEDRO ROJAS");
});

test("POR PAGAR sin monto queda por revisar, nunca en 0", () => {
  const e = leerEtiqueta("DESTINATARIO: ANA\nTel. 912345678\nDIRECCIÓN: CALLE 1\nPOR PAGAR\nBulto N° 001/001");
  assert.equal(e.porPagar, true);
  assert.equal(e.montoPorPagar, null);
  assert.ok(e.dudosos.includes("montoPorPagar"));
});

test("sin palabra de pago, el pago queda por revisar", () => {
  assert.equal(pagoDe("DESTINATARIO: ANA"), "DESCONOCIDO");
  const e = leerEtiqueta("DESTINATARIO: ANA");
  assert.equal(e.porPagar, null);
  assert.ok(e.dudosos.includes("pago"));
  assert.ok(e.dudosos.includes("telefono"));
});

test("no se extrae nada que no haga falta para repartir", () => {
  const e = leerEtiqueta(fixture("etiqueta-por-pagar.txt"));
  const texto = JSON.stringify(e);
  for (const sobra of ["11.111.111-1", "TIENDA DE PRUEBA", "tienda@ejemplo.cl"]) {
    assert.equal(texto.includes(sobra), false, sobra);
  }
});

// El teléfono lee el texto de la foto (ML Kit) y solo si no alcanza se paga la IA.
test("con nombre, teléfono y pago la etiqueta está completa: no hace falta la IA", () => {
  assert.equal(etiquetaCompleta(leerEtiqueta(fixture("etiqueta-por-pagar.txt"))), true);
  assert.equal(etiquetaCompleta(leerEtiqueta(fixture("etiqueta-contado.txt"))), true);
});

test("sin teléfono, sin pago o POR PAGAR sin monto, la etiqueta no está completa", () => {
  assert.equal(etiquetaCompleta(leerEtiqueta("DESTINATARIO: ANA\nDIRECCIÓN: CALLE 1\nCONTADO")), false);
  assert.equal(etiquetaCompleta(leerEtiqueta("DESTINATARIO: ANA\nTel. 912345678")), false);
  assert.equal(etiquetaCompleta(leerEtiqueta("DESTINATARIO: ANA\nTel. 912345678\nPOR PAGAR")), false);
});

test("el texto leído en el teléfono, con cada valor en el renglón siguiente, también sirve", () => {
  // ML Kit separa en bloques: la palabra clave y su valor pueden quedar en
  // renglones distintos.
  const e = leerEtiqueta("DESTINATARIO:\nJUAN PEREZ SOTO\nTel.\n9 1234 5678\nPOR PAGAR\nTotal Monto O.F. $\n12.990");
  assert.equal(e.destinatario, "JUAN PEREZ SOTO");
  assert.equal(e.telefono, "+56912345678");
  assert.equal(e.montoPorPagar, 12990);
  assert.equal(etiquetaCompleta(e), true);
});

test("la O de 'O.F.' leída como cero no pierde la OF ni el monto", () => {
  // Así lo leyó ML Kit en el teléfono (2026-10-24, etiqueta inventada).
  const e = leerEtiqueta("DESTINATARIO: JUAN PEREZ SOTO\nTel. 9 1234 5678\nPOR PAGAR\n0.F. 200000002\nTotal Monto 0.F. $ 12.990");
  assert.equal(e.ofImpresa, "200000002");
  assert.equal(e.montoPorPagar, 12990);
  assert.equal(etiquetaCompleta(e), true);
  const g = leerGuia("0F:200000001 DESTINO: CALLE UNO 100\nOF:200000002 DESTINO : CALLE DOS 200\nMONTO NETO: 2");
  assert.deepEqual(g.lineas.map((l) => l.of), ["200000001", "200000002"]);
});
