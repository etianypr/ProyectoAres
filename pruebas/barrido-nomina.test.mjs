// La nómina barrida con la cámara en vivo (prueba en Diagnóstico, dueño 2026-11-11):
// cada cuadro se lee con los lectores de la nómina y de la guía, las lecturas de un
// mismo bloque se juntan y la OF se decide dígito por dígito. Calles reales con
// números, nombres y OF inventados.
import test from "node:test";
import assert from "node:assert/strict";

const { textoPorFilas, sumarCuadroNomina, resultadoNomina, votosDeLoLeido, votosNominaVacios, VOTOS_PARA_FIRME, VENCE_MS } = await import(
  "@/lib/encomiendas/lectura/barrido-nomina"
);
const { leerGuia } = await import("@/lib/encomiendas/lectura/guia");
const { leerNomina } = await import("@/lib/encomiendas/lectura/nomina");

const renglon = (texto, x, y) => ({ texto, x, y, ancho: 150, alto: 20 });
const sumar = (cuadros) => cuadros.reduce((v, texto) => sumarCuadroNomina(v, texto), votosNominaVacios());
const barrer = (cuadros) => resultadoNomina(sumar(cuadros));
// Contando también las piezas (las OF que entran al cuadro sin su dirección): apagadas
// desde el 2026-11-15 (spec 034), se siguen midiendo en Diagnóstico.
const conPiezas = (cuadros) =>
  resultadoNomina(cuadros.reduce((v, t) => sumarCuadroNomina(v, t, undefined, { piezas: true }), votosNominaVacios()));
const guia = (of, destino = "21 DE MAYO 123") => `OF:${of} DESTINO:${destino}`;

test("una tabla leída por columnas vuelve a quedar con cada OF al lado de su destino", () => {
  // ML Kit entrega primero la columna de las OF y después la de los destinos.
  const columnas = [
    renglon("OF:200000001", 10, 100),
    renglon("OF:200000002", 10, 140),
    renglon("DESTINO:21 DE MAYO 123", 200, 103),
    renglon("DESTINO:AV SANTA MARIA 2000", 200, 138),
  ];
  const tal = leerGuia(columnas.map((r) => r.texto).join("\n"));
  assert.notDeepEqual(
    tal.lineas.map((l) => [l.of, l.destino]),
    [["200000001", "21 DE MAYO 123"], ["200000002", "AV SANTA MARIA 2000"]],
    "así como llegan, la primera OF se queda sin su destino",
  );
  const filas = textoPorFilas(columnas);
  assert.equal(filas, "OF:200000001 DESTINO:21 DE MAYO 123\nOF:200000002 DESTINO:AV SANTA MARIA 2000");
  assert.deepEqual(
    leerGuia(filas).lineas.map((l) => [l.of, l.destino]),
    [["200000001", "21 DE MAYO 123"], ["200000002", "AV SANTA MARIA 2000"]],
  );
});

test(`una OF queda firme con ${VOTOS_PARA_FIRME} cuadros; con 2 queda por confirmar y con 1 no se muestra`, () => {
  const r = barrer([
    `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}`,
    `${guia("200000002", "AV SANTA MAR1A 2000")}\n${guia("200000003", "PATRICIO LYNCH 45")}`,
    `${guia("200000002", "AV SANTA MARIA 2000")}\n${guia("200000003", "PATRICIO LYNCH 45")}`,
  ]);
  assert.deepEqual(
    r.lineas.map((l) => [l.of, l.firme]),
    [["200000002", true], ["200000003", false]],
  );
  assert.equal(r.firmes, 1);
  assert.equal(r.porConfirmar, 1);
  assert.equal(r.unaVez, 1, "la 200000001 salió en un solo cuadro");
  assert.equal(r.lineas[0].destinoFirme, true, "«MAR1A» es la misma dirección leída con un error");
});

test("las OF quedan en el orden de la nómina, no en el de los votos", () => {
  const r = barrer([guia("200000001"), `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}`, guia("200000002", "AV SANTA MARIA 2000")]);
  assert.deepEqual(r.lineas.map((l) => l.of), ["200000001", "200000002"]);
});

test("un dígito mal leído en algunos cuadros se corrige con los demás, dígito por dígito", () => {
  // Cada cuadro trae un error distinto: ninguna lectura errada se repite, pero en
  // cada posición gana el dígito bueno.
  const r = barrer(["200000123", "200000128", "200800123", "200000123", "209000123"].map((of) => guia(of)));
  assert.equal(r.lineas.length, 1, "son lecturas del mismo bloque");
  assert.deepEqual([r.lineas[0].of, r.lineas[0].firme, r.lineas[0].lecturas], ["200000123", true, 4]);
  assert.equal(r.lecturasCorregidas, 3);
});

test("con un dígito empatado la OF no se decide: queda por confirmar", () => {
  const r = barrer(["200000123", "200000128", "200000123", "200000128"].map((of) => guia(of)));
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].firme, false);
  assert.equal(r.porConfirmar, 1);
});

test("un dígito leído con poca confianza no vota: la OF se confirma con los dígitos seguros", () => {
  const seguro = Array(9).fill(0.95);
  const ultimoDudoso = [...seguro.slice(0, 8), 0.2];
  const cuadros = [
    ["200000123", seguro],
    ["200000128", ultimoDudoso],
    ["200000123", seguro],
    ["200000128", ultimoDudoso],
    ["200000123", seguro],
  ];
  // Sin confianza, el último dígito sale 3 contra 2: no alcanza los 2 de cada 3.
  assert.equal(barrer(cuadros.map(([of]) => guia(of))).lineas[0].firme, false);
  const v = cuadros.reduce((votos, [of, conf]) => sumarCuadroNomina(votos, guia(of), new Map([[of, conf]])), votosNominaVacios());
  const r = resultadoNomina(v);
  assert.deepEqual([r.lineas[0].of, r.lineas[0].firme], ["200000123", true]);
  assert.equal(r.digitosLeidos, 45);
  assert.equal(r.digitosDudosos, 2);
});

