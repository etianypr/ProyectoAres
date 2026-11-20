// Spec 045: la lista de la app de Starken en el teléfono («Lista de Ordenes de Flete») se barre
// con la cámara como la boleta de papel, y la boleta se sigue leyendo igual.
//
// El cuadro tiene la forma del que entregó ML Kit con la lista real (Diagnóstico, «Copiar
// anonimizado», 2026-11-19), con calles reales y OF, números, nombres y número de conductor
// inventados.
import test from "node:test";
import assert from "node:assert/strict";

const { bloquesListaFlete } = await import("@/lib/encomiendas/lectura/lista-flete");
const { sumarCuadroNomina, resultadoNomina, votosNominaVacios, cajasDelCuadro } = await import(
  "@/lib/encomiendas/lectura/barrido-nomina"
);

const CONDUCTOR = "27000001";
const tarjeta = (of, nombre, direccion) => [of, "PxP", nombre, `${direccion} ARICA COD`, CONDUCTOR, "Hoy"];
const cuadroLista = (...tarjetas) =>
  ["Ruta", "+", "Lista de Ordenes de Flete 00:00", ...tarjetas.flat(), "51", "<", "Volver Cobrar Más"];
const NOMBRES = ["NOMBRE INVENTADO UNO", "OTRO NOMBRE INVENTADO", "TERCER NOMBRE"];

test("cada tarjeta da su OF y su dirección, sin la comuna, sin el ícono y sin el nombre", () => {
  const renglones = cuadroLista(
    tarjeta("282000101", NOMBRES[0], "SANTIAGO ARATA 901"),
    tarjeta("282000102", NOMBRES[1], "RIGOBERTO LETELIER 902"),
    tarjeta("282000103", NOMBRES[2], "PORTAL EL ALWA"),
  );
  const bloques = bloquesListaFlete(renglones);
  assert.deepEqual(
    bloques.map((b) => [b.of, b.destino]),
    [
      ["282000101", "SANTIAGO ARATA 901"],
      ["282000102", "RIGOBERTO LETELIER 902"],
      ["282000103", "PORTAL EL ALWA"],
    ],
  );
  for (const b of bloques) assert.ok(!NOMBRES.some((n) => b.destino.includes(n)), "el nombre no se lee");
});

test("el número del conductor no es una OF, aunque haya una sola tarjeta entera", () => {
  const una = ["Lista de Ordenes de Flete", ...tarjeta("282000104", NOMBRES[0], "AGUA SANTA 903"), CONDUCTOR, "Hoy"];
  assert.deepEqual(bloquesListaFlete(una).map((b) => b.of), ["282000104"]);
  const soloConductor = ["SANTIAGO ARATA 904 ARICA COD", CONDUCTOR, "Hoy", "282000105", "PxP"];
  assert.deepEqual(bloquesListaFlete(soloConductor), [], "el conductor sin nombre después no arma tarjeta");
});

test("una tarjeta cortada en el borde no se toma", () => {
  const renglones = [
    "PUERTA NORTE 905 ARICA", // la de arriba, sin su OF
    CONDUCTOR,
    "Hoy",
    ...tarjeta("282000106", NOMBRES[0], "LA PAZ 906"),
    "282000107", // la de abajo: la OF y el nombre, sin la dirección
    "PxP",
    NOMBRES[1],
  ];
  assert.deepEqual(bloquesListaFlete(renglones).map((b) => b.of), ["282000106"]);
});

test("el nombre con un número detrás (lista real, 2026-11-20) arma la tarjeta y el número no se lee", () => {
  // Por filas: el número en el renglón del nombre; la OF a veces pegada al ícono.
  const porFilas = cuadroLista(["282000114 PxP", "PxP", `${NOMBRES[0]}. 300000001`, "LA PAZ 914 ARICA COD)", CONDUCTOR, "Hoy"]);
  // Como llegan: el número en su propio renglón (sin la forma de una OF: con 9 dígitos sería la
  // OF de la tarjeta siguiente) y el ícono COD entre el nombre y la dirección.
  const comoLlegan = cuadroLista(["PxP", "282000114", NOMBRES[0], "30000001", "COD", "LA PAZ 914 ARICA", CONDUCTOR, "Hoy"]);
  for (const renglones of [porFilas, comoLlegan]) {
    const bloques = bloquesListaFlete(renglones);
    assert.deepEqual(bloques.map((b) => [b.of, b.destino]), [["282000114", "LA PAZ 914"]]);
    assert.ok(!bloques.some((b) => b.of === "300000001" || b.of === "30000001"), "el número del nombre no es una OF");
  }
});

test("una tarjeta sin dirección no toma el nombre ni la dirección de la siguiente", () => {
  const renglones = ["282000124", "PxP", NOMBRES[0], ...tarjeta("282000125", NOMBRES[1], "LA PAZ 922")];
  const bloques = bloquesListaFlete(renglones);
  assert.deepEqual(bloques.map((b) => [b.of, b.destino]), [["282000125", "LA PAZ 922"]]);
  assert.ok(!bloques.some((b) => NOMBRES.some((n) => b.destino.includes(n))));
});

