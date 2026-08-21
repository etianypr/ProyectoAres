// El resumen que ve el jefe: que los totales coincidan con el detalle, que los
// rechazos se puedan distinguir, y que NADA de esto haya movido el pago.
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
  contarMotivos,
  reintentables,
  calcularPagoDia,
  ingresoEstimado,
  valorPedido,
  tarifaDelDia,
  MOTIVOS_CERO,
  PAGO_CERO,
} = await import("@/lib/encomiendas/pago");

const { ENCOMIENDA_MOTIVOS_NO_ENTREGA, motivoReintentable } = await import("@/types/db");

const CHOFER = "11111111-1111-7111-8111-111111111111";
const HOY = "2026-08-20";

/** Un evento de actividad como lo devuelve la base. */
const EV = (extra = {}) => ({
  chofer_id: CHOFER,
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
// Los cuatro resultados, distinguibles
// ===========================================================================

test("los tres motivos tienen etiqueta mostrable, y solo el rechazo no se reintenta", () => {
  assert.deepEqual(Object.keys(ENCOMIENDA_MOTIVOS_NO_ENTREGA).sort(), [
    "persona_no_encontrada",
    "rechazo",
    "sin_respuesta",
  ]);
  for (const etiqueta of Object.values(ENCOMIENDA_MOTIVOS_NO_ENTREGA)) {
    assert.ok(etiqueta.length > 0, "un motivo quedó sin etiqueta y el panel mostraría el id");
  }

  assert.equal(motivoReintentable("persona_no_encontrada"), true);
  assert.equal(motivoReintentable("sin_respuesta"), true);
  assert.equal(motivoReintentable("rechazo"), false);
  // Una omisión anterior a la 0003 no tiene motivo. Se trata como reintentable,
  // que es lo que era cuando se registró.
  assert.equal(motivoReintentable(null), true);
});

test("contarMotivos separa los cuatro casos", () => {
  const eventos = [
    EV(),
    EV(),
    EV({ tipo: "omision", motivo: "persona_no_encontrada" }),
    EV({ tipo: "omision", motivo: "persona_no_encontrada" }),
    EV({ tipo: "omision", motivo: "sin_respuesta" }),
    EV({ tipo: "omision", motivo: "rechazo" }),
    EV({ tipo: "omision", motivo: null }),
    EV({ tipo: "llamada" }),
  ];

  assert.deepEqual(contarMotivos(eventos), {
    personaNoEncontrada: 2,
    sinRespuesta: 1,
    rechazos: 1,
    sinMotivo: 1,
  });
});

test("una entrega con motivo no se cuenta como no entrega", () => {
  // La base lo impide con un check (0003), pero si una fila así llegara igual,
  // contarla acá taparía el problema en vez de mostrarlo.
  assert.deepEqual(contarMotivos([EV({ tipo: "entrega", motivo: "rechazo" })]), MOTIVOS_CERO);
});

test("una llamada nunca cuenta como no entrega", () => {
  assert.deepEqual(contarMotivos([EV({ tipo: "llamada" })]), MOTIVOS_CERO);
});

test("un motivo que la app todavía no conoce no se reparte entre los otros", () => {
  // Es lo que pasaría con una versión nueva del teléfono contra un panel viejo:
  // mejor "no se sabe" que sumarlo al azar a una de las tres categorías.
  const r = contarMotivos([EV({ tipo: "omision", motivo: "algo_nuevo" })]);
  assert.equal(r.sinMotivo, 1);
  assert.equal(r.personaNoEncontrada + r.sinRespuesta + r.rechazos, 0);
});

test("los reintentables son todo menos los rechazos", () => {
  assert.equal(
    reintentables({ personaNoEncontrada: 3, sinRespuesta: 2, rechazos: 4, sinMotivo: 1 }),
    6,
  );
  assert.equal(reintentables(MOTIVOS_CERO), 0);
});

// ===========================================================================
// SC-006: el resumen coincide con el detalle
// ===========================================================================

test("el desglose de un día suma exactamente sus no entregas", () => {
  const eventos = [
    EV(),
    EV({ tipo: "omision", motivo: "persona_no_encontrada" }),
    EV({ tipo: "omision", motivo: "rechazo" }),
    EV({ tipo: "omision", motivo: null }),
    EV({ tipo: "llamada" }),
  ];

  const [dia] = agruparPorDia(eventos);
  const { personaNoEncontrada, sinRespuesta, rechazos, sinMotivo } = dia.motivos;

  assert.equal(
    personaNoEncontrada + sinRespuesta + rechazos + sinMotivo,
    dia.conteo.omitidos,
    "el desglose no suma lo mismo que el total de no entregadas",
  );
});

test("agruparPorDia y contarMotivos dan lo mismo: no hay dos fuentes de verdad", () => {
  // Se calculan en lugares distintos (una por día, la otra sobre una lista
  // cualquiera). Si discreparan, el panel del periodo y el del día mostrarían
  // números diferentes del mismo hecho.
  const eventos = [
    EV(),
    EV({ tipo: "omision", motivo: "sin_respuesta" }),
    EV({ tipo: "omision", motivo: "sin_respuesta" }),
    EV({ tipo: "omision", motivo: "rechazo" }),
    EV({ tipo: "omision" }),
  ];

  const [dia] = agruparPorDia(eventos);
  assert.deepEqual(dia.motivos, contarMotivos(eventos));
});

test("con varios conductores y días, cada uno lleva su propio desglose", () => {
  const eventos = [
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "omision", motivo: "rechazo" }),
    EV({ chofer_id: "c1", fecha: "2026-08-01" }),
    EV({ chofer_id: "c2", fecha: "2026-08-01", tipo: "omision", motivo: "persona_no_encontrada" }),
    EV({ chofer_id: "c1", fecha: "2026-08-02", tipo: "omision", motivo: "sin_respuesta" }),
  ];

  const dias = agruparPorDia(eventos);
  assert.equal(dias.length, 3);

  const buscar = (chofer, fecha) =>
    dias.find((d) => d.choferId === chofer && d.fecha === fecha);

  assert.equal(buscar("c1", "2026-08-01").motivos.rechazos, 1);
  assert.equal(buscar("c1", "2026-08-01").conteo.entregados, 1);
  assert.equal(buscar("c2", "2026-08-01").motivos.personaNoEncontrada, 1);
  assert.equal(buscar("c2", "2026-08-01").motivos.rechazos, 0, "se mezcló el rechazo de otro");
  assert.equal(buscar("c1", "2026-08-02").motivos.sinRespuesta, 1);
});

