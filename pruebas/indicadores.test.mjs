// Spec 006: indicadores del negocio, calculados con filas de la base (puro).
import test from "node:test";
import assert from "node:assert/strict";

const { calcularIndicadores, periodoAnterior, rangoAnterior, diferencia } = await import(
  "@/lib/encomiendas/indicadores"
);

const C = "c-1";
const evento = (fecha, tipo, hora, origen = "app") => ({ conductor_id: C, fecha, tipo, origen, hora });
const dia = (fecha, inicio, cerrada_en, asignados = null, contactados = null) => ({
  conductor_id: C, fecha, inicio, cerrada_en, asignados, contactados,
});

test("tasa de entrega, no entregas e intentos", () => {
  const r = calcularIndicadores({
    actividad: [
      evento("2026-10-01", "entrega", "2026-10-01T13:00:00Z"),
      evento("2026-10-01", "entrega", "2026-10-01T14:00:00Z"),
      evento("2026-10-01", "entrega", "2026-10-01T15:00:00Z"),
      evento("2026-10-01", "omision", "2026-10-01T15:30:00Z"),
      evento("2026-10-01", "llamada", "2026-10-01T12:30:00Z"),
    ],
    dias: [dia("2026-10-01", "2026-10-01T12:00:00Z", "2026-10-01T15:30:00Z")],
    pagos: [],
  });
  assert.deepEqual([r.entregas, r.noEntregas, r.intentos, r.tasaEntrega], [3, 1, 4, 0.75]);
});

test("la duración va de la salida al último evento del teléfono, no a medianoche", () => {
  const r = calcularIndicadores({
    actividad: [
      evento("2026-10-01", "entrega", "2026-10-01T13:00:00Z"),
      evento("2026-10-01", "entrega", "2026-10-01T16:00:00Z"),
    ],
    // El cron la cerró a las 00:30 del día siguiente.
    dias: [dia("2026-10-01", "2026-10-01T12:00:00Z", "2026-10-02T03:30:00Z")],
    pagos: [],
  });
  assert.equal(r.duracionMediaMin, 240);
  assert.equal(r.entregasPorHora, 0.5);
});

test("un día abierto y uno cargado a mano no cuentan en duración", () => {
  const r = calcularIndicadores({
    actividad: [
      evento("2026-10-01", "entrega", "2026-10-01T14:00:00Z"),
      evento("2026-10-02", "entrega", "2026-10-02T12:00:00Z", "manual"),
    ],
    dias: [dia("2026-10-01", "2026-10-01T12:00:00Z", null), dia("2026-10-02", null, "2026-10-02T12:00:00Z")],
    pagos: [],
  });
  assert.deepEqual([r.entregas, r.diasAbiertos, r.duracionMediaMin, r.entregasPorHora], [2, 1, null, null]);
});

test("entregados sobre asignados solo con los días que lo informaron (25 → 22 = 88 %)", () => {
  const entregas = Array.from({ length: 22 }, (_, i) => evento("2026-10-03", "entrega", `2026-10-03T1${i % 9}:00:00Z`));
  const r = calcularIndicadores({
    actividad: [...entregas, evento("2026-10-02", "entrega", "2026-10-02T13:00:00Z")],
    dias: [
      dia("2026-10-02", "2026-10-02T12:00:00Z", "2026-10-02T18:00:00Z"),
      dia("2026-10-03", "2026-10-03T09:00:00Z", "2026-10-03T19:00:00Z", 25, 20),
    ],
    pagos: [],
  });
  assert.deepEqual([r.asignados, r.entregasConAsignados, r.tasaSobreAsignados], [25, 22, 0.88]);
  assert.deepEqual([r.contactados, r.tasaContactados, r.desdeAsignados], [20, 0.8, "2026-10-03"]);
});

test("sin asignados informados, la tasa queda vacía y no en cero", () => {
  const r = calcularIndicadores({ actividad: [evento("2026-10-01", "entrega", "2026-10-01T13:00:00Z")], dias: [], pagos: [] });
  assert.deepEqual([r.asignados, r.tasaSobreAsignados, r.contactados, r.desdeAsignados], [null, null, null, null]);
});

test("margen = ingreso estimado − pago (40 entregas a $950, pago $25.000)", () => {
  const r = calcularIndicadores({
    actividad: [],
    dias: [],
    pagos: [{ conductor_id: C, fecha: "2026-10-01", ingresos_totales: 38000, pago_total: 25000 }],
  });
  assert.deepEqual([r.ingreso, r.pago, r.margen], [38000, 25000, 13000]);
});

test("el período anterior tiene el mismo largo", () => {
  assert.deepEqual(periodoAnterior({ anio: 2026, mes: 1 }), { anio: 2025, mes: 12 });
  assert.deepEqual(periodoAnterior({ anio: 2026, mes: 10 }), { anio: 2026, mes: 9 });
  assert.deepEqual(periodoAnterior({ anio: 2026, mes: null }), { anio: 2025, mes: null });
  assert.deepEqual(rangoAnterior({ desde: "2026-10-08", hasta: "2026-10-14" }), { desde: "2026-10-01", hasta: "2026-10-07" });
  assert.equal(diferencia(0.9, 0.8).toFixed(2), "0.10");
  assert.equal(diferencia(null, 0.8), null);
});
