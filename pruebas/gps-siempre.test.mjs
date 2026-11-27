// Con ARES guiando, el punto del conductor no se queda quieto (dueño, 2026-11-27): una lectura
// imprecisa o un salto se tiran solo si la última aceptada es reciente (geo/lectura-gps.ts).
// Puntos de juguete en Arica.
import test from "node:test";
import assert from "node:assert/strict";
import { aceptarLectura, MS_REFERENCIA_VIEJA } from "@/lib/geo/lectura-gps";

const base = { lat: -18.47, lng: -70.3, tomadaEn: 0, precisionM: 8 };
const norte = (metros, ms, precisionM = 8) => ({ lat: base.lat + metros / 111_195, lng: base.lng, tomadaEn: ms, precisionM });

test("aceptarLectura: la primera y las normales entran", () => {
  assert.equal(aceptarLectura(null, base), true);
  assert.equal(aceptarLectura(base, norte(10, 1000)), true);
});

test("aceptarLectura: con una referencia reciente, lo impreciso y los saltos se tiran", () => {
  assert.equal(aceptarLectura(base, norte(10, 1000, 120)), false, "120 m de error");
  assert.equal(aceptarLectura(base, norte(500, 1000)), false, "500 m en 1 s");
  assert.equal(aceptarLectura(base, norte(500, 1000), true), true, "el GPS simulado va rápido a propósito");
});

test("aceptarLectura: sin mover el punto en más de 5 s, cualquier lectura entra", () => {
  assert.equal(aceptarLectura(base, norte(10, MS_REFERENCIA_VIEJA + 1, 120)), true);
  assert.equal(aceptarLectura(base, norte(800, MS_REFERENCIA_VIEJA + 1)), true);
});
