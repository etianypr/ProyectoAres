// El lector de etiquetas de Starken (spec 021, US2): el texto que ML Kit lee en el
// teléfono → los datos del pedido, sin IA. Un caso por formato conocido y los
// errores que se vieron en terreno. Datos inventados (pruebas/fixtures/lectura/):
// calles reales con número, nombre y teléfono inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { etiquetaCompleta, formatoEtiqueta, leerEtiqueta, pagoDe } = await import("@/lib/encomiendas/lectura/etiqueta");

const fixture = (n) => readFileSync(new URL(`./fixtures/lectura/${n}`, import.meta.url), "utf8");

// ------------------------------------------------------------------ formatos

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
  assert.equal(formatoEtiqueta(fixture("etiqueta-por-pagar.txt")), "expres");
});

test("etiqueta CONTADO queda pagada aunque traiga monto", () => {
  const e = leerEtiqueta(fixture("etiqueta-contado.txt"));
  assert.equal(e.porPagar, false);
  assert.equal(e.montoPorPagar, null, "no hay nada que cobrar");
  assert.equal(e.telefono, "+56987654321");
  assert.equal(formatoEtiqueta(fixture("etiqueta-contado.txt")), "starken");
});

test("Lion × Starken con cuenta corriente queda pagada", () => {
  const e = leerEtiqueta(fixture("etiqueta-lion.txt"));
  assert.equal(e.porPagar, false);
  assert.equal(e.telefono, "+56987654321");
  assert.equal(e.destinatario, "PEDRO ROJAS");
  assert.equal(formatoEtiqueta(fixture("etiqueta-lion.txt")), "lion");
});

// La etiqueta Lion como la parte ML Kit (terreno 2026-11-07): el nombre y la
// dirección en varios renglones, partidos con guion; el teléfono del remitente
// arriba; la palabra OF sola, sobre el código de barras.
test("Lion en varios renglones: el teléfono sin el 0 del renglón de abajo", () => {
  const e = leerEtiqueta(fixture("etiqueta-lion-renglones.txt"));
  assert.equal(e.telefono, "+56987654321", "el lector de antes leía «987654321 0» (el 0 de «0.33 Kg»)");
  assert.equal(e.dudosos.includes("telefono"), false);
});

test("Lion en varios renglones: el nombre partido con guion se junta", () => {
  const e = leerEtiqueta(fixture("etiqueta-lion-renglones.txt"));
  assert.equal(e.destinatario, "CAMILA ROJAS");
});

test("Lion en varios renglones: la dirección de tres renglones se junta", () => {
  const e = leerEtiqueta(fixture("etiqueta-lion-renglones.txt"));
  assert.equal(e.direccion, "PASAJE 7 1234 LOS NARANJOS CASA . ARICA-ARICA");
});

test("Lion en varios renglones: la OF impresa sale de los dígitos 15–23 del código impreso", () => {
  // El lector de antes tomaba «9200002256032» (la palabra OF y los primeros
  // dígitos del código), y la foto se rechazaba como de otro paquete. El dueño:
  // «el OF se saca leyendo el código» (2026-11-08).
  const e = leerEtiqueta(fixture("etiqueta-lion-renglones.txt"));
  assert.equal(e.ofImpresa, "200000123");
  assert.equal(e.porPagar, false, "CTA CTE: no se cobra");
  assert.deepEqual([e.bulto, e.bultosTotal], [1, 1]);
  assert.equal(etiquetaCompleta(e), true);
});

test("Lion: el teléfono también se encuentra si ML Kit lo pone antes del destinatario", () => {
  const texto = fixture("etiqueta-lion-renglones.txt").replace("Tel: 987654321\n", "").replace("DIRECCIÓN:", "Tel: 987654321\nDIRECCIÓN:");
  assert.equal(leerEtiqueta(texto).telefono, "+56987654321");
});