test("una confianza en 0 en todos los dígitos (la APK no la da) vota como si no viniera", () => {
  const cero = Array(9).fill(0);
  const v = [1, 2, 3].reduce((votos) => sumarCuadroNomina(votos, guia("200000123"), new Map([["200000123", cero]])), votosNominaVacios());
  assert.equal(resultadoNomina(v).lineas[0].firme, true);
  assert.equal(v.digitosLeidos, 0);
});

test("la confianza de cada dígito se alinea con la OF como la arma el lector", async () => {
  const { confianzasDelCuadro } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const conf = (n) => Array.from({ length: n }, (_, i) => (i + 1) / 100);
  const porOf = confianzasDelCuadro([
    { ...renglon("2000000021 MARIA ROJAS", 10, 10), numeros: [{ texto: "2000000021", confianzas: conf(10) }] },
    { ...renglon("007000123 1 0 1", 10, 50), numeros: [{ texto: "007000123", confianzas: conf(9) }] },
    { ...renglon("OF:200000003", 10, 90), numeros: [{ texto: "OF:200000003", confianzas: conf(12) }] },
    { ...renglon("200000004", 10, 130), numeros: [{ texto: "200000004", confianzas: conf(3) }] },
  ]);
  assert.deepEqual(porOf.get("200000002"), conf(9), "el TOTAL pegado sobra");
  assert.deepEqual(porOf.get("7000123"), conf(9).slice(2), "sin los ceros a la izquierda");
  assert.deepEqual(porOf.get("200000003"), conf(12).slice(3), "sin «OF:»");
  assert.equal(porOf.has("200000004"), false, "sin una confianza por carácter no se alinea");
});

test("dos OF reales con un dígito distinto que salen juntas en la hoja no se mezclan", () => {
  // Dos paquetes para la misma casa: OF seguidas, misma dirección.
  const cuadro = `${guia("200000123")}\n${guia("200000124")}`;
  const r = barrer([cuadro, cuadro, cuadro]);
  assert.deepEqual(r.lineas.map((l) => [l.of, l.firme]), [["200000123", true], ["200000124", true]]);
});

test("dos OF parecidas con direcciones distintas no se mezclan aunque no salgan juntas", () => {
  const r = barrer([guia("200000123"), guia("200000123"), guia("200000124", "BOLOGNESI 300"), guia("200000124", "BOLOGNESI 300")]);
  assert.equal(r.lineas.length, 2);
});

test("un número corto que el lector de la guía toma por OF no cuenta", () => {
  const r = barrer(["OF 1 DESTINO:21 DE MAYO 123", "OF 1 DESTINO:21 DE MAYO 123"]);
  assert.equal(r.lineas.length, 0);
});

test("los números largos se cuentan aunque la nómina no tenga «OF … DESTINO …»", () => {
  const cuadro = "200000001 21 DE MAYO 123\n200000002 AV SANTA MARIA 2000";
  const r = barrer([cuadro, cuadro, cuadro]);
  // No tienen la forma de la fila de un encargo: no son piezas ni quedan «a medias».
  assert.equal(r.lineas.length, 0);
  assert.deepEqual(r.lista, []);
  assert.equal(r.numerosFirmes, 2);
});

test("los votos dicen cuál fue el último cuadro con texto y el último con un bloque entero", () => {
  const v = sumar(["", "DETALLE DE LOS ENCARGOS", guia("200000001"), ""]);
  assert.equal(v.cuadros, 4);
  assert.equal(v.ultimoConTexto, 2);
  assert.equal(v.ultimoConLineas, 2);
});

// --------------------------------------------- la nómina de la sucursal (nomina.ts)

// Como la entrega ML Kit (dueño, 2026-11-11), con lo que se vio en terreno: la OF
// pegada al TOTAL, el nombre antes que la OF por el papel curvo, una dirección en
// dos renglones y el último bloque cortado en el borde del cuadro.
const CUADRO_NOMINA = [
  "DETALLE DE LOS ENCARGOS",
  "NUMERO ENCARGOS",
  "OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA",
  "200000001 1 0 1 JUAN PEREZ SOTO ARICA",
  "DIRECCION",
  "21 DE MAYO 123 .",
  "VALOR $ FORMA PAGO DD",
  "0 CTAC 0",
  "==============================",
  "NUMERO ENCARGOS",
  "OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA",
  "2000000021 MARIA ROJAS",
  "DIRECCION",
  "AV SANTA MARIA 2000, A301 .",
  "VALOR $ FORMA PAGO DD",
  "0 CTAC 0",
  "NUMERO TOTAL DOCTOS BULTOS DESTINATARIO COMUNA",
  "PEDRO TAPIA ARICA",
  "200000003",
  "D1RECCION",
  "PATRICIO LYNCH 45 BLOCK C",
  "DEPTO 12 .",
  "VALOR $ FORMA PAGO DD",
  "119 CTAC 0",
  "NUMERO ENCARGOS",
  "OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA",
  "200000004 1 0 1 ANA SOTO ARICA",
  "DIRECCION",
  "BOLOGNESI 300",
].join("\n");

test("la nómina da la OF y la dirección de cada bloque, sin el nombre", () => {
  const lineas = leerNomina(CUADRO_NOMINA);
  assert.deepEqual(lineas, [
    { of: "200000001", destino: "21 DE MAYO 123" },
    { of: "200000002", destino: "AV SANTA MARIA 2000, A301" },
    { of: "200000003", destino: "PATRICIO LYNCH 45 BLOCK C DEPTO 12" },
  ]);
  // El último bloque quedó cortado (sin el renglón que cierra la dirección): no se toma.
  assert.ok(!lineas.some((l) => l.of === "200000004"));
  assert.ok(!JSON.stringify(lineas).includes("PEREZ"), "el nombre no se lee");
});

