// El zoom del mapa siguiendo al conductor (dueño, 2026-11-09): en camino, más
// abierto; a 250 m o menos de la parada, el de la llegada. Con margen: se suelta
// pasados los 300 m, para que el GPS no lo haga acercarse y alejarse en el borde.
import test from "node:test";
import assert from "node:assert/strict";

const { llegandoAParada, zoomDeSeguimiento, ZOOM_LLEGADA, ZOOM_NAVEGACION } = await import(
  "@/app/(conductor)/conductor/encomiendas/_mapa/camara"
);

test("a 250 m o menos de la parada, el zoom de la llegada; más lejos, el de camino", () => {
  assert.equal(llegandoAParada(250, false), true);
  assert.equal(llegandoAParada(251, false), false);
  assert.equal(zoomDeSeguimiento(0, true), ZOOM_LLEGADA);
  assert.equal(zoomDeSeguimiento(0, false), ZOOM_NAVEGACION);
  assert.ok(ZOOM_NAVEGACION < ZOOM_LLEGADA, "en camino se ve más que al llegar");
});

test("el zoom de la llegada se suelta recién pasados los 300 m", () => {
  assert.equal(llegandoAParada(280, true), true, "el GPS que oscila en el borde no lo suelta");
  assert.equal(llegandoAParada(301, true), false);
  assert.equal(llegandoAParada(null, true), false, "sin parada activa, el de camino");
});

test("en camino y a velocidad, medio nivel más lejos", () => {
  assert.equal(zoomDeSeguimiento(17, false), ZOOM_NAVEGACION - 0.5);
  assert.equal(zoomDeSeguimiento(17, true), ZOOM_LLEGADA, "llegando manda la llegada, aunque vaya rápido");
});