test("Lion: «DESTINATARIO» mal leído igual abre la zona; «Agencia destino» no", () => {
  // En la etiqueta real la palabra está gastada y ML Kit no la leyó entera
  // (terreno 2026-11-08): la dirección y el teléfono salieron, el nombre no.
  for (const mal of ["DESTINATAHIO", "DESTINATARO", "DESTINATAR|O", "0ESTINATARIO"]) {
    const texto = fixture("etiqueta-lion-renglones.txt").replace("DESTINATARIO:", `${mal}:`);
    assert.equal(leerEtiqueta(texto).destinatario, "CAMILA ROJAS", mal);
  }
  const e = leerEtiqueta("Agencia destino\nHUB ARICA\nTel: 912345678\nCONTADO");
  assert.equal(e.destinatario, null, "«destino» no es el destinatario");
});

test("lo que sobra de «DESTINATARIO» mal leído no queda pegado al nombre", () => {
  assert.equal(leerEtiqueta("DESTINATAR?O ANA ROJAS\nCONTADO").destinatario, "ANA ROJAS");
});

test("el bulto con dos puntos en vez de barra («001:001») también vale", () => {
  assert.deepEqual([leerEtiqueta("Bulto N° 001:001").bulto, leerEtiqueta("Bulto N° 001:001").bultosTotal], [1, 1]);
  assert.deepEqual([leerEtiqueta("Bulto Nº 002 / 003").bulto, leerEtiqueta("Bulto Nº 002 / 003").bultosTotal], [2, 3]);
});

test("la OF de «O.F.» manda sobre la del código impreso", () => {
  const e = leerEtiqueta("O.F. 200000002\n92000022560328200000123001\nDESTINATARIO: ANA");
  assert.equal(e.ofImpresa, "200000002");
});

// La Starken NORMAL tal como la leyó ML Kit en el V2430 (terreno 2026-11-08),
// pasada por «Copiar anonimizado»; la OF y el código se cambiaron por unos
// inventados. Los renglones vienen mezclados: «DIRECCIÓN» sola y su valor muy
// abajo, «001/001» suelto, el remitente con su propia dirección y teléfono.
test("Starken normal real: OF, teléfono del destinatario, CONTADO y bulto suelto", () => {
  const texto = fixture("etiqueta-starken-normal.txt");
  const e = leerEtiqueta(texto);
  assert.equal(formatoEtiqueta(texto), "starken");
  assert.equal(e.ofImpresa, "200000456");
  assert.equal(e.telefono, "+56987654321");
  assert.equal(e.porPagar, false, "CONTADO; la casilla «CTA CTE» vacía no lo deja en duda");
  assert.deepEqual([e.bulto, e.bultosTotal], [1, 1], "«001/001» suelto es el bulto 1 de 1");
});

test("Starken normal real: con «DIRECCIÓN» sola no se adivina la dirección (ni «HUB ARICA»)", () => {
  // El valor quedó varios renglones más abajo: se deja sin leer y no se compara
  // con la guía, así no hay falsa alarma (el dueño: bien antes que rápido).
  const e = leerEtiqueta(fixture("etiqueta-starken-normal.txt"));
  assert.equal(e.direccion, null);
  assert.ok(e.dudosos.includes("direccion"));
});

test("Starken normal real: el nombre que ML Kit leyó con un dígito queda por revisar", () => {
  // la «I» antes del nombre salió «1»: no se corrige un valor, se marca.
  const e = leerEtiqueta(fixture("etiqueta-starken-normal.txt"));
  assert.match(e.destinatario ?? "", /HAQATUJEBUZOF DE ARICA$/);
  assert.ok(e.dudosos.includes("destinatario"));
});

