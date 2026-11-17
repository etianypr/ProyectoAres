// Spec 036, los bultos de la nómina (dueño, 2026-11-16: «en la boleta el total no es total
// de OF sino de bultos; si el número que da el barrido concuerda con la boleta, se leyó
// todo»). La columna BULTOS de cada encargo se vota entre cuadros, el TOTAL BULTOS del pie
// vale leído dos veces, y los bultos pasan a la guía y al pedido. Calles reales con
// números, OF y nombres inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { barrer, hojaDe, nominaInventada } from "./barrido-sintetico.mjs";

const { bultosDeRenglon, totalDeBultos, bloquesNomina } = await import("@/lib/encomiendas/lectura/nomina");
const { resultadoNomina, sumarCuadroNomina, votosNominaVacios, lineasDelBarrido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
const { sumarCuadroAlBarrido, resultadoDelBarrido } = await import("@/lib/encomiendas/lectura/votos-barrido");
const { armarGuia } = await import("@/lib/encomiendas/lectura/guia");
const { lineasParaCrear } = await import("@/lib/encomiendas/lectura/telefono-linea");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

/** Un encargo de la nómina como lo junta «por filas», con su fila de números. */
const encargo = (fila, direccion = "21 DE MAYO 123 .") =>
  ["NUMERO ENCARGOS", "OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA", fila, "DIRECCION", direccion, "VALOR $ FORMA PAGO DD", "0 CTAC 0"].join("\n");
const sumar = (cuadros) => cuadros.reduce((v, texto) => sumarCuadroNomina(v, texto), votosNominaVacios());

test("la columna BULTOS sale de la fila del encargo, también con el TOTAL pegado a la OF", () => {
  assert.equal(bultosDeRenglon("200000001 1 0 1 JUAN PEREZ ARICA"), 1);
  assert.equal(bultosDeRenglon("200000001 2 0 2 JUAN PEREZ ARICA"), 2);
  assert.equal(bultosDeRenglon("200000001 1 0 12 ANA SOTO ARICA"), 12);
  assert.equal(bultosDeRenglon("2000000011 0 1 MARIA ROJAS"), 1, "el TOTAL pegado: DOCTOS y BULTOS");
  assert.equal(bultosDeRenglon("2000000023 1 2 MARIA ROJAS"), 2, "pegado y con documentos");
  assert.equal(bultosDeRenglon("200000001 JUAN PEREZ"), null, "sin los números chicos no se sabe");
  assert.equal(bultosDeRenglon("200000001 1 01 JUAN PEREZ"), null, "con dos números no se sabe cuál es");
  assert.equal(bultosDeRenglon("DIRECCION"), null);
  const [bloque] = bloquesNomina(encargo("200000001 2 0 2 JUAN PEREZ ARICA").split("\n"));
  assert.equal(bloque.bultos, 2);
});

test("el TOTAL BULTOS del pie de la boleta, sin confundirlo con los títulos de las columnas", () => {
  assert.equal(totalDeBultos("TOTAL BULTOS: 52"), 52);
  assert.equal(totalDeBultos("T0TAL BULT0S 117"), 117, "como lo lee ML Kit");
  assert.equal(totalDeBultos("TOTAL DE BULTOS 9"), 9);
  assert.equal(totalDeBultos("OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA"), null);
  assert.equal(totalDeBultos("OF TOTAL BULTOS\n270000001 1 0 1"), null, "no salta de renglón");
});

test("los bultos de una OF valen leídos igual 2 veces y en 2 de cada 3; si no, no se saben y cuentan 1", () => {
  const dos = encargo("200000001 2 0 2 JUAN PEREZ ARICA");
  const sinNumeros = encargo("200000001 JUAN PEREZ ARICA");
  assert.equal(resultadoNomina(sumar([dos, dos, dos])).lineas[0].bultos, 2);
  const unaVez = resultadoNomina(sumar([dos, sinNumeros, sinNumeros]));
  assert.equal(unaVez.lineas[0].bultos, null, "leída una sola vez");
  assert.deepEqual(unaVez.bultos, { leidos: 1, sinLeer: 1 });
  const peleada = resultadoNomina(sumar([dos, dos, encargo("200000001 1 0 1 JUAN PEREZ ARICA"), encargo("200000001 7 0 7 JUAN PEREZ ARICA")]));
  assert.equal(peleada.lineas[0].bultos, null, "2 de 4: no alcanza");
});

test("la suma de bultos es la de las OF leídas: lo que falta confirmar no suma", () => {
  const r = resultadoNomina(
    sumar([
      `${encargo("200000001 2 0 2 JUAN PEREZ ARICA")}\n${encargo("279000500 3 0 3 ANA SOTO ARICA", "BOLOGNESI 300 .")}`,
      encargo("200000001 2 0 2 JUAN PEREZ ARICA"),
      encargo("200000001 2 0 2 JUAN PEREZ ARICA"),
    ]),
  );
  assert.deepEqual(r.lista.map((l) => [l.of, l.estado]), [["200000001", "firme"], ["279000500", "aMedias"]]);
  assert.deepEqual(r.bultos, { leidos: 2, sinLeer: 0 });
});

test("el total de la boleta vale leído igual dos veces y sin empate", () => {
  const conTotal = (n) => `${encargo("200000001 1 0 1 JUAN PEREZ ARICA")}\nTOTAL BULTOS: ${n}`;
  assert.equal(resultadoNomina(sumar([conTotal(52)])).total, null, "leído una vez");
  assert.equal(resultadoNomina(sumar([conTotal(52), conTotal(52), conTotal(58)])).total, 52);
  assert.equal(resultadoNomina(sumar([conTotal(52), conTotal(52), conTotal(58), conTotal(58)])).total, null, "empate");
});

test("barriendo una nómina inventada entera, los bultos leídos calzan con el total del pie", () => {
  const nomina = nominaInventada(12, 5);
  const cuadros = barrer(hojaDe(nomina), { semilla: 3, error: 0.02 });
  let votos = { porFilas: votosNominaVacios(), comoLlegan: votosNominaVacios() };
  for (const c of cuadros) votos = sumarCuadroAlBarrido(votos, c.renglones);
  const r = resultadoDelBarrido(votos);
  const esperados = new Map(nomina.map((e) => [e.of, e.bultos]));
  assert.equal(r.total, nomina.reduce((s, e) => s + e.bultos, 0));
  assert.equal(r.firmes, nomina.length, "con pocos errores se leen todas");
  for (const l of r.lineas) assert.equal(l.bultos, esperados.get(l.of), l.of);
  assert.equal(r.bultos.leidos, r.total);
});

test("los bultos pasan a la línea de la guía, el aviso los cuenta y llegan al pedido", async () => {
  const r = resultadoNomina(
    sumar([0, 1, 2].map(() => `${encargo("200000001 2 0 2 JUAN PEREZ ARICA")}\n${encargo("200000002 1 0 1 ANA SOTO ARICA", "BOLOGNESI 300 .")}`)),
  );
  const leido = lineasDelBarrido(r);
  assert.deepEqual(leido.lineas, [
    { of: "200000001", destino: "21 DE MAYO 123", bultos: 2 },
    { of: "200000002", destino: "BOLOGNESI 300", bultos: 1 },
  ]);
  const guia = armarGuia(leido.lineas, null, 4);
  assert.deepEqual(guia.lineas.map((l) => l.bultos), [2, 1]);
  assert.deepEqual(guia.avisos, ["La nómina indica 4 bultos y se leyeron 3: pueden faltar 1."]);
  assert.deepEqual(armarGuia(leido.lineas, null, 3).avisos, [], "3 bultos: calza");
  // Otra pasada trae la misma OF: los bultos no se pierden aunque quede la otra lectura.
  const unida = armarGuia([...guia.lineas, { of: "200000001", destino: "21 DE MAYO 123" }], null, null);
  assert.equal(unida.lineas[0].bultos, 2);
  // Una guía de despacho (sin bultos) sigue contando una por línea.
  assert.deepEqual(armarGuia([{ of: "200000003", destino: "MAIPU 700" }], null, 2).avisos, [
    "La guía indica 2 y se leyeron 1: pueden faltar 1. Revisa si alguna quedó fuera de la foto.",
  ]);

  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
  const { creados } = await almacen.crearDesdeGuia(
    lineasParaCrear([...guia.lineas, { of: "200000004", destino: "COLON 600", dudosa: false, bultos: 0 }]),
    "2026-11-17",
    { folio: null, origen: "guia_foto" },
  );
  assert.deepEqual(
    creados.map((p) => [p.of, p.bultos]),
    [["200000001", 2], ["200000002", 1], ["200000004", null]],
    "una OF de solo documentos queda sin saber",
  );
});
