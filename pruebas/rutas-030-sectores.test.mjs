// Spec 030 (dueño, 2026-11-12): el orden de la ruta ya no cobra por cambiar de barrio
// («cada zona una sola vez») ni por sectores; manda el costo solo. Los sectores del
// plano municipal quedan como dato (geo/sectores-arica.ts) para decir a cuál va cada
// bulto al escanear.
//
// Lo que se prueba: el sector de un punto, y que el armado no usa zonas ni sectores
// (generar-ruta/zonas.ts se borró el 2026-11-12).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectorDe, SECTORES_ARICA } from "@/lib/geo/sectores-arica";

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));

test("sectorDe: lugares públicos conocidos caen en su sector, y siempre hay sector", () => {
  // El Morro y la plaza de la catedral.
  assert.equal(sectorDe({ lat: -18.4803, lng: -70.3239 }), "Centro");
  assert.equal(sectorDe({ lat: -18.4783, lng: -70.3207 }), "Centro");
  // El terminal de buses, al norte del río San José.
  assert.equal(sectorDe({ lat: -18.4728, lng: -70.299 }), "San José");
  // En el mar frente a Chinchorro: fuera de todos, toma el del borde más cercano.
  assert.equal(sectorDe({ lat: -18.456, lng: -70.31 }), "Borde Costero");
  // Los puntos del día simulado: todos con un sector de la lista.
  for (const p of DIA.puntos) assert.ok(SECTORES_ARICA.includes(sectorDe(p)));
});

test("el armado de la ruta no cobra por cambiar de barrio ni de sector", () => {
  const armado = readFileSync(new URL("../src/lib/encomiendas/local/generar-ruta/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(armado, /from "\.\/zonas"/, "el armado volvió a usar las zonas de barrio");
  assert.doesNotMatch(armado, /sectores-arica|from "\.\/sectores"/, "el armado usa los sectores");
});
