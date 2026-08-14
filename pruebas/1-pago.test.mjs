// Prueba intensiva del cálculo de plata: tarifaDelDia / calcularPagoDia /
// agruparPorDia. Importa el archivo REAL del proyecto (src/lib/encomiendas/pago.ts).
//
// La versión de este archivo que venía del sistema anterior probaba reglaVigente(),
// la función que resolvía cuál regla del historial regía cada fecha. Esa función se
// borró al pasar a UNA sola regla, pero la prueba se quedó importándola: el archivo
// entero reventaba al cargar, así que desde entonces NADA de esto se estaba
// comprobando — justo el cálculo del que sale el sueldo. Reescrito contra el
// mecanismo que la reemplazó: la tarifa congelada en cada día.
import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorDia,
  calcularPagoDia,
  contarActividad,
  ingresoEstimado,
  tarifaDelDia,
  valorPedido,
  PAGO_CERO,
} from "@/lib/encomiendas/pago";
import { VALOR_APROXIMADO_PEDIDO } from "@/lib/encomiendas/config";

/** Una regla de pago (o cualquier tarifa: son la misma forma). */
const R = (o) => ({
  id: o.id ?? "r",
  empresa_id: "e",
  tipo_pago: o.tipo_pago ?? "monto_fijo",
  valor_pago: o.valor_pago ?? 0,
  valor_pedido: "valor_pedido" in o ? o.valor_pedido : VALOR_APROXIMADO_PEDIDO,
  monto_dia: o.monto_dia ?? 0,
  meta_entregas_dia: o.meta_entregas_dia ?? null,
  bono_monto: o.bono_monto ?? null,
  created_at: o.created_at ?? "2026-01-01T00:00:00+00:00",
  updated_at: o.updated_at ?? "2026-01-01T00:00:00+00:00",
});

/** Una fila de encomienda_pagos: las cifras de un día YA congelado, con la
 *  tarifa con la que se calcularon. */
const P = (o) => ({
  id: o.id ?? "p",
  empresa_id: "e",
  chofer_id: o.chofer_id ?? "c1",
  fecha: o.fecha ?? "2026-08-01",
  pedidos_entregados: o.pedidos_entregados ?? 0,
  pedidos_no_entregados: o.pedidos_no_entregados ?? 0,
  ingresos_totales: o.ingresos_totales ?? 0,
  pago_base: o.pago_base ?? 0,
  pago_dia: o.pago_dia ?? 0,
  pago_bono: o.pago_bono ?? 0,
  pago_total: o.pago_total ?? 0,
  calculado_en: o.calculado_en ?? "2026-08-01T22:00:00+00:00",
  regla_valor_pedido: "regla_valor_pedido" in o ? o.regla_valor_pedido : 950,
  regla_tipo_pago: "regla_tipo_pago" in o ? o.regla_tipo_pago : "monto_fijo",
  regla_valor_pago: "regla_valor_pago" in o ? o.regla_valor_pago : 300,
  regla_monto_dia: "regla_monto_dia" in o ? o.regla_monto_dia : 15000,
  regla_meta_entregas_dia:
    "regla_meta_entregas_dia" in o ? o.regla_meta_entregas_dia : null,
  regla_bono_monto: "regla_bono_monto" in o ? o.regla_bono_monto : null,
});

const EV = (o) => ({
  chofer_id: "chofer_id" in o ? o.chofer_id : "c1",
  fecha: o.fecha ?? "2026-08-01",
  tipo: o.tipo ?? "entrega",
  origen: o.origen ?? "app",
});

// ---------------------------------------------------------------- ingresos
test("ingresoEstimado es lineal y siempre entero", () => {
  assert.equal(ingresoEstimado(0, 950), 0);
  assert.equal(ingresoEstimado(1, 950), 950);
  assert.equal(ingresoEstimado(37, 1200), 37 * 1200);
  // ingresos_totales es integer en la base: un valor con decimales no puede
  // filtrarse como tal.
  assert.ok(Number.isInteger(ingresoEstimado(7, 1333.33)));
  assert.ok(Number.isInteger(ingresoEstimado(300, 950)));
});

// ------------------------------------------------------- valor por entrega
test("el valor por entrega sale de la tarifa", () => {
  assert.equal(valorPedido(R({ valor_pedido: 1400 })), 1400);
  assert.equal(valorPedido(R({ valor_pedido: "1400" })), 1400, "PostgREST puede mandarlo string");
});

test("sin tarifa, o con una sin valor por entrega, cae al respaldo", () => {
  assert.equal(valorPedido(null), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(undefined), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(R({ valor_pedido: undefined })), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(R({ valor_pedido: null })), VALOR_APROXIMADO_PEDIDO);
  // Cero no es un valor válido: dejaría todos los ingresos en $0 sin avisar.
  assert.equal(valorPedido(R({ valor_pedido: 0 })), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(R({ valor_pedido: "no es un número" })), VALOR_APROXIMADO_PEDIDO);
});