test("en la nómina, una dirección sin su OF no se junta con la OF de otro bloque", () => {
  const sinDireccionNiOf = [
    "200000001 1 0 1 JUAN PEREZ ARICA",
    "21 DE MAYO 123 .", // ML Kit no leyó «DIRECCION»
    "VALOR $ FORMA PAGO DD",
    "0 CTAC 0",
    "==============================",
    "NUMERO ENCARGOS",
    "OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA",
    // ML Kit no leyó la fila de la OF
    "DIRECCION",
    "AV SANTA MARIA 2000 .",
    "VALOR $ FORMA PAGO DD",
  ].join("\n");
  assert.deepEqual(leerNomina(sinDireccionNiOf), []);
});

test("el barrido junta las OF de la nómina entre cuadros", () => {
  const r = barrer([CUADRO_NOMINA, CUADRO_NOMINA, CUADRO_NOMINA]);
  assert.deepEqual(r.lineas.map((l) => [l.of, l.destino, l.firme]), [
    ["200000001", "21 DE MAYO 123", true],
    ["200000002", "AV SANTA MARIA 2000, A301", true],
    ["200000003", "PATRICIO LYNCH 45 BLOCK C DEPTO 12", true],
  ]);
  // Con las piezas, el encargo cortado en el borde vota su número y la dirección, que
  // puede venir cortada, queda por confirmar.
  const p = conPiezas([CUADRO_NOMINA, CUADRO_NOMINA, CUADRO_NOMINA]);
  assert.deepEqual([p.lineas[3].of, p.lineas[3].destino, p.lineas[3].destinoFirme], ["200000004", "BOLOGNESI 300", false]);
  assert.equal(p.lista[3].estado, "porConfirmar");
  assert.deepEqual(p.conteo, { enteros: 9, sueltas: 0, abiertas: 3 });
});

test("cada bloque dice en qué renglones están su OF y su dirección (las marcas sobre la cámara)", async () => {
  const { bloquesNomina, ofDeRenglon } = await import("@/lib/encomiendas/lectura/nomina");
  const renglones = CUADRO_NOMINA.split("\n");
  const [primero, , tercero] = bloquesNomina(renglones);
  assert.equal(renglones[primero.filaOf], "200000001 1 0 1 JUAN PEREZ SOTO ARICA");
  assert.deepEqual(primero.filasDireccion.map((i) => renglones[i]), ["DIRECCION", "21 DE MAYO 123 ."]);
  assert.deepEqual(tercero.filasDireccion.map((i) => renglones[i]), ["D1RECCION", "PATRICIO LYNCH 45 BLOCK C", "DEPTO 12 ."]);
  assert.equal(renglones[primero.hasta], "0 CTAC 0", "el encargo llega hasta los valores del pie");
  assert.equal(renglones[tercero.hasta], "119 CTAC 0");
  assert.equal(ofDeRenglon("2000000021 MARIA ROJAS"), "200000002", "la OF pegada al TOTAL");
  assert.equal(ofDeRenglon("12345 FURGON"), null);
});

test("las filas dicen qué renglones del cuadro las forman, de izquierda a derecha", async () => {
  const { filasDe } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const filas = filasDe([
    renglon("DIRECCION", 10, 140),
    renglon("JUAN PEREZ ARICA", 200, 102),
    renglon("200000001 1 0 1", 10, 100),
  ]);
  assert.deepEqual(filas, [
    { texto: "200000001 1 0 1 JUAN PEREZ ARICA", indices: [2, 1] },
    { texto: "DIRECCION", indices: [0] },
  ]);
});

test("cada encargo entero va en una sola caja, de la fila de la OF a los valores del pie", async () => {
  const { cajasDelCuadro } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  // Un encargo entero y la fila de la OF del siguiente, que va entrando a la cámara.
  const cajas = cajasDelCuadro([
    renglon("NUMERO ENCARGOS", 10, 0),
    { texto: "200000001 1 0 1", x: 10, y: 40, ancho: 160, alto: 20 },
    { texto: "JUAN PEREZ ARICA", x: 220, y: 41, ancho: 200, alto: 20 },
    { texto: "DIRECCION", x: 10, y: 80, ancho: 100, alto: 20 },
    { texto: "21 DE MAYO 123 .", x: 10, y: 120, ancho: 180, alto: 20 },
    { texto: "VALOR $ FORMA PAGO DD", x: 10, y: 160, ancho: 300, alto: 20 },
    { texto: "0 CTAC 0", x: 10, y: 200, ancho: 120, alto: 20 },
    renglon("NUMERO ENCARGOS", 10, 260),
    { texto: "200000002 1 0 1", x: 10, y: 300, ancho: 160, alto: 20 },
  ]);
  assert.deepEqual(cajas, [
    { of: "200000001", x: 10, y: 40, ancho: 410, alto: 180, altoFila: 20, entero: true },
    { of: "200000002", x: 10, y: 300, ancho: 160, alto: 20, altoFila: 20, entero: false },
  ]);
});

test("cada lectura sabe de qué OF es: una con un dígito mal apunta a la buena", () => {
  const r = barrer(["200000123", "200000128", "200800123", "200000123", "209000123"].map((of) => guia(of)));
  assert.equal(r.deLectura["200000128"], "200000123");
  assert.equal(r.deLectura["200000123"], "200000123");
});

test("lo barrido pasa a «Cargar la guía»: con dirección, y lo que no quedó firme por confirmar", async () => {
  const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const r = barrer([
    `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}`,
    `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}`,
    guia("200000001"),
  ]);
  const leido = lineasDelBarrido(r);
  assert.deepEqual(leido.lineas, [
    { of: "200000001", destino: "21 DE MAYO 123" },
    { of: "200000002", destino: "AV SANTA MARIA 2000" },
  ]);
  assert.deepEqual([...leido.porConfirmar], ["200000002"], "salió en 2 cuadros: falta uno para confirmarla");
});

