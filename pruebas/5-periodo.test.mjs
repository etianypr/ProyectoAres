// El filtro de mes/año del panel y las fechas: un error acá borra días de pago
// de la vista sin que nadie lo note.
import test from "node:test";
import assert from "node:assert/strict";
import { rangoPeriodo, enRango, etiquetaPeriodo } from "@/lib/periodo";
import { hoyChile, sumarDias, formatDate, formatDistancia, formatCLP, formatNumber } from "@/lib/format";

test("rangoPeriodo cubre el mes completo, incluidos los de 28/29/30/31 días", () => {
  assert.deepEqual(rangoPeriodo({ anio: 2026, mes: 2 }), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoPeriodo({ anio: 2028, mes: 2 }), { desde: "2028-02-01", hasta: "2028-02-29" });
  assert.deepEqual(rangoPeriodo({ anio: 2026, mes: 4 }), { desde: "2026-04-01", hasta: "2026-04-30" });
  assert.deepEqual(rangoPeriodo({ anio: 2026, mes: 12 }), { desde: "2026-12-01", hasta: "2026-12-31" });
  assert.deepEqual(rangoPeriodo({ anio: 2026, mes: null }), { desde: "2026-01-01", hasta: "2026-12-31" });
});

test("ningún día del año queda fuera de su periodo (no se pierde un día de pago)", () => {
  for (let mes = 1; mes <= 12; mes++) {
    const { desde, hasta } = rangoPeriodo({ anio: 2026, mes });
    const dias = new Date(2026, mes, 0).getDate();
    for (let d = 1; d <= dias; d++) {
      const fecha = `2026-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      assert.ok(fecha >= desde && fecha <= hasta, `${fecha} quedó fuera de su propio mes`);
      assert.ok(enRango(fecha, { anio: 2026, mes }), `enRango falló con ${fecha}`);
      assert.ok(enRango(fecha, { anio: 2026, mes: null }), `${fecha} fuera de la vista anual`);
    }
  }
});

test("la serie del gráfico tiene un palo por día del mes (misma cuenta que el rango)", () => {
  for (let mes = 1; mes <= 12; mes++) {
    const largoSerie = new Date(2026, mes, 0).getDate(); // page.tsx
    const { hasta } = rangoPeriodo({ anio: 2026, mes });
    assert.equal(largoSerie, Number(hasta.slice(-2)), `desfase en el mes ${mes}`);
  }
});

test("hoyChile devuelve YYYY-MM-DD y no se corre de día", () => {
  const hoy = hoyChile();
  assert.match(hoy, /^\d{4}-\d{2}-\d{2}$/);
  const enChile = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  assert.equal(hoy, enChile);
});

test("sumarDias cruza fin de mes, fin de año y años bisiestos", () => {
  assert.equal(sumarDias("2026-08-31", 1), "2026-09-01");
  assert.equal(sumarDias("2026-09-01", -1), "2026-08-31");
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
  assert.equal(sumarDias("2026-02-28", 1), "2026-03-01");
  // Ida y vuelta sobre todo un año: nunca puede perder ni ganar un día.
  let f = "2026-01-01";
  for (let i = 0; i < 365; i++) f = sumarDias(f, 1);
  assert.equal(f, "2027-01-01");
});

test("formatDate no corre la fecha un día (el clásico de UTC)", () => {
  assert.equal(formatDate("2026-08-06"), "06-08-2026");
  assert.equal(formatDate("2026-01-01"), "01-01-2026");
  assert.equal(formatDate(null), "—");
});

test("formatos de plata y distancia toleran null/NaN sin escupir 'NaN' en pantalla", () => {
  assert.ok(!formatCLP(null).includes("NaN"));
  assert.ok(!formatCLP(undefined).includes("NaN"));
  assert.ok(!formatCLP("no es un número").includes("NaN"));
  assert.ok(!formatNumber(null).includes("NaN"));
  assert.equal(formatDistancia(999), "999 m");
  assert.equal(formatDistancia(1000), "1.0 km");
});

test("etiquetaPeriodo", () => {
  assert.equal(etiquetaPeriodo({ anio: 2026, mes: 8 }), "agosto 2026");
  assert.equal(etiquetaPeriodo({ anio: 2026, mes: null }), "Año 2026");
});
