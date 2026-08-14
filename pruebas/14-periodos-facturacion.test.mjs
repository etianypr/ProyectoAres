// Los cortes de facturación (0034). Lo que se prueba acá es dónde EMPIEZA y
// dónde TERMINA un periodo: si un día se cae de su corte, la facturación de ese
// periodo queda corta y la del siguiente larga, sin que nada avise.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_CORTE_PERIODO,
  COLOR_PERIODO,
  indicePeriodoDe,
  nombrePeriodo,
  nombrePeriodoCorto,
  periodosEnRango,
} from "@/lib/encomiendas/periodos";

const quincenas = [
  { id: "a", fecha_inicio: "2026-05-01", fecha_fin: "2026-05-15" },
  { id: "b", fecha_inicio: "2026-05-16", fecha_fin: "2026-05-31" },
];

test("los dos extremos entran en el periodo (el último día también se factura)", () => {
  assert.equal(indicePeriodoDe("2026-05-01", quincenas), 0, "el primer día quedó fuera");
  assert.equal(indicePeriodoDe("2026-05-15", quincenas), 0, "el último día quedó fuera");
  assert.equal(indicePeriodoDe("2026-05-16", quincenas), 1);
  assert.equal(indicePeriodoDe("2026-05-31", quincenas), 1);
});

test("un día fuera de todo corte no se cuela en ninguno", () => {
  assert.equal(indicePeriodoDe("2026-04-30", quincenas), -1);
  assert.equal(indicePeriodoDe("2026-06-01", quincenas), -1);
});

test("ningún día de mayo queda sin corte, y ninguno cae en dos", () => {
  for (let d = 1; d <= 31; d++) {
    const fecha = `2026-05-${String(d).padStart(2, "0")}`;
    const caen = quincenas.filter((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin);
    assert.equal(caen.length, 1, `${fecha} cayó en ${caen.length} periodos`);
  }
});

test("un periodo que desborda el mes se sigue viendo desde los dos lados", () => {
  const acaballo = [{ id: "x", fecha_inicio: "2026-04-25", fecha_fin: "2026-05-10" }];
  assert.equal(periodosEnRango(acaballo, "2026-04-01", "2026-04-30").length, 1, "no se vio en abril");
  assert.equal(periodosEnRango(acaballo, "2026-05-01", "2026-05-31").length, 1, "no se vio en mayo");
  assert.equal(periodosEnRango(acaballo, "2026-06-01", "2026-06-30").length, 0, "se coló en junio");
  // Pegado por fuera, sin compartir un solo día: no toca el mes.
  assert.equal(periodosEnRango(acaballo, "2026-05-11", "2026-05-31").length, 0);
  // Pegado por dentro, compartiendo exactamente un día: sí lo toca.
  assert.equal(periodosEnRango(acaballo, "2026-05-10", "2026-05-31").length, 1);
});

test("el nombre son las fechas, y el año no se repite si es el mismo", () => {
  assert.equal(nombrePeriodo(quincenas[0]), "1 al 15 de mayo 2026");
  assert.equal(
    nombrePeriodo({ fecha_inicio: "2026-04-25", fecha_fin: "2026-05-10" }),
    "25 de abril al 10 de mayo 2026",
  );
  assert.equal(
    nombrePeriodo({ fecha_inicio: "2026-12-20", fecha_fin: "2027-01-05" }),
    "20 de diciembre 2026 al 5 de enero 2027",
  );
});

test("el nombre corto no se corre de día por la zona horaria", () => {
  // Un new Date("2026-05-01") se interpreta en UTC y en Chile es el 30 de abril.
  assert.equal(nombrePeriodoCorto(quincenas[0]), "1–15 may");
  assert.equal(
    nombrePeriodoCorto({ fecha_inicio: "2026-04-25", fecha_fin: "2026-05-10" }),
    "25 abr – 10 may",
  );
});

test("la línea de corte se distingue del color de los periodos", () => {
  // Todos los periodos van del mismo color: lo que los separa es la línea, así
  // que si los dos valores se acercaran hasta confundirse el gráfico dejaría de
  // decir dónde termina un corte, sin que nada avise.
  assert.notEqual(COLOR_CORTE_PERIODO, COLOR_PERIODO);
  assert.ok(luminancia(COLOR_CORTE_PERIODO) < luminancia(COLOR_PERIODO) - 0.08, "la línea no es lo bastante más oscura que la barra");
});

/** Luminancia relativa (WCAG) de un "#rrggbb", para comparar qué tan oscuro es
 *  un color contra otro sin depender del tinte. */
function luminancia(hex) {
  const canal = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}