test("al juntar con lo que ya había, una OF por confirmar no pisa una firme y una firme la confirma", async () => {
  const { conPorConfirmar } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const linea = (of, porConfirmar) => ({ of, destino: "21 DE MAYO 123", dudosa: false, ...(porConfirmar ? { porConfirmar } : {}) });
  const antes = [linea("200000001"), linea("200000002", true), linea("200000003", true)];
  const nuevas = [{ of: "200000001" }, { of: "200000003" }, { of: "200000004" }];
  const unidas = [linea("200000001"), linea("200000002"), linea("200000003"), linea("200000004")];
  const r = conPorConfirmar(unidas, antes, nuevas, new Set(["200000001", "200000004"]));
  assert.deepEqual(
    r.map((l) => [l.of, Boolean(l.porConfirmar)]),
    [
      ["200000001", false], // ya estaba firme: lo nuevo dudoso no la pisa
      ["200000002", true], // seguía por confirmar y lo nuevo no la trajo
      ["200000003", false], // lo nuevo la trajo firme
      ["200000004", true], // llega por confirmar
    ],
  );
});

test("el total de la nómina sale del MONTO NETO más leído", () => {
  const r = barrer([`${guia("200000001")} MONTO NETO 87`, "MONTO NETO 87", "MONTO NETO 81"]);
  assert.equal(r.total, 87);
});

test("una OF sin dirección o vista una sola vez queda «a medias» en la lista y no se pierde (spec 034)", () => {
  const sinDestino = (of) => `OF:${of} DESTINO:`;
  const r = barrer([
    `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}\n${guia("200000009", "PATRICIO LYNCH 45")}`,
    `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}`,
    `${guia("200000001")}\n${guia("200000002", "AV SANTA MARIA 2000")}`,
    // La 200555500 sale 3 veces pero nunca con su dirección (de la misma serie, como en un día real).
    sinDestino("200555500"),
    sinDestino("200555500"),
    sinDestino("200555500"),
  ]);
  assert.deepEqual(
    r.lista.map((l) => [l.of, l.estado, l.motivo ?? null]),
    [
      ["200000001", "firme", null],
      ["200000002", "firme", null],
      ["200000009", "aMedias", "unaVez"],
      ["200555500", "aMedias", "sinDireccion"],
    ],
  );
  assert.equal(r.unaVez, 1, "el conteo de Diagnóstico sigue igual");
});

test("lo «a medias» pasa a «Cargar la guía» sin dirección y por confirmar; al leerse entero deja de estarlo (spec 034)", async () => {
  const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const sinDireccion = "OF:279000500 DESTINO:";
  const medias = lineasDelBarrido(barrer([guia("200000001"), sinDireccion, sinDireccion, sinDireccion]));
  assert.deepEqual(medias.lineas, [
    { of: "200000001", destino: "21 DE MAYO 123" },
    { of: "279000500", destino: "" },
  ]);
  assert.deepEqual([...medias.porConfirmar].sort(), ["200000001", "279000500"]);
  // Se vuelve a pasar por el encargo y esta vez se lee entero, 3 veces: firme.
  const entera = lineasDelBarrido(barrer([guia("279000500", "BAQUEDANO 488"), guia("279000500", "BAQUEDANO 488"), guia("279000500", "BAQUEDANO 488")]));
  assert.deepEqual(entera.lineas, [{ of: "279000500", destino: "BAQUEDANO 488" }]);
  assert.equal(entera.porConfirmar.size, 0);
});

// ------------------------------------------------- lectura por piezas (spec 034; apagadas, se miden en Diagnóstico)

const ENTERO = (of, direccion) => [`${of} 1 0 1 ANA SOTO ARICA`, "DIRECCION", `${direccion} .`, "VALOR $ FORMA PAGO DD", "0 CTAC 0"].join("\n");
const SUELTA = (of) => ["VALOR $ FORMA PAGO DD", "0 CTAC 0", "NUMERO ENCARGOS", `${of} 1 0 1 ANA SOTO ARICA`].join("\n");

test("la OF que entra al cuadro sin su dirección vota sus dígitos: el encargo queda firme antes", () => {
  const cuadros = [ENTERO("200000001", "21 DE MAYO 123"), SUELTA("200000001"), SUELTA("200000001")];
  const con = conPiezas(cuadros);
  assert.deepEqual(con.lineas.map((l) => [l.of, l.destino, l.firme, l.cuadros]), [["200000001", "21 DE MAYO 123", true, 3]]);
  // Como antes (solo encargos enteros): un cuadro, y no se muestra.
  const sin = resultadoNomina(cuadros.reduce((v, t) => sumarCuadroNomina(v, t, undefined, { piezas: false }), votosNominaVacios()));
  assert.equal(sin.lineas.length, 0);
});

test("una OF suelta con un dígito mal se suma a su encargo, y con dos encargos parecidos no vota", () => {
  const uno = conPiezas([ENTERO("200000123", "21 DE MAYO 123"), ENTERO("200000123", "21 DE MAYO 123"), SUELTA("200000128")]);
  assert.equal(uno.deLectura["200000128"], "200000123");
  assert.equal(uno.ambiguas, 0);
  // 200000123 y 200000124 son dos encargos de verdad (salen juntos en la hoja): la
  // lectura suelta 200000128 calza con los dos y no se sabe de cuál es.
  const juntos = `${ENTERO("200000123", "21 DE MAYO 123")}\n${ENTERO("200000124", "PATRICIO LYNCH 45")}`;
  const dos = conPiezas([juntos, juntos, juntos, SUELTA("200000128")]);
  assert.equal(dos.ambiguas, 1);
  assert.deepEqual(dos.lista.map((l) => [l.of, l.estado]), [["200000123", "firme"], ["200000124", "firme"]]);
});

