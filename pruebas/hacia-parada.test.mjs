// Cuánto falta hasta la parada sin pedir ninguna ruta (spec 020): por el tramo de
// la línea del día que llega a ella, o en línea recta si el auto no va por él.
// Puntos inventados en Arica.
import test from "node:test";
import assert from "node:assert/strict";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { ajustarATrazado } from "@/lib/geo/trazado";
import { haciaParada, tramoHacia } from "@/lib/geo/hacia-parada";

// Una L: 4 vértices hacia el este y después 3 hacia el sur.
const TRAZADO = [
  [-70.3, -18.47],
  [-70.299, -18.47],
  [-70.298, -18.47],
  [-70.297, -18.47],
  [-70.297, -18.471],
  [-70.297, -18.472],
  [-70.297, -18.473],
];
const RUTA = {
  trazado: TRAZADO,
  tramos: [
    { pedidoId: "a", desde: 0, hasta: 3, metros: 315, segundos: 60 },
    { pedidoId: "b", desde: 3, hasta: 6, metros: 330, segundos: 90 },
  ],
};
const B = { lat: -18.473, lng: -70.297 };

test("tramoHacia: el pedazo de la línea del día que llega a la parada", () => {
  const t = tramoHacia(RUTA, "b");
  assert.deepEqual(t.linea, TRAZADO.slice(3, 7));
  assert.equal(t.metros, 330);
  assert.equal(tramoHacia(RUTA, "c"), null, "una parada que no está en la línea");
  assert.equal(tramoHacia({ trazado: TRAZADO }, "b"), null, "ruta guardada antes de la 020, sin tramos");
  assert.equal(tramoHacia({ trazado: TRAZADO, tramos: [{ pedidoId: "b", desde: 5, hasta: 40, metros: 1, segundos: 1 }] }, "b"), null, "índices que no calzan");
});

test("haciaParada: por el tramo, los metros siguen la calle y los segundos son proporcionales", () => {
  const tramo = tramoHacia(RUTA, "b");
  const enLaMitad = { lat: -18.4715, lng: -70.297 };
  const pegado = ajustarATrazado(enLaMitad, tramo.linea);
  const r = haciaParada(enLaMitad, B, tramo, pegado);
  assert.equal(r.porTramo, true);
  assert.ok(Math.abs(r.metros - 166) <= 2, `faltan ~166 m, dio ${r.metros}`);
  assert.ok(Math.abs(r.segundos - Math.round((90 * r.metros) / 330)) <= 1);
  assert.equal(r.porDelante[0][1], pegado.lat, "la línea naranja arranca en el punto pegado");
  assert.deepEqual(r.porDelante.at(-1), TRAZADO[6], "y termina en la parada");
  assert.ok(r.rumbo > 170 && r.rumbo < 190, "el camino sigue hacia el sur");
});

test("haciaParada: fuera del tramo, en línea recta y sin segundos, línea ni rumbo", () => {
  const lejos = { lat: -18.48, lng: -70.31 };
  const r = haciaParada(lejos, B, tramoHacia(RUTA, "b"), null);
  assert.equal(r.porTramo, false);
  assert.equal(r.metros, Math.round(distanciaMetros(lejos, B)));
  assert.equal(r.segundos, null);
  assert.equal(r.porDelante, null);
  assert.equal(r.rumbo, null);
});

test("haciaParada: sin tramos (ruta vieja) también da los metros en línea recta", () => {
  const cerca = { lat: -18.4728, lng: -70.297 };
  const r = haciaParada(cerca, B, null, null);
  assert.equal(r.porTramo, false);
  assert.ok(r.metros > 0 && r.metros < 30);
});

test("la línea recta nunca es más que por la calle (por eso no se usa para el aviso de 300 m)", () => {
  const tramo = tramoHacia(RUTA, "a");
  const salida = { lat: -18.47, lng: -70.2999 };
  const porCalle = haciaParada(salida, { lat: -18.47, lng: -70.297 }, tramo, ajustarATrazado(salida, tramo.linea));
  const recta = haciaParada(salida, { lat: -18.47, lng: -70.297 }, null, null);
  assert.ok(recta.metros <= porCalle.metros + 1);
});