// La Starken EXPRES real (terreno 2026-11-08, «Copiar anonimizado»; la OF, el
// código y los números al azar, cambiados por inventados): sin POR PAGAR ni
// CONTADO, con «Totai Monto oF» (así lo leyó ML Kit) y «$0» abajo.
test("EXPRES real: «$0» impreso sin POR PAGAR es «no se cobra» (el dueño, 2026-11-08)", () => {
  const texto = fixture("etiqueta-expres.txt");
  const e = leerEtiqueta(texto);
  assert.equal(formatoEtiqueta(texto), "expres");
  assert.equal(e.porPagar, false);
  assert.equal(e.montoPorPagar, null);
  assert.equal(e.dudosos.includes("pago"), false);
  assert.equal(e.telefono, "+56912345678");
  assert.equal(e.ofImpresa, "200000789");
  assert.deepEqual([e.bulto, e.bultosTotal], [1, 1]);
  assert.equal(e.direccion, "LA JJIZIOMAHI 8574 8379 ARICA ARICA");
  assert.equal(etiquetaCompleta(e), true);
});

test("«$0» impreso: sin POR PAGAR no se cobra; con POR PAGAR, monto por revisar", () => {
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nTotal Monto O.F. $0").porPagar, false);
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nTotal Monto O.F.\n$ 0").porPagar, false);
  const contradice = leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR\nTotal Monto O.F. $0");
  assert.equal(contradice.porPagar, true);
  assert.ok(contradice.dudosos.includes("montoPorPagar"), "nunca se supone $0 con POR PAGAR");
  const vacio = leerEtiqueta("DESTINATARIO: ANA\nTotal Monto O.F. $");
  assert.equal(vacio.porPagar, null, "sin número impreso no se supone nada");
});

// La Lion real (terreno 2026-11-08, «Copiar anonimizado»; la OF, el código y la
// cuenta corriente, cambiados por inventados). En esta foto ML Kit no leyó ni
// «LION» ni «DESTINATARIO», y el bulto salió ilegible: lo que no se lee no se
// inventa (el bulto lo da el código al escanear). Es el caso que la 028 quiere
// mejorar con varios cuadros y posiciones.
test("Lion real: OF, teléfono, «no se cobra» y la dirección de tres renglones; el nombre sin leer", () => {
  const texto = fixture("etiqueta-lion-real.txt");
  const e = leerEtiqueta(texto);
  assert.equal(e.ofImpresa, "200000123");
  assert.equal(e.telefono, "+56912345678");
  assert.equal(e.porPagar, false, "CTA CTE con su número");
  assert.equal(e.direccion, "PASAJE 8252 DOQBI XAWSI G+ UWO ARICA-ARICA");
  assert.equal(e.destinatario, null);
  assert.ok(e.dudosos.includes("destinatario"));
  assert.equal(e.bulto, null, "«Bulto N Z97855» no se adivina");
});

test("el remitente con su propia dirección y teléfono: nunca se toman", () => {
  const e = leerEtiqueta(
    "REMITENTE : TIENDA DE PRUEBA SPA\nDIRECCIÓN : CALLE UNO 100 - LOS ANGELES\nTELÉFONO : 988887777\nCTA. CTE.\nR.U.T.\n92000022561234200000456001\nDIRECCIÓN : AV DIEGO PORTALES 1111-ARICA-ARICA\nDESTINATARIO : ANA ROJAS\nCONTADO",
  );
  assert.equal(e.telefono, null, "el único teléfono es el del remitente");
  assert.equal(e.direccion, "AV DIEGO PORTALES 1111-ARICA-ARICA");
  assert.equal(e.porPagar, false);
});

test("«DOMICILIO» en medio del renglón es el tipo de entrega, no una dirección", () => {
  const e = leerEtiqueta("DESTINATARIO : ANA\nR15 ARICA DOMICILIO\n0002 HUB ARICA\nCONTADO");
  assert.equal(e.direccion, null);
});

test("«BULTO N°» sola y el número en el renglón de abajo", () => {
  const e = leerEtiqueta("BULTO N°\n002/003\nDESTINATARIO: ANA");
  assert.deepEqual([e.bulto, e.bultosTotal], [2, 3]);
  assert.equal(leerEtiqueta("Fecha 14/10/2026\nDESTINATARIO: ANA").bulto, null, "una fecha no es un bulto");
});