test("una dirección sin cerrar no pisa a la cerrada: solo suma si es la misma", () => {
  const cortada = ["200000001 1 0 1 ANA SOTO ARICA", "DIRECCION", "PATRICIO LYNCH 45 BLOCK C"].join("\n");
  const entera = ["200000001 1 0 1 ANA SOTO ARICA", "DIRECCION", "PATRICIO LYNCH 45 BLOCK C", "DEPTO 12 .", "VALOR $ FORMA PAGO DD"].join("\n");
  const r = conPiezas([cortada, cortada, cortada, entera]);
  assert.equal(r.lineas[0].destino, "PATRICIO LYNCH 45 BLOCK C DEPTO 12");
  assert.equal(r.lineas[0].destinoFirme, false, "la entera salió una sola vez: por confirmar");
  // Nunca se leyó cerrada: se muestra la abierta, sin firmar.
  const solo = conPiezas([cortada, cortada, cortada]);
  assert.deepEqual([solo.lineas[0].destino, solo.lineas[0].firme, solo.lineas[0].destinoFirme], ["PATRICIO LYNCH 45 BLOCK C", true, false]);
});

test("lo que falta volver a pasar: la OF sin firmar o a medias, no la dirección dudosa", () => {
  const abierta = ["200000004 1 0 1 ANA SOTO ARICA", "DIRECCION", "BOLOGNESI 300"].join("\n");
  const suelta = SUELTA("279000500");
  const r = conPiezas([abierta, abierta, abierta, suelta, suelta, suelta]);
  assert.deepEqual(r.lista.map((l) => [l.of, l.estado, l.ofFirme]), [
    ["200000004", "porConfirmar", true],
    ["279000500", "aMedias", true],
  ]);
});

test("un número suelto visto una o dos veces es una fila mal leída: no se lista (terreno 2026-11-15)", () => {
  const entero = ENTERO("200000004", "BOLOGNESI 300");
  const r = conPiezas([entero, entero, entero, SUELTA("279000500"), SUELTA("281999000"), SUELTA("281999000")]);
  assert.deepEqual(r.lista.map((l) => l.of), ["200000004"]);
  assert.equal(r.ruido, 2);
  assert.equal(r.unaVez, 0);
});

// ------------------------------------------- seguir la misma lectura (spec 034)

test("los votos guardados y retomados dan lo mismo que un barrido seguido", () => {
  const cuadros = [
    ENTERO("200000001", "21 DE MAYO 123"),
    ENTERO("200000001", "21 DE MAYO 123"),
    ENTERO("200000002", "PATRICIO LYNCH 45"),
    ENTERO("200000001", "21 DE MAYO 123"),
    ENTERO("200000002", "PATRICIO LYNCH 45"),
    ENTERO("200000002", "PATRICIO LYNCH 45"),
  ];
  // El celular se bloquea después del tercer cuadro: los votos van a IndexedDB (JSON) y vuelven.
  const guardados = JSON.parse(JSON.stringify(sumar(cuadros.slice(0, 3))));
  const retomado = resultadoNomina(cuadros.slice(3).reduce((v, t) => sumarCuadroNomina(v, t), guardados));
  assert.deepEqual(retomado, barrer(cuadros));
  assert.equal(retomado.firmes, 2);
});

test("al seguir la lectura entran solo las OF nuevas y las que quedaron firmes; una borrada en la revisión no vuelve", async () => {
  const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const uno = [ENTERO("200000001", "21 DE MAYO 123"), ENTERO("200000001", "21 DE MAYO 123"), ENTERO("200000001", "21 DE MAYO 123")];
  const dos = [ENTERO("200000002", "PATRICIO LYNCH 45"), ENTERO("200000002", "PATRICIO LYNCH 45")];
  const primera = lineasDelBarrido(barrer([...uno, ...dos]));
  assert.deepEqual(primera.lineas.map((l) => l.of), ["200000001", "200000002"]);
  assert.deepEqual(primera.entregadas, { 200000001: true, 200000002: false });
  // El conductor borra la 200000001 en la revisión y sigue barriendo: la 2 se confirma y llega la 3.
  const tres = [ENTERO("279000500", "BAQUEDANO 488"), ENTERO("279000500", "BAQUEDANO 488")];
  const segunda = lineasDelBarrido(barrer([...uno, ...dos, dos[0], ...tres]), primera.entregadas);
  assert.deepEqual(segunda.lineas.map((l) => l.of), ["200000002", "279000500"]);
  assert.deepEqual([...segunda.porConfirmar], ["279000500"]);
  assert.deepEqual(segunda.sobran, []);
});

test("una OF entregada por confirmar que resultó ser otra mal leída sobra", async () => {
  const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const mala = [ENTERO("200000128", "21 DE MAYO 123"), ENTERO("200000128", "21 DE MAYO 123")];
  const primera = lineasDelBarrido(barrer(mala));
  assert.deepEqual(primera.entregadas, { 200000128: false });
  const buena = Array.from({ length: 5 }, () => ENTERO("200000123", "21 DE MAYO 123"));
  const segunda = lineasDelBarrido(barrer([...mala, ...buena]), primera.entregadas);
  assert.deepEqual(segunda.lineas.map((l) => l.of), ["200000123"]);
  assert.deepEqual(segunda.sobran, ["200000128"]);
  assert.deepEqual(segunda.entregadas, { 200000123: true });
});