test("con pago por porcentaje, el valor por entrega mueve el sueldo del conductor", () => {
  // Por eso los dos tienen que quedar congelados juntos en la misma tarifa.
  const alCincuenta = (valor) =>
    calcularPagoDia(
      { entregados: 10, omitidos: 0 },
      R({ tipo_pago: "porcentaje", valor_pago: 50, valor_pedido: valor }),
    ).base;
  assert.equal(alCincuenta(950), Math.round((10 * 950 * 50) / 100));
  assert.equal(alCincuenta(1400), Math.round((10 * 1400 * 50) / 100));
  assert.ok(alCincuenta(1400) > alCincuenta(950));
});

// ------------------------------------------------------------ tarifaDelDia
//
// Esto es lo que reemplazó al historial de reglas con vigencias. La pregunta ya
// no es "cuál regla regía el 15 de julio", sino "con qué se calculó ESTE día",
// y la respuesta está escrita en el propio día.
test("tarifaDelDia devuelve la tarifa congelada del día", () => {
  const t = tarifaDelDia(
    P({
      regla_valor_pedido: 1400,
      regla_tipo_pago: "porcentaje",
      regla_valor_pago: "7.50",
      regla_monto_dia: 12000,
      regla_meta_entregas_dia: 30,
      regla_bono_monto: 8000,
    }),
  );
  assert.deepEqual(t, {
    tipo_pago: "porcentaje",
    valor_pago: 7.5, // numeric de PostgREST llega string y tiene que salir número
    valor_pedido: 1400,
    monto_dia: 12000,
    meta_entregas_dia: 30,
    bono_monto: 8000,
  });
});

test("un día sin tarifa congelada devuelve null, no una tarifa a medias", () => {
  // Media tarifa calcularía un pago con huecos rellenados en silencio. Null hace
  // que el panel diga "Sin regla", que es la verdad.
  assert.equal(tarifaDelDia(null), null);
  assert.equal(tarifaDelDia(undefined), null);
  assert.equal(tarifaDelDia(P({ regla_valor_pedido: null })), null);
  assert.equal(tarifaDelDia(P({ regla_tipo_pago: null })), null);
});

test("los nulos de la tarifa se leen como 'sin fijo' y 'sin bono', no como NaN", () => {
  const t = tarifaDelDia(
    P({ regla_valor_pago: null, regla_monto_dia: null, regla_bono_monto: null }),
  );
  assert.equal(t.valor_pago, 0);
  assert.equal(t.monto_dia, 0);
  assert.equal(t.bono_monto, null);
  assert.ok(!Number.isNaN(calcularPagoDia({ entregados: 10, omitidos: 0 }, t).total));
});

test("cambiar la regla NO reescribe lo que ya se liquidó", () => {
  // El reemplazo de las vigencias: al día ya calculado no lo protege una fecha de
  // vigencia, lo protege su propia tarifa escrita encima. Sumarle una entrega a
  // un día viejo lo recalcula con LA SUYA, no con la regla de hoy.
  const diaViejo = P({ regla_valor_pedido: 950, regla_valor_pago: 300, regla_monto_dia: 15000 });
  const reglaDeHoy = R({ valor_pedido: 1400, valor_pago: 500, monto_dia: 20000 });

  const conSuTarifa = calcularPagoDia({ entregados: 10, omitidos: 0 }, tarifaDelDia(diaViejo));
  const conLaDeHoy = calcularPagoDia({ entregados: 10, omitidos: 0 }, reglaDeHoy);

  assert.equal(conSuTarifa.total, 10 * 300 + 15000);
  assert.equal(conLaDeHoy.total, 10 * 500 + 20000);
  assert.notEqual(conSuTarifa.total, conLaDeHoy.total, "si dieran igual, esta prueba no prueba nada");
});

// --------------------------------------------------------- calcularPagoDia
test("sin tarifa el pago es cero", () => {
  assert.deepEqual(calcularPagoDia({ entregados: 50, omitidos: 3 }, null), PAGO_CERO);
});

test("monto fijo por pedido + fijo diario", () => {
  const regla = R({ tipo_pago: "monto_fijo", valor_pago: 300, monto_dia: 15000 });
  assert.deepEqual(calcularPagoDia({ entregados: 20, omitidos: 4 }, regla), {
    base: 6000,
    dia: 15000,
    bono: 0,
    total: 21000,
  });
});

