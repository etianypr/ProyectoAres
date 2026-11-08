// «Copiar anonimizado» (spec 021, US3, T008): una etiqueta real que falló pasa a
// ser una prueba sin datos de nadie. Se comprueba que no quede ninguna palabra ni
// número de los valores, que la forma siga igual (es lo que la prueba tiene que
// reproducir) y que el lector le saque lo mismo que al original. Datos inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { anonimizarEtiqueta } = await import("@/lib/encomiendas/lectura/etiqueta/anonimizar");
const { leerEtiqueta } = await import("@/lib/encomiendas/lectura/etiqueta");

const fixture = (n) => readFileSync(new URL(`./fixtures/lectura/${n}`, import.meta.url), "utf8");

/** Azar con semilla (mulberry32): el mismo resultado en cada corrida. */
function azarFijo(semilla = 7) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POR_PAGAR = fixture("etiqueta-por-pagar.txt");

test("no queda ninguna palabra ni número de los valores", () => {
  const anonimo = anonimizarEtiqueta(POR_PAGAR, azarFijo());
  for (const valor of ["JUAN", "PEREZ", "SOTO", "PINOS", "TIENDA", "PRUEBA", "SPA", "tienda", "ejemplo"]) {
    assert.doesNotMatch(anonimo, new RegExp(`\\b${valor}\\b`), `quedó «${valor}»`);
  }
  for (const numero of ["1234 5678", "11.111.111", "200000002", "12.990"]) {
    assert.equal(anonimo.includes(numero), false, `quedó «${numero}»`);
  }
});

test("la forma queda igual: renglones, largos, signos y palabras clave", () => {
  const anonimo = anonimizarEtiqueta(POR_PAGAR, azarFijo());
  const original = POR_PAGAR.split("\n");
  const nuevo = anonimo.split("\n");
  assert.equal(nuevo.length, original.length);
  for (const [i, renglon] of original.entries()) {
    assert.equal(nuevo[i].length, renglon.length, `cambió el largo del renglón ${i + 1}`);
    assert.equal(nuevo[i].replace(/[\p{L}\p{N}]/gu, "·"), renglon.replace(/[\p{L}\p{N}]/gu, "·"), "se movió un signo");
  }
  for (const clave of ["starken", "EXPRES", "O.F.", "DESTINATARIO:", "Tel.", "DIRECCIÓN:", "PASAJE", "ARICA", "REMITENTE:", "R.U.T.:", "correo:", "POR PAGAR", "Total Monto O.F. $", "Bulto N° 001/002", "Peso 1,2 kg"]) {
    assert.ok(anonimo.includes(clave), `se perdió la palabra clave «${clave}»`);
  }
});

test("el lector le saca lo mismo que al original: nombre, celular, POR PAGAR con monto y bultos", () => {
  const original = leerEtiqueta(POR_PAGAR);
  const anonimo = leerEtiqueta(anonimizarEtiqueta(POR_PAGAR, azarFijo()));
  assert.ok(anonimo.destinatario && anonimo.destinatario !== original.destinatario);
  assert.match(anonimo.telefono ?? "", /^\+569\d{8}$/, "el celular sigue siendo un celular");
  assert.notEqual(anonimo.telefono, original.telefono);
  assert.equal(anonimo.porPagar, true);
  assert.ok(anonimo.montoPorPagar > 0 && anonimo.montoPorPagar !== original.montoPorPagar);
  assert.deepEqual([anonimo.bulto, anonimo.bultosTotal], [original.bulto, original.bultosTotal]);
  assert.deepEqual(anonimo.dudosos, original.dudosos);
});

test("los errores del lector en las palabras clave se conservan (es lo que la prueba reproduce)", () => {
  const texto = "Te1. 9 8765 4321\nTotal Monto 0.F. $ 15.000\nDESTlNATARIO: ANA ROJAS";
  const anonimo = anonimizarEtiqueta(texto, azarFijo());
  assert.ok(anonimo.startsWith("Te1. 9 "), "el celular conserva su 9");
  assert.ok(anonimo.includes("Total Monto 0.F. $ "));
  assert.ok(anonimo.includes("DESTlNATARIO: "));
  assert.doesNotMatch(anonimo, /ANA|ROJAS|8765|4321|15\.000/);
});

test("el código de Starken conserva su prefijo fijo y el bulto; la OF cambia", () => {
  const codigo = "92000022561234200000002001";
  const anonimo = anonimizarEtiqueta(codigo, azarFijo());
  assert.equal(anonimo.length, 26);
  assert.ok(anonimo.startsWith("9200002256"));
  assert.ok(anonimo.endsWith("001"));
  assert.equal(anonimo.slice(14, 23).includes("200000002"), false);
});

test("ceros, números cortos, la K del RUT y el fijo de Arica", () => {
  const texto = "Total Monto O.F. $ 0\nOF 007000123\nR.U.T.: 9.876.543-K\nFono 58 222 3344\nDepto 12";
  const anonimo = anonimizarEtiqueta(texto, azarFijo());
  assert.ok(anonimo.includes("$ 0\n"), "un monto en 0 sigue en 0: es lo que marca «por revisar»");
  assert.match(anonimo, /OF 00[1-9]\d{6}\n/, "los ceros a la izquierda quedan");
  assert.match(anonimo, /R\.U\.T\.: \d\.\d{3}\.\d{3}-K\n/);
  assert.doesNotMatch(anonimo, /9\.876\.543/);
  assert.match(anonimo, /Fono 58 \d{3} \d{4}\n/);
  assert.doesNotMatch(anonimo, /222 3344/);
  assert.ok(anonimo.endsWith("Depto 12"), "un número de hasta 3 dígitos sin su calle no dice quién es");
});

test("la OF impresa con comas también cambia (terreno 2026-11-08: pasaba entera)", () => {
  const anonimo = anonimizarEtiqueta("O.F.\n200,000,456\nPeso 1,2 kg", azarFijo());
  const grupos = anonimo.split("\n")[1].split(",");
  assert.deepEqual(
    grupos.map((g, i) => g === ["200", "000", "456"][i]),
    [false, false, false],
    "ningún grupo de la OF quedó igual",
  );
  assert.match(anonimo, /^O\.F\.\n[1-9]\d{2},\d{3},\d{3}\n/, "queda con la misma forma");
  assert.ok(anonimo.endsWith("Peso 1,2 kg"), "un peso corto no dice quién es");
});

test("los teléfonos salen inventados a la vista (1234…, 2345…), nunca al azar", () => {
  const anonimo = anonimizarEtiqueta("Tel. 987 654 321\nTELÉFONO : 976543210\nFono 58 222 3344", azarFijo());
  assert.equal(anonimo, "Tel. 912 345 678\nTELÉFONO : 923456789\nFono 58 345 6789");
  assert.equal(anonimizarEtiqueta("Tel. 912345678", azarFijo()), "Tel. 923456789", "nunca igual al original");
});

test("cada vez sale distinto (sin semilla), pero nunca igual al original", () => {
  const a = anonimizarEtiqueta(POR_PAGAR);
  const b = anonimizarEtiqueta(POR_PAGAR);
  assert.notEqual(a, POR_PAGAR);
  assert.notEqual(a, b);
});
