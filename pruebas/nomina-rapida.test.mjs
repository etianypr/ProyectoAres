// Spec 036, decidir más rápido: el barrido de la nómina decide lo mismo que antes, más
// barato. La prueba dorada fija lo que daba `resultadoNomina` antes de la spec sobre un
// barrido inventado de 100 OF (barrido-sintetico.mjs: calles reales, OF y nombres
// inventados). Si un cambio de la lectura es a propósito, se regenera con
// ACTUALIZAR_DORADA=1 y se revisa el diff.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { barrer, hojaDe, nominaInventada } from "./barrido-sintetico.mjs";

const bn = await import("@/lib/encomiendas/lectura/barrido-nomina");
const { sumarCuadroAlBarrido, elegirVotosDelBarrido, resultadoDelBarrido } = await import("@/lib/encomiendas/lectura/votos-barrido");

const DORADA = new URL("./fixtures/barrido-nomina-100.json", import.meta.url);

/** Lo que hace `alCuadro` con cada cuadro (use-barrido-nomina.ts): los votos por filas y
 *  como llegan. `alDecidir` corre cada `cada` cuadros, como la revisión de la pantalla. */
function barrerComoLaPantalla(cuadros, { hasta = cuadros.length, cada = 0, alDecidir } = {}) {
  let votos = { porFilas: bn.votosNominaVacios(), comoLlegan: bn.votosNominaVacios() };
  cuadros.slice(0, hasta).forEach((c, i) => {
    votos = sumarCuadroAlBarrido(votos, c.renglones);
    if (cada && (i + 1) % cada === 0) alDecidir?.(votos);
  });
  return votos;
}

const huella = (x) => createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 16);

/** Lo que la spec 036 no puede cambiar de lo que se decide (los campos nuevos no entran). */
function proyectar(r) {
  const deLectura = Object.entries(r.deLectura).sort(([a], [b]) => a.localeCompare(b));
  return {
    cuadros: r.cuadros,
    cifras: [r.firmes, r.porConfirmar, r.unaVez, r.ambiguas, r.ruido, r.malLeidas, r.dobles, r.lecturasCorregidas, r.numerosFirmes, r.digitosLeidos, r.digitosDudosos],
    conteo: r.conteo,
    deLectura: { lecturas: deLectura.length, huella: huella(deLectura) },
    lista: r.lista.map((l) => [l.of, l.destino, l.estado, l.motivo ?? null, l.ofFirme, l.cuadros, l.lecturas, l.cerca ? [l.cerca.digitos, l.cerca.mismoCuadro, l.cerca.mismaDireccion] : null]),
    lineas: r.lineas.map((l) => [l.of, l.destino, l.cuadros, l.firme, l.destinoFirme, l.lecturas]),
  };
}

/** Un renglón por encargo, para que el diff se lea: una tupla (valores, y a lo más listas
 *  de valores adentro) va en una sola línea; una lista de tuplas, una por línea. */
function comoTexto(valor, sangria = "") {
  const primitivo = (x) => x === null || typeof x !== "object";
  const tupla = (x) =>
    Array.isArray(x) && (x.length === 0 || (x.some(primitivo) && x.every((e) => primitivo(e) || (Array.isArray(e) && e.every(primitivo)))));
  if (primitivo(valor) || tupla(valor)) return JSON.stringify(valor);
  const mas = `${sangria} `;
  if (Array.isArray(valor)) return `[\n${valor.map((x) => mas + comoTexto(x, mas)).join(",\n")}\n${sangria}]`;
  const campos = Object.entries(valor).map(([k, x]) => `${mas}${JSON.stringify(k)}: ${comoTexto(x, mas)}`);
  return `{\n${campos.join(",\n")}\n${sangria}}`;
}

const nomina = nominaInventada(100);
const cuadros = barrer(hojaDe(nomina));

