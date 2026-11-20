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