test("«CTA CTE» con su número es el pago; vacía, no", () => {
  assert.equal(pagoDe("CTA CTE: 123456-7"), "CTA_CTE");
  assert.equal(pagoDe("CTA CTE:\n123456-7"), "CTA_CTE");
  assert.equal(pagoDe("CTA. CTE.\nR.U.T.\nCONTADO"), "CONTADO");
});

// ------------------------------------------------------------------ teléfono

test("el teléfono del remitente nunca se toma, aunque vaya primero", () => {
  const e = leerEtiqueta(
    "REMITENTE: TIENDA DE PRUEBA SPA\nTel. 9 8888 7777\nR.U.T.: 11.111.111-1\nDESTINATARIO: ANA ROJAS\nTel. 9 1234 5678\nPOR PAGAR\nTotal Monto O.F. $ 5.000",
  );
  assert.equal(e.telefono, "+56912345678");
});

test("solo el teléfono del remitente: queda sin teléfono, nunca con el del remitente", () => {
  const e = leerEtiqueta("DESTINATARIO: ANA ROJAS\nCONTADO\nREMITENTE: TIENDA DE PRUEBA SPA\nTel. 9 8888 7777");
  assert.equal(e.telefono, null);
  assert.ok(e.dudosos.includes("telefono"));
});

test("un celular sin «Tel.» igual se encuentra en la zona del destinatario", () => {
  const e = leerEtiqueta("DESTINATARIO: ANA ROJAS\n+56 9 1234 5678\nCONTADO");
  assert.equal(e.telefono, "+56912345678");
});

test("dos teléfonos distintos del destinatario: el primero, y queda por revisar", () => {
  const e = leerEtiqueta("DESTINATARIO: ANA ROJAS\nTel. 9 1234 5678\nTel. 9 2222 3333\nCONTADO");
  assert.equal(e.telefono, "+56912345678");
  assert.ok(e.dudosos.includes("telefono"));
});

test("ni el código de barras, ni la OF, ni un RUT, ni un monto pasan por teléfono", () => {
  const e = leerEtiqueta(
    "DESTINATARIO: ANA ROJAS\n92000022569123912345678001\nO.F. 912345678\nR.U.T.: 99.999.999-9\nPOR PAGAR\nTotal Monto O.F. $ 912345678",
  );
  assert.equal(e.telefono, null);
});

test("ocho dígitos detrás de «Tel.»: se completa el 9 del celular", () => {
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nTel. 1234 5678").telefono, "+56912345678");
});

test("el fijo de Arica también vale", () => {
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nFono: 58 222 3344").telefono, "+56582223344");
});

// ------------------------------------------------------------------ errores del lector

test("los errores de ML Kit en las palabras clave no pierden el dato", () => {
  const e = leerEtiqueta("DESTlNATARIO: ANA ROJAS\nTe1. 9 1234 5678\nP0R PAGAR\nTotal Monto 0.F. $ 12.990\nBu1to N° 001/002");
  assert.equal(e.destinatario, "ANA ROJAS");
  assert.equal(e.telefono, "+56912345678");
  assert.equal(e.porPagar, true);
  assert.equal(e.montoPorPagar, 12990);
  assert.deepEqual([e.bulto, e.bultosTotal], [1, 2]);
});

test("la O de 'O.F.' leída como cero no pierde la OF ni el monto", () => {
  // Así lo leyó ML Kit en el teléfono (2026-10-24, etiqueta inventada).
  const e = leerEtiqueta("DESTINATARIO: JUAN PEREZ SOTO\nTel. 9 1234 5678\nPOR PAGAR\n0.F. 200000002\nTotal Monto 0.F. $ 12.990");
  assert.equal(e.ofImpresa, "200000002");
  assert.equal(e.montoPorPagar, 12990);
  assert.equal(etiquetaCompleta(e), true);
});

