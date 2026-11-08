// Los sonidos del escáner en vivo (spec 028, «Marimba», elegida por el dueño el
// 2026-11-08) con un AudioContext simulado que anota cada nota: los tics suben,
// el de pedido leído llega al do de arriba, la pausa baja, y sin audio no pasa
// nada. Cómo suenan de verdad se oye en el teléfono.
import test from "node:test";
import assert from "node:assert/strict";

const notas = [];
class AudioContextFalso {
  currentTime = 0;
  state = "running";
  destination = {};
  resume() {}
  createDynamicsCompressor() {
    return { threshold: { value: 0 }, ratio: { value: 0 }, connect: (x) => x };
  }
  createGain() {
    const ganancia = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 };
    return { gain: ganancia, connect: (x) => x };
  }
  createOscillator() {
    const o = { type: "", frequency: { value: 0 }, connect: (x) => x, start: (t) => notas.push({ f: o.frequency.value, t }), stop() {} };
    return o;
  }
}
globalThis.window = { AudioContext: AudioContextFalso };

const { NOTAS, sonarTic, sonarLeida, sonarPausa } = await import("@/lib/comun/sonidos-escaner");

/** Las fundamentales (sin el armónico de la madera, que va 3,93 veces más arriba). */
const fundamentales = () => notas.filter((n) => Object.values(NOTAS).some((f) => Math.abs(f - n.f) < 0.01));

test.beforeEach(() => {
  notas.length = 0;
});

test("los tres tics suben: do6, mi6, sol6", () => {
  sonarTic(0);
  sonarTic(1);
  sonarTic(2);
  assert.deepEqual(fundamentales().map((n) => n.f), [NOTAS.do6, NOTAS.mi6, NOTAS.sol6]);
});

test("el de pedido leído llega al do de arriba, la nota más alta de todas", () => {
  sonarLeida();
  const f = fundamentales();
  assert.equal(Math.max(...f.map((n) => n.f)), NOTAS.do7);
  const ultima = Math.max(...f.map((n) => n.t));
  assert.ok(f.some((n) => n.f === NOTAS.do7 && n.t === ultima), "el do7 suena al final");
});

test("la pausa por un ⚠ son dos notas que bajan", () => {
  sonarPausa();
  const f = fundamentales().sort((a, b) => a.t - b.t).map((n) => n.f);
  assert.deepEqual(f, [NOTAS.sol5, NOTAS.re5]);
});

test("un tic fuera de rango no rompe nada: queda en la escala", () => {
  sonarTic(7);
  assert.deepEqual(fundamentales().map((n) => n.f), [NOTAS.sol6]);
});
