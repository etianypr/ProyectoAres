// Las cifras del panel de encomiendas (spec 002, T039): lo puro que salió de
// page.tsx. Lo que se verifica es que se lean las cifras CONGELADAS de cada día
// (no se recalcula nada) y que los totales por corte y por conductor sumen bien.
import test from "node:test";
import assert from "node:assert/strict";

const { armarDias, enCurso, resumenPorConductor, resumirPeriodos, serieDelPeriodo } = await import(
  "@/app/(app)/encomiendas/_resumen"
);

const A = "11111111-1111-7111-8111-111111111111";
const ev = (fecha, tipo, origen = "telefono", conductor_id = A) => ({
  conductor_id,
  fecha,
  tipo,
  origen,
  conductor: { nombre: "Ana" },
});
const pago = (fecha, ingresos_totales, pago_total, pedidos_entregados = 0) => ({
  conductor_id: A,
  fecha,
  ingresos_totales,
  pago_total,
  pedidos_entregados,
  pago_base: 0,
  pago_dia: 0,
  pago_bono: 0,
});

test("armarDias: un día por (conductor, fecha) con sus cifras congeladas", () => {
  const actividad = [
    ev("2026-10-01", "entrega"),
    ev("2026-10-01", "entrega"),
    ev("2026-10-01", "omision", "manual"),
    ev("2026-10-02", "entrega"),
  ];
  const dias = armarDias(actividad, [pago("2026-10-01", 3000, 1800)], [
    { fecha: "2026-10-02", conductor_id: A, inicio: "2026-10-02T12:00:00Z", cerrada_en: null },
  ]);
  const uno = dias.find((d) => d.fecha === "2026-10-01");
  assert.equal(uno.conductorNombre, "Ana");
  assert.equal(uno.conteo.entregados, 2);
  assert.equal(uno.cifras.ingresos_totales, 3000);
  assert.equal(uno.manuales, 1);
  assert.equal(uno.total, 3);
  const dos = dias.find((d) => d.fecha === "2026-10-02");
  assert.equal(dos.cifras, null, "sin cifras no se inventan");
  assert.equal(enCurso(dos), true, "día abierto = ruta en curso");
  assert.equal(enCurso(uno), false);
});

test("resumenPorConductor: suma días, entregas, ingresos y pago", () => {
  const dias = armarDias(
    [ev("2026-10-01", "entrega"), ev("2026-10-02", "entrega"), ev("2026-10-02", "entrega")],
    [pago("2026-10-01", 1500, 900), pago("2026-10-02", 3000, 1800)],
    [],
  );
  assert.deepEqual(resumenPorConductor(dias), [
    { nombre: "Ana", diasTrabajados: 2, entregados: 3, ingresos: 4500, pago: 2700 },
  ]);
});

test("resumirPeriodos: suma los días de cada corte aunque crucen el mes, con lo real", () => {
  const periodos = [{ id: "p1", fecha_inicio: "2026-09-25", fecha_fin: "2026-10-10" }];
  const r = resumirPeriodos(
    periodos,
    [pago("2026-09-28", 1000, 600, 2), pago("2026-10-05", 2000, 1200, 4), pago("2026-10-20", 9999, 1, 9)],
    [{ periodo_id: "p1", monto: 2900, nota: "liquidación" }],
  );
  assert.equal(r[0].dias, 2);
  assert.equal(r[0].entregados, 6);
  assert.equal(r[0].ingresos, 3000);
  assert.equal(r[0].real, 2900);
  assert.equal(r[0].notaReal, "liquidación");
});

test("serieDelPeriodo: un palo por día del mes, o uno por mes en el año", () => {
  const dias = armarDias([ev("2026-10-03", "entrega"), ev("2026-10-03", "entrega")], [], []);
  const mes = serieDelPeriodo({ anio: 2026, mes: 10 }, dias, []);
  assert.equal(mes.length, 31);
  assert.equal(mes[2].pedidos, 2);
  assert.equal(mes[2].periodoIdx, -1);
  const anio = serieDelPeriodo({ anio: 2026, mes: null }, dias, []);
  assert.equal(anio.length, 12);
  assert.equal(anio[9].pedidos, 2);
});
