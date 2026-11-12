// Spec 031: en un condominio, siempre por su entrada (dueño, 2026-11-12).
//
// Lo que se prueba: que una casa dentro de un condominio se entrega en la entrada
// del condominio aunque una calle pública de atrás quede más cerca del edificio,
// que con dos entradas se usa la más cercana por dentro, que una casa en la calle
// queda como siempre, que una casa con su entrada de auto queda en la boca de esa
// entrada, y que «Navegar» manda a Google Maps a la entrada.
//
// La grilla de 3 × 3 cruces de pruebas/red-de-juguete.mjs, con el condominio al este.
// Sus calles internas son pasajes privados de estacionamiento, como los del 10-11:
// el motor no se detiene en ellos, así que sin la entrada la casa quedaba pegada a
// la calle pública de atrás.
//
//     0 — 1 — 2 ———————— 11
//     |   |   |           |   ← calle pública de atrás (columna 3,2)
//     3 — 4 — 5 ═ 9       |   ═ pasaje privado del condominio
//     |   |   |   ║       |
//     6 — 7 — 8 ———————— 12   (8—12 pasa al sur del condominio, sin tocarlo)
//             └ ┄ ┄ 10        ┄ segunda entrada, 10 ═ 8 (solo en una prueba)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { entregaEn, entradaDelCondominio, esInterna } from "@/lib/geo/red/entrada";
import { pegarALaRed } from "@/lib/geo/red/pegar";
import { apagarRed, cargarRed } from "@/lib/geo/red/grafo";
import { destinoParaNavegar } from "@/lib/geo/ruta-por-calles";
import { matrizConRumbo } from "@/lib/geo/red/matriz-con-rumbo";
import { en, grilla, PRIVADA, SIN_PARADA } from "./red-de-juguete.mjs";

const SERVICIO_SIN_PARADA = 7 | SIN_PARADA; // un pasaje de estacionamiento o una entrada de auto
const PASAJE_PRIVADO = SERVICIO_SIN_PARADA | PRIVADA;

/** La grilla con el condominio: 5 ═ 9 ║ 10 (y 10 ═ 8 si `dosEntradas`), y la calle de atrás. */
function conCondominio({ dosEntradas = false } = {}) {
  const nodos = [en(1, 2.6), en(2, 2.6), en(0, 3.2), en(2, 3.2)]; // 9, 10, 11, 12
  const aristas = [
    [5, 9, PASAJE_PRIVADO],
    [9, 10, PASAJE_PRIVADO],
    [2, 11],
    [11, 12],
    [8, 12],
    ...(dosEntradas ? [[10, 8, PASAJE_PRIVADO]] : []),
  ];
  return grilla(3, 3, { extra: { nodos, aristas } });
}
const cerca = (a, b, metros = 1) => Math.hypot((a.lat - b.lat) * 111_195, (a.lng - b.lng) * 105_400) <= metros;

test("una casa del condominio se entrega en la entrada, aunque la calle de atrás quede más cerca", () => {
  const { red, arista } = conCondominio();
  // El edificio: a 16 m del pasaje privado y a 47 m de la calle de atrás.
  const edificio = en(1.4, 2.75);
  assert.equal(red.desde[pegarALaRed(red, edificio).arista], 11, "sin entrada se pegaría a la calle de atrás");
  const e = entregaEn(red, edificio);
  assert.ok(e.entrada && cerca(e.entrada, en(1, 2)), `la entrada es el cruce 5, no ${JSON.stringify(e.entrada)}`);
  // La parada queda en una calle pública que llega a la entrada.
  assert.equal(esInterna(red, e.arista), false);
  assert.ok([arista(2, 5), arista(4, 5), arista(5, 8)].includes(e.arista), `arista ${e.arista}`);
  assert.equal(red.desde[e.arista] === 5 ? e.fraccion : 1 - e.fraccion, 0);
  assert.ok(cerca(entradaDelCondominio(red, edificio), en(1, 2)));

  // Y de la central (en 0—1) se llega por el frente, sin pasar por la calle de atrás.
  const m = matrizConRumbo(red, [
    { arista: arista(0, 1), fraccion: 0.5, libre: true },
    { arista: e.arista, fraccion: e.fraccion },
  ]);
  const ida = Math.min(...m.estadosDe[1].map((s) => m.metros[s]));
  assert.ok(ida < 330, `${ida.toFixed(0)} m: dio la vuelta por atrás`);
});

test("con dos entradas, la más cercana por dentro", () => {
  const { red } = conCondominio({ dosEntradas: true });
  // Más cerca de 10: por dentro hay 107 m hasta la entrada de 8 y 130 m hasta la de 5.
  const e = entregaEn(red, en(1.6, 2.75));
  assert.ok(e.entrada && cerca(e.entrada, en(2, 2)), `la entrada es el cruce 8, no ${JSON.stringify(e.entrada)}`);
});

test("una casa en la calle queda como siempre", () => {
  const { red } = conCondominio();
  const casa = en(1.1, 0.5); // 11 m al sur de la calle 3—4
  const e = entregaEn(red, casa);
  const pegado = pegarALaRed(red, casa);
  assert.equal(e.entrada, null);
  assert.equal(e.arista, pegado.arista);
  assert.equal(e.fraccion, pegado.fraccion);
});

test("una casa con su propia entrada de auto queda en la calle, en la boca de esa entrada", () => {
  // Una entrada de auto que sale del cruce 3 hacia el oeste (nodo 9), y la casa al lado.
  const { red } = grilla(3, 3, { extra: { nodos: [en(1, -0.2)], aristas: [[3, 9, SERVICIO_SIN_PARADA]] } });
  const e = entregaEn(red, en(0.97, -0.25));
  assert.ok(e.entrada && cerca(e.entrada, en(1, 0)), `la boca es el cruce 3, no ${JSON.stringify(e.entrada)}`);
  assert.equal(esInterna(red, e.arista), false);
});

test("Navegar: con el mapa de Arica cargado, la entrada del condominio; sin él, el punto de la casa", async (t) => {
  t.after(() => apagarRed(false));
  const red = await cargarRed();
  assert.ok(red, "no se cargó la red de Arica");
  // Un punto del mapa (no de una persona): el medio de un pasaje interno de algún
  // condominio cuya entrada quede a más de 60 m.
  let punto = null;
  let entrada = null;
  for (let k = 0; k < red.nAristas && !punto; k++) {
    if (!(red.codigo[k] & PRIVADA) || red.largo[k] < 40) continue;
    const medio = { lat: (red.lat[red.desde[k]] + red.lat[red.hasta[k]]) / 2, lng: (red.lng[red.desde[k]] + red.lng[red.hasta[k]]) / 2 };
    const e = entradaDelCondominio(red, medio);
    if (e && !cerca(e, medio, 60)) {
      punto = medio;
      entrada = e;
    }
  }
  assert.ok(punto, "no hay ningún condominio en la red de Arica");
  assert.deepEqual(destinoParaNavegar(punto), entrada);
  // Una casa en la calle: su punto, tal cual.
  const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
  const enLaCalle = DIA.puntos.find((p) => !entradaDelCondominio(red, p));
  assert.deepEqual(destinoParaNavegar(enLaCalle), enLaCalle);
  // Con el mapa propio apagado (Diagnóstico), el punto de la casa.
  apagarRed(true);
  assert.deepEqual(destinoParaNavegar(punto), punto);
});
