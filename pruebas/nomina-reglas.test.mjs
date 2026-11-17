// Spec 036, otras reglas para que la OF quede firme, solo medidas en Diagnóstico (en vivo
// sigue la de siempre: cada dígito 3 veces y en 2 de cada 3). OF y nombres inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { barrer, hojaDe, nominaInventada } from "./barrido-sintetico.mjs";

const { resultadoNomina, sumarCuadroNomina, votosNominaVacios } = await import("@/lib/encomiendas/lectura/barrido-nomina");
const { sumarCuadroAlBarrido, elegirVotosDelBarrido } = await import("@/lib/encomiendas/lectura/votos-barrido");
const { anotarReglas, compararReglas, medidaReglasVacia } = await import("@/lib/encomiendas/lectura/reglas-nomina");
const { pesoDeConfianza } = await import("@/lib/encomiendas/lectura/bloques-nomina");

const guia = (of) => `OF:${of} DESTINO:21 DE MAYO 123`;
/** Cuadros con una sola OF, cada uno con la confianza de cada dígito. */
const conPesos = (lecturas) =>
  lecturas.reduce((v, [of, conf]) => sumarCuadroNomina(v, guia(of), new Map([[of, conf]]), { reglas: true }), votosNominaVacios());
/** La confianza de cada dígito: alta en todos, salvo `en` la posición `i`. */
const confianza = (i, en) => Array.from({ length: 9 }, (_, j) => (j === i ? en : 0.95));

test("el peso de un dígito por su confianza: 0 hasta 0,5, con tope, y sin confianza como 0,85", () => {
  assert.equal(pesoDeConfianza(0.5), 0);
  assert.equal(pesoDeConfianza(0.3), 0);
  assert.ok(Math.abs(pesoDeConfianza(0.66) - Math.log(0.66 / 0.34)) < 1e-9);
  assert.equal(pesoDeConfianza(1), pesoDeConfianza(0.97));
  assert.equal(pesoDeConfianza(null), pesoDeConfianza(0.85));
});

test("la OF con un «8» que se lee «6» o «0» 4 de cada 10 veces: la de siempre no confirma, las otras sí", () => {
  // Medido en la spec 034: bien con 0,66 de confianza y mal con 0,54.
  const bien = ["280000123", confianza(1, 0.66)];
  const v = conPesos([bien, ["260000123", confianza(1, 0.54)], bien, ["200000123", confianza(1, 0.54)], bien, bien, ["260000123", confianza(1, 0.54)], bien, ["200000123", confianza(1, 0.54)], bien]);
  const decidir = (regla) => resultadoNomina(v, { regla }).lineas.map((l) => [l.of, l.firme]);
  assert.deepEqual(decidir("dosDeTres"), [["280000123", false]], "6 de 10: no llega a 2 de cada 3");
  assert.deepEqual(decidir("confianza06"), [["280000123", true]]);
  assert.deepEqual(decidir("ponderada"), [["280000123", true]]);
});

test("dos lecturas que se contradicen con confianza alta no confirman con ninguna regla", () => {
  const ocho = ["280000123", confianza(1, 0.9)];
  const seis = ["260000123", confianza(1, 0.9)];
  const v = conPesos([ocho, seis, ocho, seis, ocho, seis]);
  for (const regla of ["dosDeTres", "confianza06", "ponderada"]) {
    assert.deepEqual(resultadoNomina(v, { regla }).lineas.map((l) => l.firme), [false], regla);
  }
});

test("con los pesos anotados, la regla de siempre decide igual que sin ellos (la prueba dorada)", () => {
  const dorada = JSON.parse(readFileSync(new URL("./fixtures/barrido-nomina-100.json", import.meta.url), "utf8"));
  const cuadros = barrer(hojaDe(nominaInventada(100)));
  let votos = { porFilas: votosNominaVacios(), comoLlegan: votosNominaVacios() };
  for (const c of cuadros) votos = sumarCuadroAlBarrido(votos, c.renglones, { reglas: true });
  const r = resultadoNomina(votos.porFilas, { cerca: true });
  assert.deepEqual(
    [r.firmes, r.porConfirmar, r.lista.map((l) => [l.of, l.estado]).join("|")],
    [dorada.porFilas.cifras[0], dorada.porFilas.cifras[1], dorada.porFilas.lista.map((l) => [l[0], l[2]]).join("|")],
  );
});

test("Diagnóstico compara las reglas con cifras, sin ninguna OF, y ninguna confirma con otro número", () => {
  const nomina = nominaInventada(30, 4);
  const cuadros = barrer(hojaDe(nomina), { semilla: 9 });
  const medida = medidaReglasVacia();
  let votos = { porFilas: votosNominaVacios(), comoLlegan: votosNominaVacios() };
  cuadros.forEach((c, i) => {
    votos = sumarCuadroAlBarrido(votos, c.renglones, { reloj: (i + 1) * 280, reglas: true });
    if (i % 3 === 2) anotarReglas(medida, elegirVotosDelBarrido(votos));
  });
  const comparacion = compararReglas(medida, elegirVotosDelBarrido(votos));
  assert.deepEqual(comparacion.map((c) => c.regla), ["dosDeTres", "confianza06", "ponderada"]);
  for (const c of comparacion) {
    assert.equal(c.conOtroNumero, 0, c.regla);
    assert.ok(c.hastaVerde && c.hastaVerde.p50 >= 0 && c.hastaVerde.p90 >= c.hastaVerde.p50, c.regla);
  }
  assert.doesNotMatch(JSON.stringify(comparacion), /\d{7,}/, "sin OF");
});