test("una tarjeta sin su dirección no se queda con la de la siguiente", () => {
  const renglones = ["282000115", "PxP", NOMBRES[0], CONDUCTOR, "Hoy", ...tarjeta("282000116", NOMBRES[1], "LA PAZ 915")];
  assert.deepEqual(bloquesListaFlete(renglones).map((b) => [b.of, b.destino]), [["282000116", "LA PAZ 915"]]);
});

test("el ícono como lo lee ML Kit («(COD)», «C0D)», pegado a ARICA) no rompe la tarjeta (lista real, 2026-11-20)", () => {
  const casos = [
    ["LA PAZ 916 ARICA (COD)", "LA PAZ 916"],
    ["LA PAZ 916 ARICA C0D)", "LA PAZ 916"],
    ["LA PAZ 916 ARICAC0D)", "LA PAZ 916"],
    ["LA PAZ 916 ARICA CoD)", "LA PAZ 916"],
  ];
  for (const [direccion, destino] of casos) {
    const renglones = ["282000117", "PxP)", NOMBRES[0], direccion, CONDUCTOR, "Hoy"];
    assert.deepEqual(bloquesListaFlete(renglones).map((b) => [b.of, b.destino]), [["282000117", destino]], direccion);
  }
});

test("la comuna mal leída o tapada: la dirección se cierra en el número del conductor", () => {
  const malLeida = ["282000118", "PxP", NOMBRES[0], "LA PAZ 917 ARlCA COD)", CONDUCTOR, "Hoy"];
  assert.deepEqual(bloquesListaFlete(malLeida).map((b) => b.destino), ["LA PAZ 917"]);
  const tapada = ["282000119", "PxP", NOMBRES[0], "LA PAZ 918 (COD)", "274973 18", "Hoy"];
  assert.deepEqual(bloquesListaFlete(tapada).map((b) => b.destino), ["LA PAZ 918"], "el conductor leído con un espacio");
  const conHoy = ["282000120", "PxP", NOMBRES[0], "LA PAZ 919", "Hoy"];
  assert.deepEqual(bloquesListaFlete(conHoy).map((b) => b.destino), ["LA PAZ 919"]);
});

test("una dirección en dos renglones se junta", () => {
  const renglones = ["282000121", "PXP", NOMBRES[0], "PASAJE PINTO 920 DEPTO 3 BLOCK", "VILLA INVENTADA ARICA", CONDUCTOR, "Hoy"];
  assert.deepEqual(bloquesListaFlete(renglones).map((b) => [b.of, b.destino, b.hasta]), [["282000121", "PASAJE PINTO 920 DEPTO 3 BLOCK VILLA INVENTADA", 4]]);
});

test("sin el final de la dirección en el cuadro (cortada abajo), la tarjeta no se toma", () => {
  assert.deepEqual(bloquesListaFlete(["282000122", "PxP", NOMBRES[0], "PASAJE PINTO 921 DEPTO 3", "51", "<", "Volver Cobrar Más"]), []);
  assert.deepEqual(bloquesListaFlete(["282000123", "PxP)", "51", "<", "Volver Cobrar Más"]), []);
});

test("una OF leída con dígitos de menos no arma tarjeta (otro cuadro la trae entera)", () => {
  assert.deepEqual(bloquesListaFlete(cuadroLista(tarjeta("2820001", NOMBRES[0], "LA PAZ 913"))), []);
});

test("la dirección pasa por la limpieza de lectura (spec 044)", () => {
  const [b] = bloquesListaFlete(cuadroLista(tarjeta("282000108", NOMBRES[0], "SANTIAG0 ARATA 907")));
  assert.equal(b.destino, "SANTIAGO ARATA 907");
});

test("un cuadro de la boleta de papel no se lee con este lector", () => {
  const boleta = [
    "NUMERO ENCARGOS",
    "OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA",
    "282000109",
    NOMBRES[0],
    "SANTIAGO ARATA 908 ARICA",
    "DIRECCION",
    "SANTIAGO ARATA 908 .",
    "VALOR $ FORMA PAGO DD",
  ];
  assert.deepEqual(bloquesListaFlete(boleta), []);
});

test("barrida: la lista queda firme como la boleta, y las dos se juntan en un mismo escaneo", () => {
  const lista = cuadroLista(
    tarjeta("282000110", NOMBRES[0], "SANTIAGO ARATA 909"),
    tarjeta("282000111", NOMBRES[1], "AGUA SANTA 910"),
  ).join("\n");
  const boleta = [
    "282000112 1 0 1 NOMBRE INVENTADO ARICA",
    "DIRECCION",
    "LA PAZ 911 .",
    "VALOR $ FORMA PAGO DD",
    "0 CTAC 0",
    "==========",
  ].join("\n");
  const votos = [lista, lista, lista, boleta, boleta, boleta].reduce((v, t) => sumarCuadroNomina(v, t), votosNominaVacios());
  const r = resultadoNomina(votos);
  assert.deepEqual(
    r.lineas.map((l) => [l.of, l.destino, l.firme]),
    [
      ["282000110", "SANTIAGO ARATA 909", true],
      ["282000111", "AGUA SANTA 910", true],
      ["282000112", "LA PAZ 911", true],
    ],
  );
  assert.ok(!r.lineas.some((l) => l.of === CONDUCTOR), "el conductor no es un encargo");
});

