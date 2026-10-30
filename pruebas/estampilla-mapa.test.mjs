// La estampilla de mapa que dice DÓNDE quedó una dirección (spec 019): una foto
// del mapa, dibujada una vez y guardada por esquina (components/direccion/
// estampilla-mapa.ts). El dibujo necesita WebGL y se prueba en el navegador; acá
// se fija la clave, que decide si la misma esquina vuelve a dibujarse.
import test from "node:test";
import assert from "node:assert/strict";

const { claveEstampilla, ZOOM_PUNTO } = await import("@/components/direccion/estampilla-mapa");

const PUNTO = { lat: -18.478_2, lng: -70.310_5, ancho: 352, alto: 176 };

test("la misma esquina con un decimal de más es la misma foto (~1 m)", () => {
  assert.equal(claveEstampilla(PUNTO), claveEstampilla({ ...PUNTO, lat: PUNTO.lat + 1e-7, lng: PUNTO.lng - 1e-7 }));
});

test("otra esquina, otro tamaño u otro zoom son otra foto", () => {
  const base = claveEstampilla(PUNTO);
  assert.notEqual(base, claveEstampilla({ ...PUNTO, lat: PUNTO.lat + 0.0001 }));
  assert.notEqual(base, claveEstampilla({ ...PUNTO, ancho: 384 }));
  assert.notEqual(base, claveEstampilla({ ...PUNTO, zoom: 15 }));
});

test("sin zoom usa el de la estampilla", () => {
  assert.equal(claveEstampilla(PUNTO), claveEstampilla({ ...PUNTO, zoom: ZOOM_PUNTO }));
});