test("cada valor en el renglón siguiente a su palabra clave también sirve", () => {
  // ML Kit separa en bloques: la palabra clave y su valor pueden quedar en
  // renglones distintos.
  const e = leerEtiqueta("DESTINATARIO:\nJUAN PEREZ SOTO\nTel.\n9 1234 5678\nPOR PAGAR\nTotal Monto O.F. $\n12.990");
  assert.equal(e.destinatario, "JUAN PEREZ SOTO");
  assert.equal(e.telefono, "+56912345678");
  assert.equal(e.montoPorPagar, 12990);
  assert.equal(etiquetaCompleta(e), true);
});

// ------------------------------------------------------------------ pago

test("POR PAGAR sin monto queda por revisar, nunca en 0", () => {
  const e = leerEtiqueta("DESTINATARIO: ANA\nTel. 912345678\nDIRECCIÓN: CALLE 1\nPOR PAGAR\nTotal Monto O.F. $ 0\nBulto N° 001/001");
  assert.equal(e.porPagar, true);
  assert.equal(e.montoPorPagar, null);
  assert.ok(e.dudosos.includes("montoPorPagar"));
});

test("POR PAGAR sin «Total Monto»: vale el $ del mismo renglón o del siguiente", () => {
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR $ 7.500").montoPorPagar, 7500);
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR\n$ 7.500").montoPorPagar, 7500);
});

test("el monto con coma en los miles se lee entero, no hasta la coma", () => {
  // Terreno 2026-11-14: «$5,700» quedaba en $5 (la coma cortaba el número).
  const con = (monto) => leerEtiqueta(`DESTINATARIO: ANA\nPOR PAGAR\nTotal Monto O.F. ${monto}`).montoPorPagar;
  assert.equal(con("$5,700"), 5700);
  assert.equal(con("$ 5,700"), 5700);
  assert.equal(con("$ 12,990"), 12990);
  assert.equal(con("$ 1,234,567"), 1234567);
  assert.equal(con("$ 1.234,567"), 1234567, "ML Kit mezcla punto y coma");
  assert.equal(con("$ 5, 700"), 5700, "un espacio de más tras el separador");
  assert.equal(con("$\n5,700"), 5700, "en el renglón de abajo");
  assert.equal(con("$ 5700"), 5700);
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR $ 7,500").montoPorPagar, 7500);
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR\n$ 7,500").montoPorPagar, 7500);
});

test("un monto con el separador mal puesto no se adivina: queda por revisar", () => {
  for (const monto of ["$ 5,70", "$ 5.7000", "$ 5,7", "$ 12.99"]) {
    const e = leerEtiqueta(`DESTINATARIO: ANA\nPOR PAGAR\nTotal Monto O.F. ${monto}`);
    assert.equal(e.montoPorPagar, null, monto);
    assert.ok(e.dudosos.includes("montoPorPagar"), monto);
  }
});