// ---------------------------------------------------------------------------
// Por pagar: el ícono PxP o COD en verde (APK 1.11.0 mide el color; dueño, 2026-11-20)
// ---------------------------------------------------------------------------

const { sumarCuadroAlBarrido, resultadoDelBarrido } = await import("@/lib/encomiendas/lectura/votos-barrido");
const { porPagarDelCuadro } = await import("@/lib/encomiendas/lectura/cajas-nomina");
const { lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-a-guia");
const { armarGuia } = await import("@/lib/encomiendas/lectura/guia");
const { lineasParaCrear } = await import("@/lib/encomiendas/lectura/telefono-linea");

// Colores como los midió el V2430 en la lista real: verde y gris.
const VERDE = { du: -40, dv: -85 };
const GRIS = { du: 11, dv: -7 };
/** Un cuadro con renglones y cajas; `iconos`: el color de PxP y de COD de cada tarjeta. */
function cuadroConIconos(tarjetas) {
  const renglones = [];
  const poner = (texto, iconos) => renglones.push({ texto, x: 10, y: 40 * renglones.length, ancho: 300, alto: 30, ...(iconos ? { iconos } : {}) });
  for (const { of, direccion, pxp, cod } of tarjetas) {
    poner(of);
    poner("PxP", [{ texto: "PxP", ...pxp }]);
    poner(NOMBRES[0]);
    poner(`${direccion} ARICA COD`, [{ texto: "COD", ...cod }]);
    poner(CONDUCTOR);
    poner("Hoy");
  }
  return renglones;
}

test("por pagar: la tarjeta con PxP o COD en verde, en 2 cuadros o más", () => {
  const cuadro = cuadroConIconos([
    { of: "282000130", direccion: "LA PAZ 930", pxp: VERDE, cod: GRIS },
    { of: "282000131", direccion: "LA PAZ 931", pxp: GRIS, cod: VERDE },
    { of: "282000132", direccion: "LA PAZ 932", pxp: GRIS, cod: GRIS },
  ]);
  assert.deepEqual([...porPagarDelCuadro(cuadro)].sort(), ["282000130", "282000131"]);
  const vacios = { porFilas: votosNominaVacios(), comoLlegan: votosNominaVacios() };
  const tres = [cuadro, cuadro, cuadro].reduce((v, c) => sumarCuadroAlBarrido(v, c), vacios);
  const r = resultadoDelBarrido(tres);
  assert.deepEqual(r.lineas.map((l) => [l.of, l.porPagar]), [["282000130", true], ["282000131", true], ["282000132", false]]);
  // Un solo cuadro verde (un reflejo) no alcanza.
  const unVerde = sumarCuadroAlBarrido(
    [cuadroConIconos([{ of: "282000130", direccion: "LA PAZ 930", pxp: GRIS, cod: GRIS }]), cuadro].reduce((v, c) => sumarCuadroAlBarrido(v, c), vacios),
    cuadroConIconos([{ of: "282000130", direccion: "LA PAZ 930", pxp: GRIS, cod: GRIS }]),
  );
  assert.equal(resultadoDelBarrido(unVerde).lineas.find((l) => l.of === "282000130").porPagar, false);
  // Y llega a lo que se crea, sin monto: ese lo da la etiqueta.
  const leido = lineasDelBarrido(r);
  const guia = armarGuia(leido.lineas, null, null);
  assert.deepEqual(
    lineasParaCrear(guia.lineas).map((l) => [l.of, l.porPagar ?? false]),
    [["282000130", true], ["282000131", true], ["282000132", false]],
  );
});

test("por pagar: sin color medido (APK anterior o la boleta) no se marca nada", () => {
  const sinColor = cuadroConIconos([{ of: "282000133", direccion: "LA PAZ 933", pxp: VERDE, cod: GRIS }]).map((r) => ({ ...r, iconos: undefined }));
  assert.equal(porPagarDelCuadro(sinColor).size, 0);
});

test("las tarjetas se marcan sobre la cámara enteras", () => {
  const renglones = cuadroLista(tarjeta("282000113", NOMBRES[0], "LA PAZ 912")).map((texto, i) => ({
    texto,
    x: 10,
    y: 40 * i,
    ancho: 300,
    alto: 30,
  }));
  const cajas = cajasDelCuadro(renglones).filter((c) => c.of === "282000113");
  assert.equal(cajas.length, 1);
  assert.equal(cajas[0].entero, true);
  assert.equal(cajas[0].alto, 40 * 3 + 30, "de la OF a la dirección");
});