test("porcentaje sobre el ingreso estimado, redondeado", () => {
  const regla = R({ tipo_pago: "porcentaje", valor_pago: 7.5 });
  // 20 entregas × 950 = 19.000 → 7,5 % = 1.425
  assert.equal(calcularPagoDia({ entregados: 20, omitidos: 0 }, regla).base, 1425);
  // 7 × 950 = 6.650 → 7,5 % = 498,75 → 499
  assert.equal(calcularPagoDia({ entregados: 7, omitidos: 0 }, regla).base, 499);
});

test("numeric que llega como string (PostgREST) no rompe la cuenta", () => {
  const regla = R({ tipo_pago: "monto_fijo", valor_pago: "300.00", monto_dia: "15000" });
  const pago = calcularPagoDia({ entregados: 10, omitidos: 0 }, regla);
  assert.deepEqual(pago, { base: 3000, dia: 15000, bono: 0, total: 18000 });
  for (const v of Object.values(pago)) assert.equal(typeof v, "number");
});

test("el bono se paga AL ALCANZAR la meta (>=), no al superarla", () => {
  const regla = R({ meta_entregas_dia: 30, bono_monto: 10000, valor_pago: 0 });
  assert.equal(calcularPagoDia({ entregados: 29, omitidos: 0 }, regla).bono, 0);
  assert.equal(calcularPagoDia({ entregados: 30, omitidos: 0 }, regla).bono, 10000);
  assert.equal(calcularPagoDia({ entregados: 31, omitidos: 0 }, regla).bono, 10000);
});

test("meta sin monto de bono no paga nada (y no da NaN)", () => {
  const regla = R({ meta_entregas_dia: 5, bono_monto: null });
  const pago = calcularPagoDia({ entregados: 10, omitidos: 0 }, regla);
  assert.equal(pago.bono, 0);
  assert.ok(!Number.isNaN(pago.total));
});

test("día sin entregas: solo el fijo diario", () => {
  const regla = R({ valor_pago: 300, monto_dia: 15000, meta_entregas_dia: 1, bono_monto: 5000 });
  assert.deepEqual(calcularPagoDia({ entregados: 0, omitidos: 0 }, regla), {
    base: 0,
    dia: 15000,
    bono: 0,
    total: 15000,
  });
});

test("total siempre = base + dia + bono, con valores al azar", () => {
  for (let i = 0; i < 500; i++) {
    const regla = R({
      tipo_pago: Math.random() < 0.5 ? "porcentaje" : "monto_fijo",
      valor_pago: Math.random() < 0.5 ? Math.random() * 100 : String((Math.random() * 900).toFixed(2)),
      monto_dia: Math.floor(Math.random() * 40000),
      meta_entregas_dia: Math.random() < 0.5 ? Math.ceil(Math.random() * 60) : null,
      bono_monto: Math.floor(Math.random() * 20000),
    });
    const conteo = {
      entregados: Math.floor(Math.random() * 120),
      omitidos: Math.floor(Math.random() * 20),
    };
    const p = calcularPagoDia(conteo, regla);
    assert.equal(p.total, p.base + p.dia + p.bono);
    assert.ok(Number.isInteger(p.base), `base no entera: ${p.base}`);
    assert.ok(p.base >= 0 && p.dia >= 0 && p.bono >= 0, "la base de datos exige >= 0");
    assert.ok(!Number.isNaN(p.total));
  }
});

test("las omisiones nunca cambian el pago", () => {
  const regla = R({ tipo_pago: "monto_fijo", valor_pago: 300, monto_dia: 15000 });
  const a = calcularPagoDia({ entregados: 10, omitidos: 0 }, regla);
  const b = calcularPagoDia({ entregados: 10, omitidos: 50 }, regla);
  assert.deepEqual(a, b);
});

// --------------------------------------------------------- contarActividad
test("las llamadas no suman ni restan al conteo", () => {
  const eventos = [
    EV({ tipo: "entrega" }),
    EV({ tipo: "entrega" }),
    EV({ tipo: "omision" }),
    EV({ tipo: "llamada" }),
    EV({ tipo: "llamada" }),
  ];
  assert.deepEqual(contarActividad(eventos), { entregados: 2, omitidos: 1 });
});

// ----------------------------------------------------------- agruparPorDia
test("agrupa por (conductor, día) y cuenta cada tipo", () => {
  const dias = agruparPorDia([
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "entrega" }),
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "omision" }),
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "llamada" }),
    EV({ chofer_id: "c2", fecha: "2026-08-01", tipo: "entrega" }),
    EV({ chofer_id: "c1", fecha: "2026-08-02", tipo: "entrega" }),
  ]);
  assert.equal(dias.length, 3);
  const d = dias.find((x) => x.fecha === "2026-08-01" && x.choferId === "c1");
  assert.deepEqual(d.conteo, { entregados: 1, omitidos: 1 });
  assert.equal(d.eventos.length, 3);
});

