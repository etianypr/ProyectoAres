// Terreno 2026-11-23: una parada quedó pegada a una calle de la que no se sale con
// las reglas de giro. Sin camino, la línea entera la dibujaba ORS (con una vuelta
// en U en cada parada) y la parada quedaba puesta a ciegas. Ahora las paradas solo
// se pegan a la parte conexa de la red (geo/red/conexa.ts): la componente fuerte
// más grande, medida sobre arcos y con las reglas de `giro`.
//
// La red de juguete: la grilla de 3 × 3 (red-de-juguete.mjs), una calle de un
// sentido que sale del cruce 5 hacia el este a un pasaje del que no se vuelve
// (9 — 10), y una isla más lejos (11 — 12).
//
//     0 — 1 — 2
//     |   |   |
//     3 — 4 — 5 → 9 — 10          11 — 12
//     |   |   |
//     6 — 7 — 8
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armarRed, arcoValido, SIN_PARADA } from "@/lib/geo/red/grafo";
import { RED_ARICA } from "@/lib/geo/red/red-arica";
import { aristaConexa, arcoConexo, sentidosDePaso } from "@/lib/geo/red/conexa";
import { pegarALaRed } from "@/lib/geo/red/pegar";
import { origenDelUltimoTrazado, rutaPorCalles } from "@/lib/geo/ruta-por-calles";
import { CUADRA, en, grilla, RESIDENCIAL, UN_SENTIDO } from "./red-de-juguete.mjs";

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
const CENTRAL = DIA.puntos[0];

function deJuguete() {
  return grilla(3, 3, {
    extra: {
      nodos: [en(1, 3), en(1, 4), en(-6, 8), en(-6, 9)],
      aristas: [
        [5, 9, RESIDENCIAL | UN_SENTIDO],
        [9, 10],
        [11, 12],
      ],
    },
  });
}

test("conexa: lo que no deja volver y las islas quedan fuera; la grilla entera, dentro", () => {
  const { red, arista } = deJuguete();
  for (const [a, b] of [[0, 1], [3, 4], [4, 5], [2, 5], [7, 8]]) assert.ok(aristaConexa(red, arista(a, b)), `${a}—${b}`);
  assert.equal(aristaConexa(red, arista(5, 9)), false, "la de un sentido que lleva a la trampa");
  assert.equal(aristaConexa(red, arista(9, 10)), false, "el pasaje del que no se vuelve");
  assert.equal(aristaConexa(red, arista(11, 12)), false, "la isla");
});

test("pegarALaRed: junto a la trampa, la parada va a la calle conexa más cercana", () => {
  const { red, arista } = deJuguete();
  // 11 m al norte de la mitad del pasaje 9 — 10: antes se pegaba ahí.
  const p = pegarALaRed(red, { lat: en(1, 3.5).lat + CUADRA / 10, lng: en(1, 3.5).lng });
  assert.ok(p, "sin calle");
  assert.notEqual(p.arista, arista(9, 10));
  assert.notEqual(p.arista, arista(5, 9));
  assert.ok(aristaConexa(red, p.arista));
  // Junto a la isla, a más de 400 m de toda calle conexa: ninguna.
  assert.equal(pegarALaRed(red, { lat: en(-6, 8.5).lat + CUADRA / 10, lng: en(-6, 8.5).lng }), null);
});

const arica = armarRed(RED_ARICA);

test("red de Arica: casi toda es conexa, y una parada junto a una trampa de la ciudad tiene camino", async (t) => {
  let fuera = 0;
  for (let k = 0; k < arica.nAristas; k++) if (!aristaConexa(arica, k)) fuera++;
  assert.ok(fuera > 0 && fuera < arica.nAristas * 0.03, `${fuera} aristas fuera de ${arica.nAristas}`);

  // Una calle de la ciudad (no una huella) donde antes se podía parar y de la que no se sale.
  let trampa = -1;
  for (let k = 0; k < arica.nAristas && trampa < 0; k++) {
    const lat = (arica.lat[arica.desde[k]] + arica.lat[arica.hasta[k]]) / 2;
    const lng = (arica.lng[arica.desde[k]] + arica.lng[arica.hasta[k]]) / 2;
    const enLaCiudad = lat > -18.52 && lat < -18.44 && lng > -70.34 && lng < -70.27;
    if (enLaCiudad && !aristaConexa(arica, k) && !(arica.codigo[k] & SIN_PARADA) && (arica.codigo[k] & 15) !== 8) trampa = k;
  }
  assert.ok(trampa >= 0, "no hay trampas en la ciudad: revisar la prueba");
  const punto = {
    lat: (arica.lat[arica.desde[trampa]] + arica.lat[arica.hasta[trampa]]) / 2,
    lng: (arica.lng[arica.desde[trampa]] + arica.lng[arica.hasta[trampa]]) / 2,
  };
  const p = pegarALaRed(arica, punto);
  assert.ok(p && p.arista !== trampa && aristaConexa(arica, p.arista));

  // La ruta con esa parada la dibuja la red propia, sin consultar a nadie.
  const original = globalThis.fetch;
  const consultas = [];
  globalThis.fetch = async (entrada) => {
    consultas.push(String(entrada));
    throw new TypeError("sin red");
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  const ruta = await rutaPorCalles([CENTRAL, DIA.puntos[3], punto, DIA.puntos[4], CENTRAL]);
  assert.ok(ruta, "sin trazado");
  assert.equal(origenDelUltimoTrazado(), "red");
  assert.equal(consultas.length, 0);
  assert.equal(ruta.tramos.length, 4);
});

test("sentidosDePaso: en una calle de doble sentido con un lado que entra a una trampa, solo el otro", () => {
  let vistas = 0;
  for (let k = 0; k < arica.nAristas; k++) {
    const validos = [0, 1].filter((s) => arcoValido(arica, 2 * k + s));
    const conexos = validos.filter((s) => arcoConexo(arica, 2 * k + s));
    if (validos.length === 2 && conexos.length === 1) {
      vistas++;
      assert.deepEqual(sentidosDePaso(arica, k), conexos);
    }
  }
  assert.ok(vistas > 0, "ninguna calle así: revisar la prueba");
});