function doradaDeHoy() {
  const mitad = barrerComoLaPantalla(cuadros, { hasta: 400 });
  const fin = barrerComoLaPantalla(cuadros);
  return {
    _nota:
      "Barrido inventado (pruebas/barrido-sintetico.mjs: calles reales, OF, números y nombres inventados) y lo que decidía resultadoNomina antes de la spec 036. Se regenera con ACTUALIZAR_DORADA=1 solo si un cambio de la lectura es a propósito.",
    cuadros: cuadros.length,
    mitad: proyectar(bn.resultadoNomina(mitad.porFilas, { cerca: true })),
    porFilas: proyectar(bn.resultadoNomina(fin.porFilas, { cerca: true })),
    comoLlegan: proyectar(bn.resultadoNomina(fin.comoLlegan, { cerca: true })),
  };
}

test("elegir la forma antes de decidir da lo mismo que decidir las dos y comparar (también con empate)", () => {
  const votos = barrerComoLaPantalla(cuadros, { hasta: 300 });
  assert.deepEqual(resultadoDelBarrido(votos), bn.mejorResultado(bn.resultadoNomina(votos.porFilas), bn.resultadoNomina(votos.comoLlegan)));
  const conEnteros = (v, enteros) => ({ ...v, conteo: { enteros, sueltas: 0, abiertas: 0 } });
  const empate = { porFilas: conEnteros(votos.porFilas, 5), comoLlegan: conEnteros(votos.comoLlegan, 5) };
  assert.equal(elegirVotosDelBarrido(empate), empate.porFilas, "empate: por filas, como mejorResultado");
  const masComoLlegan = { porFilas: empate.porFilas, comoLlegan: conEnteros(votos.comoLlegan, 6) };
  assert.equal(elegirVotosDelBarrido(masComoLlegan), masComoLlegan.comoLlegan);
  const sinConteo = { porFilas: { ...votos.porFilas, conteo: undefined }, comoLlegan: { ...votos.comoLlegan, conteo: undefined } };
  assert.equal(elegirVotosDelBarrido(sinConteo), sinConteo.porFilas, "votos guardados antes de la spec 034");
});

test("decidir cada pocos cuadros, con lo guardado de las revisiones anteriores, da lo mismo que decidir de cero", () => {
  let decisiones = 0;
  const votos = barrerComoLaPantalla(cuadros, { cada: 3, alDecidir: (v) => (resultadoDelBarrido(v), decisiones++) });
  const tibio = resultadoDelBarrido(votos, { cerca: true });
  bn.vaciarCachesNomina();
  assert.deepEqual(tibio, resultadoDelBarrido(votos, { cerca: true }));
  assert.ok(decisiones > 250);
});

test("sumar un cuadro no cambia los votos de antes, y lo que no salió en él conserva sus objetos", () => {
  const antes = barrerComoLaPantalla(cuadros, { hasta: 120 });
  const copia = structuredClone(antes);
  const despues = sumarCuadroAlBarrido(antes, cuadros[120].renglones, { reloj: 99_000 });
  assert.deepEqual(antes, copia, "lo guardado se apoya en que nada se muta");
  const delCuadro = new Set(despues.porFilas.delUltimo);
  assert.ok(delCuadro.size > 0);
  for (const [of, o] of Object.entries(antes.porFilas.ofs)) {
    if (delCuadro.has(of)) assert.equal(despues.porFilas.ofs[of].visto, 99_000, of);
    else assert.equal(despues.porFilas.ofs[of], o, of);
  }
});

test("prueba dorada: el barrido de 100 OF decide lo mismo que antes de la spec 036", () => {
  const hoy = doradaDeHoy();
  if (process.env.ACTUALIZAR_DORADA) writeFileSync(DORADA, `${comoTexto(hoy)}\n`);
  const dorada = JSON.parse(readFileSync(DORADA, "utf8"));
  assert.equal(hoy.cuadros, dorada.cuadros, "el barrido inventado cambió: revisar barrido-sintetico.mjs");
  assert.deepEqual(hoy.mitad, dorada.mitad, "a mitad del barrido");
  assert.deepEqual(hoy.porFilas, dorada.porFilas, "al final, por filas");
  assert.deepEqual(hoy.comoLlegan, dorada.comoLlegan, "al final, como llegan");
});
