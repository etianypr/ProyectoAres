// Navegar con Google hasta la parada (spec 019). Sin la APK, o en una APK que no
// trae el plugin, se abre Google Maps como antes: el conductor nunca se queda sin
// cómo llegar. Lo nativo (la pantalla de Google) se prueba en el teléfono.
import test from "node:test";
import assert from "node:assert/strict";

const abiertos = [];
globalThis.window = { open: (url) => abiertos.push(url), location: { href: "" } };

const { navegarConGoogle, navegandoConGoogle, alCambiarNavegacion } = await import("@/lib/nativo/navegacion");

const PARADA = { lat: -18.4783, lng: -70.3126 };
const FRANJA = { titulo: "OF 123", detalle: "Cliente · Calle 1", simular: false };

test("en el navegador abre Google Maps hacia la parada", async () => {
  abiertos.length = 0;
  assert.equal(await navegarConGoogle(PARADA, FRANJA), "no_disponible");
  assert.equal(abiertos.length, 1);
  assert.match(abiertos[0], /google\.com\/maps\/dir\/.*destination=-18\.4783,-70\.3126/);
  // La OF y a quién no viajan en el enlace: a Google va solo el punto.
  assert.doesNotMatch(abiertos[0], /OF|Cliente|Calle/);
});

test("fuera de la APK no marca que Google esté guiando", async () => {
  const vistos = [];
  const soltar = alCambiarNavegacion(() => vistos.push(navegandoConGoogle()));
  await navegarConGoogle(PARADA, FRANJA);
  soltar();
  assert.deepEqual(vistos, [], "la navegación de ARES no tiene por qué pausarse");
  assert.equal(navegandoConGoogle(), false);
});
