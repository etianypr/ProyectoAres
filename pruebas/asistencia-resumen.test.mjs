// El resumen que ve el jefe: que los totales coincidan con el detalle y que
// NADA de esto haya movido el pago. Desde la spec 012 no hay motivos: se
// entregó o no.
//
// Las dos mitades de este archivo protegen cosas distintas:
//
//  · La agregación (SC-006): el resumen tiene que coincidir con el detalle
//    individual en el 100% de los casos. Un desglose que no suma es peor que no
//    tener desglose, porque el jefe le cree.
//  · La liquidación (T042): esta feature agregó una columna a los eventos y una
//    categoría al panel. Ninguna de las dos puede cambiar ni un peso de lo que
//    ya se pagó, y acá se comprueba contra la aritmética real de pago.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  agruparPorDia,
  contarActividad,
  calcularPagoDia,
  ingresoEstimado,
  valorPedido,
  tarifaDelDia,
  PAGO_CERO,
} = await import("@/lib/encomiendas/pago");


const CONDUCTOR = "11111111-1111-7111-8111-111111111111";
const HOY = "2026-08-20";

/** Un evento de actividad como lo devuelve la base. */
const EV = (extra = {}) => ({
  conductor_id: CONDUCTOR,
  fecha: HOY,
  tipo: "entrega",
  origen: "app",
  motivo: null,
  ...extra,
});

const TARIFA = {
  tipo_pago: "monto_fijo",
  valor_pago: 300,
  valor_pedido: 950,
  monto_dia: 12000,
  meta_entregas_dia: 30,
  bono_monto: 10000,
};

// ===========================================================================
// SC-006: el resumen coincide con el detalle
// ===========================================================================

test("cada conductor y día lleva su propia cuenta de entregados y no entregados", () => {
  const eventos = [
    EV({ conductor_id: "c1", fecha: "2026-08-01", tipo: "omision" }),
    EV({ conductor_id: "c1", fecha: "2026-08-01" }),
    EV({ conductor_id: "c2", fecha: "2026-08-01", tipo: "omision" }),
    EV({ conductor_id: "c1", fecha: "2026-08-02", tipo: "omision" }),
    EV({ conductor_id: "c1", fecha: "2026-08-02", tipo: "llamada" }),
  ];

  const dias = agruparPorDia(eventos);
  assert.equal(dias.length, 3);
  const buscar = (conductor, fecha) => dias.find((d) => d.conductorId === conductor && d.fecha === fecha);

  assert.deepEqual(buscar("c1", "2026-08-01").conteo, { entregados: 1, omitidos: 1 });
  assert.deepEqual(buscar("c2", "2026-08-01").conteo, { entregados: 0, omitidos: 1 });
  assert.deepEqual(buscar("c1", "2026-08-02").conteo, { entregados: 0, omitidos: 1 }, "la llamada contó");
});

test("el total del periodo es la suma de los días, sin dobles conteos", () => {
  const eventos = [];
  for (let d = 1; d <= 10; d++) {
    const fecha = `2026-08-${String(d).padStart(2, "0")}`;
    for (let i = 0; i < 5; i++) eventos.push(EV({ fecha }));
    eventos.push(EV({ fecha, tipo: "omision" }), EV({ fecha, tipo: "omision" }));
  }

  const dias = agruparPorDia(eventos);
  assert.equal(dias.length, 10);
  assert.equal(dias.reduce((a, d) => a + d.conteo.entregados, 0), 50);
  assert.equal(dias.reduce((a, d) => a + d.conteo.omitidos, 0), 20);
  assert.deepEqual(contarActividad(eventos), { entregados: 50, omitidos: 20 });
});

test("las filas viejas con motivo cuentan igual como no entregadas", () => {
  // Antes de la spec 012 la omisión llevaba un motivo (No morador, rechazo, sin
  // respuesta). La base las conserva; el panel ya no las separa.
  const eventos = ["persona_no_encontrada", "rechazo", "sin_respuesta", null].map((motivo) =>
    EV({ tipo: "omision", motivo }),
  );
  const [dia] = agruparPorDia(eventos);
  assert.deepEqual(dia.conteo, { entregados: 0, omitidos: 4 });
});

test("un día sin eventos no aparece: eso ES la definición de día trabajado", () => {
  assert.deepEqual(agruparPorDia([]), []);
});

// ===========================================================================
// T042: nada de esto movió el pago
// ===========================================================================

test("un motivo viejo NO entra en el conteo que paga", () => {
  // La misma cantidad de entregas y omisiones, con y sin motivos: el conteo que
  // alimenta la liquidación tiene que ser idéntico.
  const sinMotivos = [EV(), EV(), EV({ tipo: "omision" }), EV({ tipo: "omision" })];
  const conMotivos = [
    EV(),
    EV(),
    EV({ tipo: "omision", motivo: "rechazo" }),
    EV({ tipo: "omision", motivo: "persona_no_encontrada" }),
  ];

  assert.deepEqual(contarActividad(sinMotivos), contarActividad(conMotivos));
  assert.deepEqual(
    agruparPorDia(sinMotivos)[0].conteo,
    agruparPorDia(conMotivos)[0].conteo,
  );
});

test("el pago del día no depende de las no entregas", () => {
  // Es la comprobación de T042 sobre la aritmética real: dos días con las mismas
  // entregas se pagan igual, aunque uno tenga cinco no entregas y el otro ninguna.
  const base = calcularPagoDia({ entregados: 20, omitidos: 0 }, TARIFA);

  for (const omitidos of [0, 1, 5, 50]) {
    assert.deepEqual(
      calcularPagoDia({ entregados: 20, omitidos }, TARIFA),
      base,
      `${omitidos} no entregadas movieron el pago`,
    );
  }
});

