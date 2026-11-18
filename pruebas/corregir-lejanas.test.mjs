// Spec 037: corregir una dirección lejana con la ruta propuesta a la vista. Puro: la
// propuesta se arma a mano, sin red ni IndexedDB. Las calles son de Arica; los
// nombres y direcciones, inventados.
import test from "node:test";
import assert from "node:assert/strict";

import { sigueLejos } from "@/lib/encomiendas/local/generar-ruta/lejanas";
import { conPedidoCorregido, mantenerLejana } from "@/lib/encomiendas/local/generar-ruta/cambiar-propuesta";

// ~111 m por 0,001° de latitud. La central y tres paradas pegadas; una cuarta a ~5 km.
const CENTRAL = { lat: -18.4783, lng: -70.3126 };
const cerca = (n) => ({ lat: CENTRAL.lat - 0.002 * n, lng: CENTRAL.lng });
const LEJOS = { lat: CENTRAL.lat - 0.05, lng: CENTRAL.lng };

const pedido = (id, punto, direccion = `Calle ${id} 100`) => ({
  id,
  direccion,
  resultado: "pendiente",
  disponibilidad: "sin_contacto",
  ...(punto ?? {}),
});

function propuestaCon(lejos = LEJOS) {
  const paradas = [pedido("a", cerca(1)), pedido("b", cerca(2)), pedido("lejos", lejos), pedido("c", cerca(3))];
  return {
    fecha: "2026-11-17",
    partida: CENTRAL,
    paradas,
    alternativas: [{ estrategia: "corta", paradas }],
    elegida: "corta",
    lejanas: [{ pedidoId: "lejos", direccion: "Calle lejos 100", metrosAlResto: 5000, metrosQueSuma: 9000 }],
    sinUbicar: [pedido("sin", null, "Pasaje 1 5")],
    trazado: null,
    tramos: null,
    cerradas: 0,
    advertencias: [],
    sinTrazado: false,
  };
}

test("sigueLejos: lejos de la central y de todas las paradas", () => {
  assert.equal(sigueLejos(LEJOS, [cerca(1), cerca(2)], CENTRAL), true);
  assert.equal(sigueLejos(cerca(1), [cerca(2)], CENTRAL), false);
  // Cerca de otra parada, aunque lejos de la central.
  assert.equal(sigueLejos(LEJOS, [{ lat: LEJOS.lat - 0.003, lng: LEJOS.lng }], CENTRAL), false);
});

test("conPedidoCorregido: la lejana que quedó cerca sale de los pendientes y el orden no cambia", () => {
  const p = propuestaCon();
  const corregida = pedido("lejos", cerca(4), "Calle lejos 200");
  const nueva = conPedidoCorregido(p, corregida);
  assert.deepEqual(nueva.paradas.map((x) => x.id), ["a", "b", "lejos", "c"]);
  assert.deepEqual(nueva.lejanas, []);
  assert.equal(nueva.paradas[2].direccion, "Calle lejos 200");
  assert.equal(nueva.paradas[2].lat, cerca(4).lat);
  assert.equal(nueva.alternativas[0].paradas[2].lat, cerca(4).lat);
  assert.equal(nueva.conCambios, true);
});

test("conPedidoCorregido: si sigue lejos, queda pendiente con su dirección nueva", () => {
  const p = propuestaCon();
  const otraLejos = { lat: LEJOS.lat - 0.01, lng: LEJOS.lng };
  const nueva = conPedidoCorregido(p, pedido("lejos", otraLejos, "Calle lejos 300"));
  assert.equal(nueva.lejanas.length, 1);
  assert.equal(nueva.lejanas[0].direccion, "Calle lejos 300");
  assert.equal(nueva.paradas[2].lng, otraLejos.lng);
});

test("conPedidoCorregido: un pedido sin ubicar solo marca el cambio y no entra a la ruta", () => {
  const p = propuestaCon();
  const nueva = conPedidoCorregido(p, pedido("sin", cerca(5), "Pasaje 1 6"));
  assert.deepEqual(nueva.paradas.map((x) => x.id), ["a", "b", "lejos", "c"]);
  assert.equal(nueva.sinUbicar[0].lat, cerca(5).lat);
  assert.equal(nueva.conCambios, true);
});

test("conPedidoCorregido: no toca la propuesta de entrada", () => {
  const p = propuestaCon();
  conPedidoCorregido(p, pedido("lejos", cerca(4)));
  assert.equal(p.lejanas.length, 1);
  assert.equal(p.conCambios, undefined);
});

test("mantenerLejana: la saca de los pendientes sin tocar las paradas", () => {
  const p = propuestaCon();
  const nueva = mantenerLejana(p, "lejos");
  assert.deepEqual(nueva.lejanas, []);
  assert.equal(nueva.paradas, p.paradas);
});