test("ordena por fecha, más nuevo primero", () => {
  const dias = agruparPorDia([
    EV({ fecha: "2026-08-01" }),
    EV({ fecha: "2026-08-31" }),
    EV({ fecha: "2026-08-15" }),
  ]);
  assert.deepEqual(
    dias.map((d) => d.fecha),
    ["2026-08-31", "2026-08-15", "2026-08-01"],
  );
});

test("cuenta los eventos de carga manual aparte", () => {
  const [d] = agruparPorDia([
    EV({ origen: "app" }),
    EV({ origen: "manual" }),
    EV({ origen: "manual" }),
  ]);
  assert.equal(d.manuales, 2);
  assert.equal(d.eventos.length, 3);
  assert.ok(d.manuales < d.eventos.length, "día mixto: la pantalla debe decir 'Manual parcial'");
});

test("un conductor eliminado (chofer_id null) sigue teniendo su día", () => {
  const dias = agruparPorDia([EV({ chofer_id: null }), EV({ chofer_id: null, tipo: "omision" })]);
  assert.equal(dias.length, 1);
  assert.equal(dias[0].choferId, null);
  assert.deepEqual(dias[0].conteo, { entregados: 1, omitidos: 1 });
});

test("lista vacía: ningún día (no hay 'día trabajado' fantasma)", () => {
  assert.deepEqual(agruparPorDia([]), []);
});

test("agruparPorDia conserva TODOS los eventos y no pierde ni duplica conteos", () => {
  const eventos = [];
  const tipos = ["entrega", "omision", "llamada"];
  for (let i = 0; i < 3000; i++) {
    eventos.push(
      EV({
        chofer_id: `c${i % 4}`,
        fecha: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
        tipo: tipos[i % 3],
        origen: i % 5 === 0 ? "manual" : "app",
      }),
    );
  }
  const dias = agruparPorDia(eventos);
  assert.equal(
    dias.reduce((a, d) => a + d.eventos.length, 0),
    eventos.length,
    "se perdieron o duplicaron eventos al agrupar",
  );
  assert.equal(
    dias.reduce((a, d) => a + d.conteo.entregados, 0),
    eventos.filter((e) => e.tipo === "entrega").length,
  );
  assert.equal(
    dias.reduce((a, d) => a + d.manuales, 0),
    eventos.filter((e) => e.origen === "manual").length,
  );
  // Ninguna clave repetida
  const claves = dias.map((d) => `${d.fecha}|${d.choferId}`);
  assert.equal(new Set(claves).size, claves.length);
});

// ---------------------------- coherencia panel ↔ base (la que paga)
//
// La vista previa en TS y private.encomienda_congelar_dia() en SQL son dos
// copias de la misma aritmética. Esto comprueba el lado TS contra la forma de la
// fila que la base escribe: pago_total es columna GENERADA como
// pago_base + pago_bono + pago_dia, así que si acá el total se armara de otra
// manera, el panel y la liquidación dirían cifras distintas del mismo día.
test("lo que el panel proyecta al vuelo es idéntico a lo que se congela en encomienda_pagos", () => {
  const regla = R({
    tipo_pago: "monto_fijo",
    valor_pago: 300,
    monto_dia: 15000,
    meta_entregas_dia: 25,
    bono_monto: 8000,
  });
  for (let entregados = 0; entregados <= 60; entregados++) {
    const conteo = { entregados, omitidos: 2 };
    const alVuelo = calcularPagoDia(conteo, regla);
    assert.ok(Number.isInteger(ingresoEstimado(entregados, valorPedido(regla))));
    const pagoTotalGenerado = alVuelo.base + alVuelo.bono + alVuelo.dia;
    assert.equal(pagoTotalGenerado, alVuelo.total, `difiere en ${entregados} entregas`);
  }
});

// Y el mismo cruce desde el otro lado: un día ya congelado, releído con su
// propia tarifa, tiene que dar exactamente las cifras que la base le escribió.
test("releer un día congelado con su tarifa reproduce sus cifras", () => {
  const dia = P({
    pedidos_entregados: 32,
    pedidos_no_entregados: 5,
    regla_valor_pedido: 950,
    regla_tipo_pago: "monto_fijo",
    regla_valor_pago: "300.00",
    regla_monto_dia: 15000,
    regla_meta_entregas_dia: 30,
    regla_bono_monto: 8000,
  });
  const recalculado = calcularPagoDia(
    { entregados: dia.pedidos_entregados, omitidos: dia.pedidos_no_entregados },
    tarifaDelDia(dia),
  );
  assert.equal(recalculado.base, 32 * 300);
  assert.equal(recalculado.dia, 15000);
  assert.equal(recalculado.bono, 8000, "32 >= 30, el bono se paga");
  assert.equal(recalculado.total, 32 * 300 + 15000 + 8000);
  assert.equal(ingresoEstimado(32, valorPedido(tarifaDelDia(dia))), 32 * 950);
});