test("sin palabra de pago, o con dos distintas, el pago queda por revisar", () => {
  assert.equal(pagoDe("DESTINATARIO: ANA"), "DESCONOCIDO");
  const e = leerEtiqueta("DESTINATARIO: ANA");
  assert.equal(e.porPagar, null);
  assert.ok(e.dudosos.includes("pago"));
  assert.ok(e.dudosos.includes("telefono"));
  assert.equal(pagoDe("POR PAGAR\nCTA CTE: 123456"), "DESCONOCIDO");
  assert.equal(leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR\nCTA CTE: 123456").porPagar, null);
});

// ------------------------------------------------------------------ datos mínimos

test("no se extrae nada que no haga falta para repartir", () => {
  const e = leerEtiqueta(fixture("etiqueta-por-pagar.txt"));
  const texto = JSON.stringify(e);
  for (const sobra of ["11.111.111-1", "TIENDA DE PRUEBA", "tienda@ejemplo.cl"]) {
    assert.equal(texto.includes(sobra), false, sobra);
  }
  assert.equal(JSON.stringify(leerEtiqueta(fixture("etiqueta-lion-renglones.txt"))).includes("TIENDA"), false);
});

test("con nombre, teléfono y pago la etiqueta está completa", () => {
  assert.equal(etiquetaCompleta(leerEtiqueta(fixture("etiqueta-por-pagar.txt"))), true);
  assert.equal(etiquetaCompleta(leerEtiqueta(fixture("etiqueta-contado.txt"))), true);
});

test("sin teléfono, sin pago o POR PAGAR sin monto, la etiqueta no está completa", () => {
  assert.equal(etiquetaCompleta(leerEtiqueta("DESTINATARIO: ANA\nDIRECCIÓN: CALLE 1\nCONTADO")), false);
  assert.equal(etiquetaCompleta(leerEtiqueta("DESTINATARIO: ANA\nTel. 912345678")), false);
  assert.equal(etiquetaCompleta(leerEtiqueta("DESTINATARIO: ANA\nTel. 912345678\nPOR PAGAR")), false);
});

test("un formato que no se conoce se lee igual", () => {
  const e = leerEtiqueta("ENVIO NACIONAL\nDESTINATARIO: ANA ROJAS\nTel: 912345678\nCONTADO");
  assert.equal(formatoEtiqueta("ENVIO NACIONAL"), "desconocido");
  assert.equal(e.telefono, "+56912345678");
  assert.equal(e.destinatario, "ANA ROJAS");
});

// ------------------------------------------------------------------ dos lecturas

const { combinarLecturas } = await import("@/lib/encomiendas/lectura/etiqueta/combinar");

test("dos lecturas iguales quedan firmes", () => {
  const e = leerEtiqueta(fixture("etiqueta-por-pagar.txt"));
  const { lectura, distintos } = combinarLecturas(e, e);
  assert.deepEqual(distintos, []);
  assert.deepEqual(lectura, e);
});

test("lo que vio solo una lectura se toma, sin quedar por revisar", () => {
  const conTodo = leerEtiqueta("DESTINATARIO: ANA ROJAS\nTel. 9 1234 5678\nCONTADO");
  const sinNombre = leerEtiqueta("DESTI NATARIO: ANA ROJAS\nTel. 9 1234 5678\nCONTADO");
  assert.equal(sinNombre.destinatario, null, "esta lectura no vio el nombre");
  const { lectura } = combinarLecturas(sinNombre, conTodo);
  assert.equal(lectura.destinatario, "ANA ROJAS");
  assert.equal(lectura.dudosos.includes("destinatario"), false);
});

test("dos teléfonos distintos entre las lecturas: el de la foto grande, y por revisar", () => {
  const alta = leerEtiqueta("DESTINATARIO: ANA\nTel. 9 1234 5678\nCONTADO");
  const baja = leerEtiqueta("DESTINATARIO: ANA\nTel. 9 1234 5679\nCONTADO");
  const { lectura, distintos } = combinarLecturas(alta, baja);
  assert.equal(lectura.telefono, "+56912345678");
  assert.ok(lectura.dudosos.includes("telefono"));
  assert.deepEqual(distintos, ["telefono"]);
});

test("el pago o el monto que se contradicen quedan sin leer: nunca se adivina la plata", () => {
  const porPagar = leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR\nTotal Monto O.F. $ 12.990");
  const otroMonto = leerEtiqueta("DESTINATARIO: ANA\nPOR PAGAR\nTotal Monto O.F. $ 12.890");
  const monto = combinarLecturas(porPagar, otroMonto).lectura;
  assert.deepEqual([monto.porPagar, monto.montoPorPagar], [true, null]);
  assert.ok(monto.dudosos.includes("montoPorPagar"));
  const contado = leerEtiqueta("DESTINATARIO: ANA\nCONTADO");
  const pago = combinarLecturas(porPagar, contado).lectura;
  assert.deepEqual([pago.porPagar, pago.montoPorPagar], [null, null]);
  assert.ok(pago.dudosos.includes("pago"));
});

test("una OF impresa que se contradice no se usa (ni rechaza ni confirma la foto)", () => {
  const a = leerEtiqueta("O.F. 200000002\nDESTINATARIO: ANA");
  const b = leerEtiqueta("O.F. 200000082\nDESTINATARIO: ANA");
  assert.equal(combinarLecturas(a, b).lectura.ofImpresa, null);
});
