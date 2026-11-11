// La nómina barrida con la cámara en vivo (prueba en Diagnóstico, dueño 2026-11-11):
// cada cuadro se lee con los lectores de la nómina y de la guía, las lecturas de un
// mismo bloque se juntan y la OF se decide dígito por dígito. Calles reales con
// números, nombres y OF inventados.
import test from "node:test";
import assert from "node:assert/strict";

const { textoPorFilas, sumarCuadroNomina, resultadoNomina, votosNominaVacios, VOTOS_PARA_FIRME } = await import(
  "@/lib/encomiendas/lectura/barrido-nomina"
);
const { leerGuia } = await import("@/lib/encomiendas/lectura/guia");
const { leerNomina } = await import("@/lib/encomiendas/lectura/nomina");

const renglon = (texto, x, y) => ({ texto, x, y, ancho: 150, alto: 20 });
const sumar = (cuadros) => cuadros.reduce((v, texto) => sumarCuadroNomina(v, texto), votosNominaVacios());
const barrer = (cuadros) => resultadoNomina(sumar(cuadros));
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
  assert.equal(r.lineas.length, 0);
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
    { of: "200000001", x: 10, y: 40, ancho: 410, alto: 180, entero: true },
    { of: "200000002", x: 10, y: 300, ancho: 160, alto: 20, entero: false },
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