test("un día entero sin entregas se paga el fijo, y nada más", () => {
  // El conductor salió y trabajó: le corresponde el fijo diario. Y no le
  // corresponde nada por pedido, porque no entregó ninguno.
  const pago = calcularPagoDia({ entregados: 0, omitidos: 12 }, TARIFA);

  assert.equal(pago.base, 0);
  assert.equal(pago.dia, TARIFA.monto_dia);
  assert.equal(pago.bono, 0);
  assert.equal(pago.total, TARIFA.monto_dia);
});

test("el ingreso estimado se calcula solo con las entregas", () => {
  assert.equal(ingresoEstimado(10, 950), 9500);
  // Una no entrega no genera ingreso: nunca se entregó nada.
  assert.equal(ingresoEstimado(0, 950), 0);
});

test("sin tarifa el día no vale cero: no se pudo calcular", () => {
  assert.deepEqual(calcularPagoDia({ entregados: 30, omitidos: 5 }, null), PAGO_CERO);
  assert.equal(tarifaDelDia(null), null);
  // Un pago sin las columnas de tarifa congeladas tampoco da una tarifa.
  assert.equal(tarifaDelDia({ regla_valor_pedido: null, regla_tipo_pago: null }), null);
});

test("valorPedido cae al respaldo cuando la tarifa no lo trae", () => {
  assert.equal(valorPedido({ ...TARIFA, valor_pedido: 1200 }), 1200);
  assert.ok(valorPedido(null) > 0, "sin tarifa la vista previa mostraría un hueco");
  // PostgREST devuelve numeric como string: sin el Number() se pasearía un NaN.
  assert.equal(valorPedido({ ...TARIFA, valor_pedido: "1500" }), 1500);
});

// ===========================================================================
// T042: la migración no toca lo que ya se pagó
// ===========================================================================

test("la 0003 no redefine ninguna función ni tabla de la liquidación", () => {
  // Se lee el SQL como texto porque la verificación de verdad necesita
  // credenciales de Supabase (`npm run test:base`). Lo que está en
  // juego son liquidaciones ya pagadas.
  const sql = readFileSync("supabase/migrations/0003_asistencia_ruta.sql", "utf8");

  for (const intocable of [
    "encomienda_congelar_dia",
    "encomienda_valorar_dia",
    "encomienda_pagos",
    "encomienda_reglas_pago",
    "encomienda_ingresos_reales",
  ]) {
    assert.ok(
      !new RegExp(`(create or replace function|drop table|alter table)[^;]*${intocable}`, "i").test(
        sql,
      ),
      `la 0003 toca ${intocable}: puede mover plata ya liquidada`,
    );
  }
});

test("la columna motivo es nullable y sin default: no reescribe el pasado", () => {
  // Rellenar las filas viejas con un valor inventado sería peor que dejarlas en
  // blanco: el panel afirmaría un motivo que nadie registró.
  const sql = readFileSync("supabase/migrations/0003_asistencia_ruta.sql", "utf8");
  const linea = sql.match(/add column if not exists motivo[^;]*/i)?.[0] ?? "";

  assert.ok(linea, "no encontré la columna motivo en la migración");
  assert.ok(!/not null/i.test(linea), "motivo quedó not null y las filas viejas no lo tienen");
  assert.ok(!/default/i.test(linea), "motivo quedó con default y eso inventa un motivo");
});

test("el trigger que congela el día sigue contando por tipo, no por motivo", () => {
  // Es lo que garantiza que la columna nueva no pueda cambiar una liquidación.
  // Se lee la 0002, que es donde vive la cuenta.
  const sql = readFileSync("supabase/migrations/0002_encomiendas.sql", "utf8");
  const cuenta = sql.match(/create or replace function private\.encomienda_congelar_dia[\s\S]*?\n\$\$;/);

  assert.ok(cuenta, "no encontré la función que congela el día");
  assert.ok(
    !/motivo/i.test(cuenta[0]),
    "la cuenta del pago empezó a mirar el motivo: una etiqueta operativa no puede mover plata",
  );
  assert.match(cuenta[0], /'entrega'/, "la cuenta ya no filtra por tipo 'entrega'");
});

test("recalcular o valorar un día exige rol de jefe, también sin sesión (0005)", () => {
  // get_rol() es null sin sesión y `null not in (...)` no lanza: la guarda tiene
  // que tratar el rol vacío como "sin permiso", y anon no puede ejecutarlas.
  for (const archivo of ["0002_encomiendas.sql", "0005_pago_solo_jefe.sql"]) {
    const sql = readFileSync(`supabase/migrations/${archivo}`, "utf8");
    assert.ok(
      !sql.includes("if (select private.get_rol()) not in"),
      `${archivo}: guarda que deja pasar al rol null`,
    );
    for (const fn of ["encomienda_repreciar_dia", "encomienda_valorar_dia"]) {
      const inicio = sql.indexOf(`create or replace function ${fn}`);
      const cuerpo = sql.slice(inicio, sql.indexOf("$$;", inicio));
      assert.ok(inicio >= 0, `${archivo}: falta ${fn}`);
      assert.ok(
        cuerpo.includes("coalesce((select private.get_rol())::text, '') not in ('admin', 'operador')"),
        `${archivo}: ${fn} no trata el rol vacío como sin permiso`,
      );
      const permisos = sql.slice(sql.indexOf(`revoke all on function ${fn}`));
      assert.match(permisos.slice(0, 200), /\) from public, anon;/, `${archivo}: ${fn} sigue abierta a anon`);
    }
  }
});