test("el total del periodo es la suma de los días, sin dobles conteos", () => {
  const eventos = [];
  for (let d = 1; d <= 10; d++) {
    const fecha = `2026-08-${String(d).padStart(2, "0")}`;
    for (let i = 0; i < 5; i++) eventos.push(EV({ fecha }));
    eventos.push(EV({ fecha, tipo: "omision", motivo: "rechazo" }));
    eventos.push(EV({ fecha, tipo: "omision", motivo: "persona_no_encontrada" }));
  }

  const dias = agruparPorDia(eventos);
  assert.equal(dias.length, 10);
  assert.equal(
    dias.reduce((a, d) => a + d.motivos.rechazos, 0),
    10,
  );
  assert.equal(
    dias.reduce((a, d) => a + d.conteo.entregados, 0),
    50,
  );
  // Y el total de no entregadas coincide con la suma de los desgloses.
  assert.equal(
    dias.reduce((a, d) => a + d.conteo.omitidos, 0),
    dias.reduce((a, d) => a + reintentables(d.motivos) + d.motivos.rechazos, 0),
  );
});

test("un evento sin la columna motivo no rompe la agregación", () => {
  // Es una fila anterior a la 0003, o una consulta que no pidió la columna.
  const eventos = [{ chofer_id: CHOFER, fecha: HOY, tipo: "omision", origen: "app" }];
  const [dia] = agruparPorDia(eventos);

  assert.equal(dia.conteo.omitidos, 1);
  assert.equal(dia.motivos.sinMotivo, 1);
});

test("un día sin eventos no aparece: eso ES la definición de día trabajado", () => {
  assert.deepEqual(agruparPorDia([]), []);
});

// ===========================================================================
// T042: nada de esto movió el pago
// ===========================================================================

test("el motivo NO entra en el conteo que paga", () => {
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

test("el pago del día es el mismo con cualquier combinación de motivos", () => {
  // Es la comprobación de T042 sobre la aritmética real: dos días con las mismas
  // entregas se pagan igual, aunque uno tenga cinco rechazos y el otro ninguno.
  const base = calcularPagoDia({ entregados: 20, omitidos: 0 }, TARIFA);

  for (const omitidos of [0, 1, 5, 50]) {
    assert.deepEqual(
      calcularPagoDia({ entregados: 20, omitidos }, TARIFA),
      base,
      `${omitidos} no entregadas movieron el pago`,
    );
  }
});

test("un día entero de rechazos se paga el fijo, y nada más", () => {
  // El chofer salió y trabajó: le corresponde el fijo diario. Y no le
  // corresponde nada por pedido, porque no entregó ninguno.
  const pago = calcularPagoDia({ entregados: 0, omitidos: 12 }, TARIFA);

  assert.equal(pago.base, 0);
  assert.equal(pago.dia, TARIFA.monto_dia);
  assert.equal(pago.bono, 0);
  assert.equal(pago.total, TARIFA.monto_dia);
});

test("el ingreso estimado se calcula solo con las entregas", () => {
  assert.equal(ingresoEstimado(10, 950), 9500);
  // Un rechazo no genera ingreso: nunca se entregó nada.
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
  // credenciales de Supabase (ver la nota de quickstart.md). Lo que está en
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
