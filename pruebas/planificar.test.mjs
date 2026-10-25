// El planificador de horarios (spec 010): a qué hora se llega a cada parada y
// dónde va un pedido que eligió un bloque. Puro, sin red ni IndexedDB.
//
// Las distancias se dan por kilómetro sobre una recta para que las horas sean
// exactas: a 25 km/h, 1 km son 2,4 minutos; cada parada suma 4.
import test from "node:test";
import assert from "node:assert/strict";

const { llegadas, ubicarConHorario, fueraDeHorario, MIN_POR_PARADA } = await import(
  "@/lib/encomiendas/local/planificar"
);

/** Parada a `km` de la base, sobre una recta. */
const P = (id, km, bloqueHorarioId = null) => ({ id, km, lat: 0, lng: 0, bloqueHorarioId });
const metros = (a, b) => Math.abs(b.km - (a?.km ?? 0)) * 1000;
const H = (h, m = 0) => h * 60 + m;
const ids = (orden) => orden.map((p) => p.id);

test("llegadas suma el viaje y los minutos de cada parada", () => {
  const t = llegadas([P("a", 5), P("b", 10)], H(10), metros);
  assert.equal(t[0], H(10) + 12);
  assert.equal(t[1], H(10) + 12 + MIN_POR_PARADA + 12);
});

test("llegar antes de que abra el bloque es fuera de horario, salvo al final", () => {
  // Al final de la ruta el conductor puede ir cuando abre: no atrasa a nadie.
  const conHorario = P("x", 5, "12-14");
  const sinHorario = P("y", 10);

  assert.deepEqual(ids(fueraDeHorario([conHorario, sinHorario], H(10), metros)), ["x"]);
  assert.deepEqual(fueraDeHorario([sinHorario, conHorario], H(10), metros), []);
  assert.equal(llegadas([sinHorario, conHorario], H(10), metros)[1], H(12), "no esperó a que abra");
});

test("el pedido con horario entra donde se llega dentro de su bloque, sin mover a los demás", () => {
  // Veinte paradas cada 2 km: la ruta va de 10:00 a casi 13:00. El de 12-14
  // está a 3 km de la base, pero visitarlo al pasar sería llegar a las 10:07.
  const base = Array.from({ length: 20 }, (_, i) => P(`s${i + 1}`, (i + 1) * 2));
  const conBloque = P("p", 3, "12-14");

  const orden = ubicarConHorario(base, [conBloque], H(10), metros);
  const t = llegadas(orden, H(10), metros);
  const i = orden.findIndex((x) => x.id === "p");

  assert.ok(t[i] >= H(12) && t[i] <= H(14), `se atiende a las ${(t[i] / 60).toFixed(2)} h`);
  assert.deepEqual(ids(orden.filter((x) => x.id !== "p")), ids(base), "se movieron pedidos sin horario");
  assert.deepEqual(fueraDeHorario(orden, H(10), metros), []);
});

test("un bloque que ya pasó no reordena la ruta: el pedido va al final", () => {
  const base = [P("a", 1), P("b", 2)];
  const orden = ubicarConHorario(base, [P("p", 15, "08-10")], H(17), metros);

  assert.deepEqual(ids(orden), ["a", "b", "p"]);
  assert.deepEqual(ids(fueraDeHorario(orden, H(17), metros)), ["p"]);
});

test("con varios horarios, ubicar uno no deja fuera al otro", () => {
  const orden = ubicarConHorario([], [P("tarde", 1, "16-18"), P("manana", 10, "10-12")], H(9, 30), metros);

  assert.deepEqual(ids(orden), ["manana", "tarde"]);
  assert.deepEqual(fueraDeHorario(orden, H(9, 30), metros), []);
});

test("a igual cumplimiento, gana el orden que termina antes", () => {
  // A las 8:00 el de 12-14 solo se cumple al final (esperando). Ponerlo primero
  // haría esperar cuatro horas antes de entregar los otros dos.
  const orden = ubicarConHorario([P("a", 1), P("b", 2)], [P("p", 1.5, "12-14")], H(8), metros);
  assert.deepEqual(ids(orden), ["a", "b", "p"]);
});