test("los números del encabezado y del pie de la nómina no son una OF (terreno 2026-11-15)", async () => {
  const { piezasNomina } = await import("@/lib/encomiendas/lectura/nomina");
  // El comienzo de la nómina: el RUT, el número de la nómina y el furgón, antes del detalle.
  const encabezado = ["NOMINA DE REPARTO", "000123456", "12345678 - 5 JUAN PEREZ SOTO", "Auxiliar:", "MEDIO DE TRASPORTE", "12345 FURGON", "DETALLE DE LOS ENCARGOS"];
  assert.deepEqual(piezasNomina(encabezado).piezas, []);
  const r = barrer(Array.from({ length: 5 }, () => encabezado.join("\n")));
  assert.deepEqual(r.lista, []);
  // La fila de un encargo sí: por su forma (OF, TOTAL, DOCTOS, BULTOS) o por venir bajo los títulos.
  assert.deepEqual(piezasNomina(["0 CTAC 0", "200000001 1 0 1 ANA SOTO ARICA"]).piezas.map((p) => p.of), ["200000001"]);
  assert.deepEqual(piezasNomina(["OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA", "ANA SOTO ARICA", "200000001"]).piezas.map((p) => p.of), ["200000001"]);
});

test("una mala lectura de una OF que ya quedó firme se borra sola (terreno 2026-11-15)", () => {
  const bien = ENTERO("281000276", "21 DE MAYO 123");
  // El cuadro movido: un dígito cambiado, otro perdido y la dirección también mal leída.
  const movido = ENTERO("26100026", "Z1 OE HAY0 I2");
  const r = barrer([bien, movido, bien, movido, bien, bien]);
  assert.deepEqual(r.lista.map((l) => [l.of, l.estado]), [["281000276", "firme"]]);
  assert.equal(r.malLeidas, 1);
  assert.equal(r.deLectura["26100026"], "281000276", "si vuelve a salir, se marca como la buena");
  // Antes de que la buena quede firme, la mala sigue a la vista: no se bota nada a ciegas.
  assert.equal(barrer([bien, movido, movido]).lista.length, 2);
});

test("un encargo de verdad con un número parecido, en otra parte de la nómina, no se borra", () => {
  const una = ENTERO("281000276", "21 DE MAYO 123");
  const otra = ENTERO("281000216", "PATRICIO LYNCH 45");
  const lejos = Array.from({ length: 30 }, () => ENTERO("279000500", "BAQUEDANO 488"));
  // La otra se leyó solo dos veces, mucho después: sigue por confirmar.
  const r = barrer([una, una, una, ...lejos, otra, otra]);
  assert.deepEqual(r.lista.map((l) => [l.of, l.estado]), [["281000276", "firme"], ["279000500", "firme"], ["281000216", "porConfirmar"]]);
  // Y juntas en la hoja (mismo cuadro) tampoco, aunque una vaya atrasada.
  const juntas = barrer([una, una, una, `${una}\n${otra}`, `${una}\n${otra}`]);
  assert.equal(juntas.malLeidas, 0);
  assert.equal(juntas.lista.length, 2);
});

// ------------------------------- la misma fila leída de dos formas (terreno 2026-11-15)

test("una lectura parecida a una OF firme, con otra dirección y menos cuadros, es la misma fila mal leída", () => {
  const bien = `${ENTERO("281000276", "21 DE MAYO 123")}\n${ENTERO("279000500", "PATRICIO LYNCH 45")}`;
  // El cuadro movido leyó mal un dígito y tomó la dirección del encargo de al lado.
  const mal = ENTERO("281000216", "PATRICIO LYNCH 45");
  const r = barrer([bien, mal, bien, bien, mal, bien, bien, bien, bien]);
  assert.deepEqual(r.lista.map((l) => [l.of, l.estado]), [["281000276", "firme"], ["279000500", "firme"]]);
  assert.equal(r.malLeidas, 1);
  // Con una dirección propia y firme es otro encargo, de número seguido: no se toca.
  const otro = ENTERO("281000216", "BAQUEDANO 488");
  assert.equal(barrer([bien, otro, bien, bien, otro, bien, bien, bien, bien]).lista.length, 3);
});

test("dos firmes que parecen la misma fila: la leída primero sigue firme y la otra queda por confirmar", () => {
  // Spec 039 (dueño, 2026-11-18): una OF ya leída no vuelve a «por confirmar» por algo parecido que
  // se leyó después (antes quedaban las dos). La otra no se bota: se confirma con el papel.
  const una = ENTERO("281000276", "21 DE MAYO 123");
  const otra = ENTERO("281000278", "21 DE MAYO 123 B");
  const r = barrer([una, otra, una, otra, una, otra, una]);
  assert.deepEqual(r.lista.map((l) => [l.of, l.estado, l.ofFirme]), [
    ["281000276", "firme", true],
    ["281000278", "porConfirmar", true],
  ]);
  assert.deepEqual([r.firmes, r.porConfirmar, r.dobles], [1, 1, 1]);
});

test("una lectura de un solo cuadro a tres dígitos de una firme a la vista es un fallo de lectura", () => {
  const bien = ENTERO("281000276", "21 DE MAYO 123");
  const r = barrer([bien, bien, ENTERO("281999276", "Z1 OE HAY0"), bien]);
  assert.deepEqual(r.lista.map((l) => l.of), ["281000276"]);
  // Con más cuadros a esa distancia ya no: es otra OF por confirmar.
  const tres = ENTERO("281999276", "BAQUEDANO 488");
  assert.equal(barrer([bien, bien, tres, bien, tres, tres]).lista.length, 2);
});

test("de las dos formas de juntar los renglones gana la que armó más encargos enteros", async () => {
  const { mejorResultado } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const pocos = barrer([ENTERO("200000001", "21 DE MAYO 123")]);
  const muchos = barrer([ENTERO("200000001", "21 DE MAYO 123"), ENTERO("200000001", "21 DE MAYO 123")]);
  assert.equal(mejorResultado(pocos, muchos), muchos);
  assert.equal(mejorResultado(muchos, pocos), muchos);
});

// ---------------- otra pasada: lo que faltaba confirmar no perdura (dueño, 2026-11-15)

