// El punto de paso para Google Maps (geo/punto-de-paso.ts) y el contador de
// vueltas en U (geo/trazado.ts). Líneas de juguete en metros alrededor de un punto
// de Arica: no son de nadie.
import test from "node:test";
import assert from "node:assert/strict";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { pasoHacia, puntoDePaso } from "@/lib/geo/punto-de-paso";
import { contarVueltasEnU } from "@/lib/geo/trazado";

const BASE = { lat: -18.47, lng: -70.3 };
const M_LAT = 1 / 111_195;
const M_LNG = 1 / (111_195 * Math.cos((BASE.lat * Math.PI) / 180));
/** El punto `x` metros al este y `y` al norte de la base, como [lng, lat]. */
const p = (x, y) => [BASE.lng + x * M_LNG, BASE.lat + y * M_LAT];
const coord = (x, y) => ({ lng: p(x, y)[0], lat: p(x, y)[1] });
const cerca = (real, x, y, margen = 2) => {
  assert.ok(real, "sin punto");
  const d = distanciaMetros(real, coord(x, y));
  assert.ok(d <= margen, `a ${d.toFixed(1)} m de (${x}, ${y})`);
};

test("puntoDePaso: 30 m antes de la última esquina, en la calle por la que se llega", () => {
  // 200 m al este y después 100 m al norte hasta la parada: la esquina está en (200, 0).
  cerca(puntoDePaso([p(0, 0), p(100, 0), p(200, 0), p(200, 50), p(200, 100)]), 170, 0);
});

test("puntoDePaso: sin esquina, 150 m antes (o la mitad del tramo si es más corto)", () => {
  cerca(puntoDePaso([p(0, 0), p(400, 0)]), 250, 0);
  cerca(puntoDePaso([p(0, 0), p(100, 0)]), 50, 0);
  // Una curva suave no es esquina.
  cerca(puntoDePaso([p(0, 0), p(100, 0), p(200, 20), p(300, 40)]), 153, 10.6, 3);
});

test("puntoDePaso: un tramo corto no lleva punto", () => {
  assert.equal(puntoDePaso([p(0, 0), p(60, 0)]), null);
  assert.equal(puntoDePaso([p(0, 0)]), null);
});

test("puntoDePaso: la parada anterior justo antes de la esquina deja el punto pasada la esquina", () => {
  // 20 m al este (desde la parada anterior) y 100 m al norte.
  cerca(puntoDePaso([p(0, 0), p(20, 0), p(20, 100)]), 20, 15);
});

test("puntoDePaso: si la ruta pasa la parada y da la vuelta en U, el punto va entre la vuelta y la parada", () => {
  // Llega por el oeste, sigue 60 m al este de la parada, da la vuelta y vuelve a ella.
  cerca(puntoDePaso([p(-300, 0), p(60, 0), p(0, 0)]), 45, 0);
  // Con la vuelta muy cerca de la parada, sin punto.
  assert.equal(puntoDePaso([p(-300, 0), p(20, 0), p(0, 0)]), null);
});

test("pasoHacia: solo si la línea guardada es la del orden de ahora", () => {
  const trazado = [p(0, 0), p(200, 0), p(200, 100), p(400, 100), p(400, 300), p(0, 300), p(0, 0)];
  const tramos = [
    { pedidoId: "a", desde: 0, hasta: 2, metros: 300, segundos: 60 },
    { pedidoId: "b", desde: 2, hasta: 4, metros: 400, segundos: 80 },
    { pedidoId: "c", desde: 4, hasta: 5, metros: 400, segundos: 80 },
    { pedidoId: null, desde: 5, hasta: 6, metros: 300, segundos: 60 },
  ];
  const ruta = { orden: ["a", "b", "c"], trazado, tramos };
  const todas = new Set(["a", "b", "c"]);
  // Hacia b: 200 m al este por y = 100 y doblando al norte en (400, 100).
  cerca(pasoHacia(ruta, "b", todas), 370, 100);
  // Con a entregada (lo cerrado va primero en el orden), lo mismo.
  cerca(pasoHacia(ruta, "b", new Set(["b", "c"])), 370, 100);
  // Un pedido sin ubicar en el orden no está en la línea: no importa.
  cerca(pasoHacia({ ...ruta, orden: ["a", "x", "b", "c"] }, "b", todas), 370, 100);
  // «Dejar como pendiente» movió b al final y la línea todavía no se vuelve a trazar.
  assert.equal(pasoHacia({ ...ruta, orden: ["a", "c", "b"] }, "b", todas), null);
  // «Ahora» adelantó c: su tramo llega desde b, que ya no va antes.
  assert.equal(pasoHacia({ ...ruta, orden: ["a", "c", "b"] }, "c", new Set(["b", "c"])), null);
  // Rutas guardadas antes de la spec 020, sin tramos.
  assert.equal(pasoHacia({ ...ruta, tramos: null }, "b", todas), null);
  assert.equal(pasoHacia(null, "b", todas), null);
});

test("pasoHacia: entregar otra parada fuera de orden no le quita el punto a las demás (V2430, 2026-11-26)", () => {
  const trazado = [p(0, 0), p(200, 0), p(200, 100), p(400, 100), p(400, 300), p(0, 300), p(0, 500), p(0, 0)];
  const tramos = [
    { pedidoId: "a", desde: 0, hasta: 2, metros: 300, segundos: 60 },
    { pedidoId: "b", desde: 2, hasta: 4, metros: 400, segundos: 80 },
    { pedidoId: "c", desde: 4, hasta: 5, metros: 400, segundos: 80 },
    { pedidoId: "d", desde: 5, hasta: 6, metros: 200, segundos: 40 },
    { pedidoId: null, desde: 6, hasta: 7, metros: 500, segundos: 90 },
  ];
  // Se entregó c antes que b (desde «Siguientes paradas»): el orden guardado la pone primero.
  const ruta = { orden: ["c", "a", "b", "d"], trazado, tramos };
  const pendientes = new Set(["a", "b", "d"]);
  assert.ok(pasoHacia(ruta, "a", pendientes));
  cerca(pasoHacia(ruta, "b", pendientes), 370, 100);
  // Hacia d: recto 200 m al norte, sin esquina: la mitad del tramo.
  cerca(pasoHacia(ruta, "d", pendientes), 0, 400);
});

test("contarVueltasEnU: en la misma calle y por el bandejón; una esquina o la vuelta a la manzana no", () => {
  assert.equal(contarVueltasEnU([p(0, 0), p(100, 0), p(0, 0)]), 1);
  // Por la abertura del bandejón: al este, 30 m al sur y al oeste.
  assert.equal(contarVueltasEnU([p(0, 0), p(100, 0), p(100, -30), p(0, -30)]), 1);
  assert.equal(contarVueltasEnU([p(0, 0), p(100, 0), p(100, 100)]), 0);
  assert.equal(contarVueltasEnU([p(0, 0), p(100, 0), p(100, 100), p(0, 100)]), 0);
  // Dos vueltas en la misma línea.
  assert.equal(contarVueltasEnU([p(0, 0), p(100, 0), p(0, 0), p(0, 200), p(0, 100)]), 2);
});