test("al empezar otra pasada sigue lo leído y lo que faltaba confirmar parte de cero", () => {
  const leida = ENTERO("200000001", "21 DE MAYO 123");
  const dudosa = ENTERO("279000500", "BAQUEDANO 488");
  const unaVez = ENTERO("281999000", "PATRICIO LYNCH 45");
  const antes = sumar([leida, leida, leida, dudosa, dudosa, unaVez]);
  assert.deepEqual(resultadoNomina(antes).lista.map((l) => [l.of, l.estado]), [
    ["200000001", "firme"],
    ["279000500", "porConfirmar"],
    ["281999000", "aMedias"],
  ]);
  const limpio = votosDeLoLeido(antes);
  assert.deepEqual(resultadoNomina(limpio).lista.map((l) => [l.of, l.estado]), [["200000001", "firme"]]);
  assert.equal(limpio.cuadros, antes.cuadros, "los cuadros siguen contando desde donde iban");
  // La dudosa se vuelve a leer en la pasada nueva, desde cero: con tres lecturas queda firme.
  const otra = [dudosa, dudosa, dudosa].reduce((v, t) => sumarCuadroNomina(v, t), limpio);
  assert.deepEqual(resultadoNomina(otra).lista.map((l) => [l.of, l.estado]), [["200000001", "firme"], ["279000500", "firme"]]);
});

test("lo leído conserva sus malas lecturas apuntando a la buena, y el orden de la nómina", () => {
  // OF de una misma serie, como las de un día (spec 039: fuera del rango del escaneo se corrigen).
  const una = ENTERO("281000123", "21 DE MAYO 123");
  const mal = ENTERO("281000128", "21 DE MAYO 123");
  const dos = ENTERO("281279500", "BAQUEDANO 488");
  const pendiente = ENTERO("281999000", "PATRICIO LYNCH 45");
  const limpio = votosDeLoLeido(sumar([pendiente, pendiente, una, mal, una, una, dos, dos, dos]));
  const r = resultadoNomina(limpio);
  assert.deepEqual(r.lista.map((l) => l.of), ["281000123", "281279500"]);
  assert.equal(r.deLectura["281000128"], "281000123");
  // Una OF nueva queda después de las que ya estaban.
  const tres = ENTERO("281300111", "BOLOGNESI 300");
  const conNueva = resultadoNomina([tres, tres, tres].reduce((v, t) => sumarCuadroNomina(v, t), limpio));
  assert.deepEqual(conNueva.lista.map((l) => l.of), ["281000123", "281279500", "281300111"]);
});

test("una línea entregada por confirmar no se quita de la guía porque se empezó otra pasada", async () => {
  const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const leida = ENTERO("200000001", "21 DE MAYO 123");
  const dudosa = ENTERO("279000500", "BAQUEDANO 488");
  const pasada1 = sumar([leida, leida, leida, dudosa, dudosa]);
  const primera = lineasDelBarrido(resultadoNomina(pasada1));
  assert.deepEqual(primera.entregadas, { 200000001: true, 279000500: false });
  // Segunda pasada: la dudosa ya no está en la lectura y no se volvió a leer.
  const segunda = lineasDelBarrido(resultadoNomina(sumarCuadroNomina(votosDeLoLeido(pasada1), leida)), primera.entregadas);
  assert.deepEqual(segunda.sobran, [], "su línea sigue en la revisión, por confirmar");
  assert.deepEqual(segunda.lineas, []);
  // Y si en la pasada nueva se lee bien, entra firme.
  const releida = [dudosa, dudosa, dudosa].reduce((v, t) => sumarCuadroNomina(v, t), votosDeLoLeido(pasada1));
  const tercera = lineasDelBarrido(resultadoNomina(releida), primera.entregadas);
  assert.deepEqual(tercera.lineas.map((l) => l.of), ["279000500"]);
  assert.equal(tercera.porConfirmar.size, 0);
});

// ----------------------- «DD» no es de la dirección; el informe en el orden de la hoja (dueño, 2026-11-15)

test("«DD», el título de la última columna del pie, no se pega a la dirección", () => {
  // Con el papel inclinado, «DD» queda a la altura del renglón de la dirección.
  const pegado = ["200000001 1 0 1 ANA SOTO ARICA", "DIRECCION", "21 DE MAYO 123 . DD", "VALOR $ FORMA PAGO", "0 CTAC 0"].join("\n");
  assert.deepEqual(leerNomina(pegado), [{ of: "200000001", destino: "21 DE MAYO 123" }]);
  // O queda como un renglón aparte, entre la dirección y el pie.
  const aparte = ["200000001 1 0 1 ANA SOTO ARICA", "DIRECCION", "21 DE MAYO 123 .", "DD", "VALOR $ FORMA PAGO", "0 CTAC 0"].join("\n");
  assert.deepEqual(leerNomina(aparte), [{ of: "200000001", destino: "21 DE MAYO 123" }]);
  // Con «DD» y sin él es la misma dirección: los votos se juntan y queda firme.
  const limpio = ENTERO("200000001", "21 DE MAYO 123");
  const r = barrer([pegado, limpio, aparte]);
  assert.deepEqual(r.lista.map((l) => [l.of, l.destino, l.estado]), [["200000001", "21 DE MAYO 123", "firme"]]);
});

test("el informe sale en el orden de la hoja, aunque un encargo se haya leído al repasar", async () => {
  const { lineasDelBarrido, enOrdenDeLaNomina } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  // OF de una misma serie, como las de un día (spec 039).
  const a = ENTERO("281000001", "21 DE MAYO 123");
  const b = ENTERO("281279500", "BAQUEDANO 488");
  const c = ENTERO("281300111", "BOLOGNESI 300");
  const d = ENTERO("281583222", "PATRICIO LYNCH 45");
  // Primera pasada: la B se salta (solo se ven A, C y D). Al repasar sale entre la A y la C.
  const cuadros = [a, a, `${a}\n${c}`, `${c}\n${d}`, `${c}\n${d}`, d, `${a}\n${b}`, `${a}\n${b}\n${c}`, `${b}\n${c}`];
  const r = barrer(cuadros);
  assert.deepEqual(r.lista.map((l) => l.of), ["281000001", "281279500", "281300111", "281583222"]);
  assert.deepEqual(r.lineas.map((l) => l.of), ["281000001", "281279500", "281300111", "281583222"]);
  // Así llega a «Cargar la guía», y las líneas que ya estaban ahí se reordenan igual.
  const leido = lineasDelBarrido(r);
  assert.deepEqual(leido.orden, ["281000001", "281279500", "281300111", "281583222"]);
  const linea = (of) => ({ of, destino: "X 1", dudosa: false });
  const enGuia = [linea("7000123"), linea("281300111"), linea("281000001"), linea("281583222"), linea("281279500")];
  assert.deepEqual(enOrdenDeLaNomina(enGuia, leido.orden).map((l) => l.of), ["7000123", "281000001", "281279500", "281300111", "281583222"]);
});

test("el orden de la hoja no depende de cómo entregue los renglones ML Kit, y sobrevive a otra pasada", () => {
  const a = ENTERO("200000001", "21 DE MAYO 123");
  const b = ENTERO("279000500", "BAQUEDANO 488");
  // El texto llega con la B antes que la A, pero en la hoja la A va arriba (`vertical`).
  const alReves = `${b}\n${a}`;
  const v = [alReves, alReves, alReves].reduce((x, t) => sumarCuadroNomina(x, t, undefined, { vertical: ["200000001", "279000500"] }), votosNominaVacios());
  assert.deepEqual(resultadoNomina(v).lista.map((l) => l.of), ["200000001", "279000500"]);
  // Sin `vertical` vale el orden del texto.
  assert.deepEqual(barrer([alReves, alReves, alReves]).lista.map((l) => l.of), ["279000500", "200000001"]);
  // Al empezar otra pasada el orden de lo ya leído se conserva.
  assert.deepEqual(resultadoNomina(votosDeLoLeido(v)).lista.map((l) => l.of), ["200000001", "279000500"]);
});

// ------------- lo que falta confirmar vence (dueño, 2026-11-16: «a veces son inventados y quedan molestando»)

test("lo que falta confirmar vence si en 5 min de cámara no vuelve a salir nada parecido; si sale, revive (spec 036)", async () => {
  const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
  const conReloj = (v, texto, reloj) => sumarCuadroNomina(v, texto, undefined, { reloj });
  const leida = ENTERO("200000001", "21 DE MAYO 123");
  const inventada = ENTERO("279000500", "PATRICIO LYNCH 45");
  let v = votosNominaVacios();
  v = conReloj(v, `${leida}\n${inventada}`, 1000);
  v = conReloj(v, leida, 2000);
  v = conReloj(v, leida, 3000);
  assert.deepEqual(resultadoNomina(v).lista.map((l) => [l.of, l.estado]), [["200000001", "firme"], ["279000500", "aMedias"]]);
  // Casi 5 min después sigue; pasado el plazo, vence. La firme no vence.
  const casi = resultadoNomina(conReloj(v, ENTERO("283000222", "BOLOGNESI 300"), 1000 + VENCE_MS));
  assert.equal(casi.vencidas, 0);
  v = conReloj(v, ENTERO("283000222", "BOLOGNESI 300"), 1000 + VENCE_MS + 1);
  const r = resultadoNomina(v);
  assert.deepEqual(r.lista.map((l) => l.of), ["200000001", "283000222"]);
  assert.deepEqual([r.vencidas, r.unaVez, r.porConfirmar], [1, 1, 0], "la de BOLOGNESI, vista una vez, sigue");
  assert.deepEqual(lineasDelBarrido(r).lineas.map((l) => l.of), ["200000001", "283000222"], "la vencida no pasa a la guía");
  // Sin reloj (votos de antes de la spec 036) nada vence.
  assert.equal(resultadoNomina(v, { vencer: false }).lista.length, 3);
  // Se vuelve a leer algo parecido (un dígito distinto, misma dirección): revive con lo que tenía.
  v = conReloj(v, ENTERO("279000501", "PATRICIO LYNCH 45"), 1000 + VENCE_MS + 2000);
  const revive = resultadoNomina(v);
  assert.equal(revive.vencidas, 0);
  assert.deepEqual(revive.lista.find((l) => l.of === "279000500")?.cuadros, 2);
});

test("al empezar otra pasada lo vencido también parte de cero", () => {
  const conReloj = (v, texto, reloj) => sumarCuadroNomina(v, texto, undefined, { reloj });
  const leida = ENTERO("200000001", "21 DE MAYO 123");
  const inventada = ENTERO("279000500", "PATRICIO LYNCH 45");
  let v = [[leida, 1000], [`${leida}\n${inventada}`, 2000], [`${leida}\n${inventada}`, 3000]].reduce((x, [t, ms]) => conReloj(x, t, ms), votosNominaVacios());
  v = conReloj(v, ENTERO("283000222", "BOLOGNESI 300"), 3000 + VENCE_MS + 1);
  assert.equal(resultadoNomina(v).vencidas, 1);
  const limpio = votosDeLoLeido(v);
  assert.equal(limpio.ofs["279000500"], undefined);
  assert.equal(limpio.ofs["200000001"].visto, 3000, "lo leído conserva cuándo se vio");
});

test("el reloj del barrido no corre con el celular bloqueado: cada cuadro suma a lo más 1 s", async () => {
  const { relojDelCuadro, TOPE_PASO_RELOJ } = await import("@/lib/encomiendas/lectura/votos-barrido");
  assert.equal(relojDelCuadro(undefined, 280), 280);
  assert.equal(relojDelCuadro(5000, 300), 5300);
  assert.equal(relojDelCuadro(5000, 10 * 60 * 1000), 5000 + TOPE_PASO_RELOJ, "10 min bloqueado cuentan 1 s");
  assert.equal(relojDelCuadro(5000, -50), 5000, "un reloj del sistema que vuelve atrás no resta");
});
