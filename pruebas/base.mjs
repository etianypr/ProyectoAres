// Verificación del ESQUEMA de encomiendas contra lo que el código da por hecho.
// SOLO LECTURA: no escribe, no borra, no toca ninguna fila.
//
//   npm run test:base
//
// Existe por un caso real: una migración agregaba encomienda_actividad.origen y
// no se había corrido en la base. Todas las consultas del panel la pedían, así
// que fallaban; la página descartaba el error y mostraba "No hay actividad
// registrada en este periodo" con los KPI en $0. Ni el typecheck, ni el lint, ni
// el build lo pueden ver: para todos ellos el código está perfecto. Esto sí.
//
// Corré esto después de cada migración: la sección 5 es la que dice si las
// liquidaciones están completas y cuadradas.
import { createClient } from "@supabase/supabase-js";
import {
  agruparPorDia,
  calcularPagoDia,
  ingresoEstimado,
  tarifaDelDia,
  valorPedido,
} from "@/lib/encomiendas/pago";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Corré:  npm run test:base   (que lee .env.local)",
  );
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false } });

const fallas = [];
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  console.log(`  FALLA ${m}`);
  fallas.push(m);
};

console.log(`\nProyecto: ${url}\n`);

// ---------------------------------------------------------------------------
console.log("=== 1. Tablas ===");
// Ojo con head:true acá: una petición HEAD no trae cuerpo, así que error.message
// llega VACÍO y "la tabla no existe" se confunde con "todo bien". Por eso se
// pide una fila de verdad.
for (const [tabla, deberia] of [
  ["encomienda_actividad", true],
  ["encomienda_jornadas", true],
  ["encomienda_pagos", true],
  ["encomienda_reglas_pago", true],
  ["encomienda_periodos_facturacion", true],
  ["encomienda_ingresos_reales", true],
  ["encomienda_whatsapp_correlaciones", true],
  // Datos personales de destinatarios: nunca deben existir en esta base. Si
  // aparecen, alguien corrió acá una migración vieja del sistema del que se
  // separó este proyecto, o restauró un respaldo que no corresponde.
  ["encomienda_pedidos", false],
  ["encomienda_rutas", false],
  ["encomienda_paradas", false],
  // Del otro negocio. Mismo motivo: acá no van.
  ["viajes", false],
  ["facturas", false],
  ["conductor_categorias", false],
]) {
  const { error } = await db.from(tabla).select("*").limit(1);
  const existe = !error || !/does not exist|Could not find the table/i.test(error.message);
  if (existe === deberia) ok(`${tabla} ${deberia ? "existe" : "no existe (correcto)"}`);
  else if (deberia) mal(`${tabla}: NO existe y el código la usa — ${error?.message}`);
  else mal(`${tabla}: existe y no debería — ¿se corrió acá una migración del otro sistema?`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Las consultas exactas del código ===");
for (const [tabla, select, quien] of [
  ["encomienda_actividad", "conductor_id, fecha, tipo, origen", "encomiendas/actions.ts"],
  ["encomienda_reglas_pago", "valor_pedido", "valor por entrega"],
  [
    "encomienda_ingresos_reales",
    "id, periodo_id, anio, mes, monto, nota",
    "ingresos reales por periodo",
  ],
  [
    "encomienda_actividad",
    "conductor_id, fecha, tipo, origen, conductor:conductores(id,nombre)",
    "/encomiendas",
  ],
  [
    "encomienda_actividad",
    "id, conductor_id, fecha, tipo, origen, hora, created_at, conductor:conductores(id,nombre)",
    "/encomiendas/dia",
  ],
  [
    "encomienda_pagos",
    "id, empresa_id, conductor_id, fecha, pedidos_entregados, pedidos_no_entregados, ingresos_totales, pago_base, pago_dia, pago_bono, pago_total, calculado_en, regla_valor_pedido, regla_tipo_pago, regla_valor_pago, regla_monto_dia, regla_meta_entregas_dia, regla_bono_monto",
    "tipo PagoDelDia",
  ],
  [
    "encomienda_reglas_pago",
    "id, empresa_id, tipo_pago, valor_pago, valor_pedido, monto_dia, meta_entregas_dia, bono_monto, created_at, updated_at",
    "tipo ReglaDePago",
  ],
  ["encomienda_jornadas", "id, conductor_id, fecha, inicio, cerrada_en", "tipo DiaTrabajo"],
  [
    "encomienda_periodos_facturacion",
    "id, fecha_inicio, fecha_fin",
    "periodos de facturación",
  ],
  ["conductores", "id, nombre, activo", "selector de Agregar día"],
]) {
  const { error } = await db.from(tabla).select(select).limit(1);
  if (error) mal(`${quien}: ${error.message}`);
  else ok(quien);
}

console.log("\n=== 3. Columnas que el código ESCRIBE ===");
for (const [tabla, columnas] of Object.entries({
  encomienda_actividad: ["id", "conductor_id", "fecha", "tipo", "hora", "origen"],
  encomienda_jornadas: ["conductor_id", "fecha", "inicio", "cerrada_en"],
  encomienda_reglas_pago: [
    "tipo_pago", "valor_pago", "valor_pedido", "monto_dia", "meta_entregas_dia", "bono_monto",
  ],
  encomienda_ingresos_reales: ["periodo_id", "monto", "nota", "anio", "mes"],
  encomienda_periodos_facturacion: ["fecha_inicio", "fecha_fin"],
})) {
  const faltan = [];
  for (const col of columnas) {
    const { error } = await db.from(tabla).select(col).limit(1);
    if (error) faltan.push(col);
  }
  if (faltan.length) mal(`${tabla}: faltan las columnas ${faltan.join(", ")}`);
  else ok(`${tabla}: las ${columnas.length} columnas que se escriben existen`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Las funciones de la base ===");
// La cuenta del pago vive en Postgres, no en la app: el teléfono del conductor
// escribe directo contra la base. Si estas dos no están, los días se registran
// pero no se valoran nunca y nadie cobra.
for (const [fn, args] of [
  ["encomienda_repreciar_dia", { p_conductor_id: null, p_fecha: "2000-01-01" }],
  [
    "encomienda_valorar_dia",
    { p_conductor_id: null, p_fecha: "2000-01-01", p_valor_pedido: 1, p_tipo_pago: "monto_fijo", p_valor_pago: 0 },
  ],
]) {
  // Se llama con conductor_id null a propósito: la función existe si responde
  // CUALQUIER cosa que no sea "no la encuentro". Con la llave service_role el
  // control de rol de adentro la rechaza, y eso también prueba que existe.
  const { error } = await db.rpc(fn, args);
  if (error && /Could not find the function|does not exist/i.test(error.message)) {
    mal(`${fn}: la función no existe — los días no se van a poder recalcular`);
  } else ok(`${fn} existe`);
}

// El cierre automático de días. Sin él, el día que el conductor no
// cerró (batería, olvido) no se valora nunca y ese día no se paga.
const { data: cron, error: errCron } = await db
  .schema("cron")
  .from("job")
  .select("jobname, schedule, active")
  .eq("jobname", "encomienda-cerrar-jornadas");
if (errCron) {
  console.log(`  (no se pudo leer cron.job: ${errCron.message} — comprobalo en el panel)`);
} else if (!cron?.length) {
  mal("el trabajo 'encomienda-cerrar-jornadas' no está programado: las jornadas sin cerrar no se pagarían");
} else if (!cron[0].active) {
  mal("'encomienda-cerrar-jornadas' está programado pero INACTIVO");
} else ok(`cierre automático programado (${cron[0].schedule})`);

// El barrido de correlaciones de WhatsApp es lo que garantiza el tope de 72
// horas de retención. Si no está programado, un día que nunca se cierra
// deja sus correlaciones vivas para siempre — y eso es incumplir la política de
// datos que documenta el producto, no solo dejar basura.
const { data: cronWsp, error: errCronWsp } = await db
  .schema("cron")
  .from("job")
  .select("jobname, schedule, active")
  .eq("jobname", "encomienda-limpiar-correlaciones");
if (errCronWsp) {
  console.log(`  (no se pudo leer cron.job: ${errCronWsp.message} — comprobalo en el panel)`);
} else if (!cronWsp?.length) {
  mal(
    "el trabajo 'encomienda-limpiar-correlaciones' no está programado: " +
      "las correlaciones de WhatsApp no se borrarían nunca (migración 0003)",
  );
} else if (!cronWsp[0].active) {
  mal("'encomienda-limpiar-correlaciones' está programado pero INACTIVO");
} else ok(`limpieza de correlaciones programada (${cronWsp[0].schedule})`);

// ---------------------------------------------------------------------------
console.log("\n=== 5. Valores fuera de los check de la base ===");
const { data: actividad } = await db
  .from("encomienda_actividad")
  .select("conductor_id, fecha, tipo, origen, hora, conductor:conductores(id,nombre)");
const raros = (actividad ?? []).filter(
  (a) => !["entrega", "omision", "llamada"].includes(a.tipo) || !["app", "manual"].includes(a.origen),
);
if (raros.length) mal(`${raros.length} evento(s) con tipo u origen desconocido`);
else ok(`${actividad?.length ?? 0} eventos, todos con tipo y origen válidos`);

// La fecha la manda el TELÉFONO en hora de Chile (hoyChile), no se deduce de la
// hora del servidor: una entrega de las 21:30 en Arica ya es del día siguiente
// en UTC y el pago se correría de día. Acá se comprueba que efectivamente sea así.
//
// Los eventos de carga manual quedan fuera: su hora es de relleno (mediodía UTC
// del día cargado), no la hora real, así que compararla no dice nada.
const desfasados = (actividad ?? []).filter(
  (e) =>
    e.origen === "app" &&
    new Date(e.hora).toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) !== e.fecha,
);
if (desfasados.length) {
  mal(`${desfasados.length} evento(s) imputados a un día distinto del que ocurrieron (zona horaria)`);
} else ok("todos los eventos del teléfono caen en su día de calendario chileno");

// ---------------------------------------------------------------------------
console.log("\n=== 6. Liquidaciones ===");
const { data: pagos } = await db.from("encomienda_pagos").select("*");
if (!pagos?.length) console.log("  (ninguna todavía)");
else {
  // pago_total es una columna GENERADA. Si deja de cuadrar, alguien la recreó
  // mal en una migración.
  const descuadres = pagos.filter(
    (p) => Number(p.pago_total) !== Number(p.pago_base) + Number(p.pago_bono) + Number(p.pago_dia),
  );
  if (descuadres.length) mal(`${descuadres.length} pago(s) donde pago_total != base + bono + día`);
  else ok(`pago_total cuadra en las ${pagos.length} liquidaciones`);

  // El panel suma pago_total. Si llegara como string, la suma concatenaría.
  if (typeof pagos[0].pago_total !== "number") {
    mal(`pago_total llega como ${typeof pagos[0].pago_total}, no como number`);
  } else ok("pago_total llega como number");

  // Cada día tiene que traer la tarifa con la que se calculó. Sin ella no se
  // puede auditar, y cualquier recálculo lo movería a la regla de hoy.
  const sinTarifa = pagos.filter((p) => p.conductor_id && p.regla_valor_pedido == null);
  if (sinTarifa.length) mal(`${sinTarifa.length} liquidación(es) sin la tarifa con la que se calcularon`);
  else ok("todas las liquidaciones traen su tarifa congelada");

  // Y esa tarifa tiene que reproducir las cifras guardadas. Es el cruce entre la
  // cuenta en SQL (la que escribió estas filas) y la de TS: si difieren, el panel
  // muestra una cosa y se paga otra.
  const difieren = pagos.filter((p) => {
    const t = tarifaDelDia(p);
    if (!t) return false;
    const r = calcularPagoDia(
      { entregados: p.pedidos_entregados, omitidos: p.pedidos_no_entregados },
      t,
    );
    return r.base !== p.pago_base || r.dia !== p.pago_dia || r.bono !== p.pago_bono;
  });
  if (difieren.length) {
    mal(
      `${difieren.length} día(s) donde recalcular con su propia tarifa da distinto de lo guardado ` +
        `(la cuenta en SQL y la de lib/encomiendas/pago.ts no coinciden)`,
    );
  } else ok("la cuenta de la base y la del código dan lo mismo en los días guardados");
}

// ---------------------------------------------------------------------------
console.log("\n=== 7. Días de trabajo ===");
const { data: diasTrabajo } = await db.from("encomienda_jornadas").select("*");
const hoyCl = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const abiertasViejas = (diasTrabajo ?? []).filter((j) => j.fecha < hoyCl && j.cerrada_en == null);
if (abiertasViejas.length) {
  mal(
    `${abiertasViejas.length} día(s) de días pasados sin cerrar: esos días NO se valoran ` +
      `y el conductor no cobra. Debería cerrarlas el barrido nocturno.`,
  );
} else ok(`${diasTrabajo?.length ?? 0} días de trabajo, ninguna vieja quedó abierta`);

// Días con actividad y sin día de trabajo: no se valoran nunca.
const clavesDia = new Set((diasTrabajo ?? []).map((j) => `${j.conductor_id}|${j.fecha}`));
const sinDiaTrabajo = [
  ...new Set(
    (actividad ?? [])
      .filter((a) => a.conductor_id && a.fecha < hoyCl)
      .map((a) => `${a.conductor_id}|${a.fecha}`)
      .filter((k) => !clavesDia.has(k)),
  ),
];
if (sinDiaTrabajo.length) mal(`${sinDiaTrabajo.length} día(s) pasado(s) con actividad y sin día: no se valoran`);
else ok("todo día pasado con actividad tiene su día");

// ---------------------------------------------------------------------------
console.log("\n=== 8. Truncado de PostgREST ===");
// El panel del periodo pide TODA la actividad del mes de una vez, sin paginar.
// Si el proyecto tiene el "Max rows" por defecto de Supabase (1000) y el mes
// pasa esa cifra, la respuesta se corta EN SILENCIO: el panel muestra menos
// entregas de las que hubo.
const { data: todas, count: total } = await db
  .from("encomienda_actividad")
  .select("id", { count: "exact" });
console.log(`  ${total} filas en la tabla · la API devolvió ${todas?.length ?? 0}`);
if (total > 0 && (todas?.length ?? 0) < total) {
  mal(`PostgREST trunca a ${todas.length}: el panel del periodo subcontaría entregas`);
} else if (total < 900) {
  console.log("  (todavía hay pocas filas para que el tope se note; revisar al crecer)");
} else ok("no hay truncado con el volumen actual");

// ---------------------------------------------------------------------------
console.log("\n=== 9. Lo que va a mostrar /encomiendas ===");
const { data: reglaData } = await db.from("encomienda_reglas_pago").select("*").limit(1).maybeSingle();
if (!reglaData) {
  console.log(
    "  ⚠ No hay regla de pago configurada: TODO día nuevo sale 'Sin regla' y el KPI\n" +
      "    'A pagar' queda en $0. Se carga en /encomiendas, botón 'Regla de pago'.",
  );
}
const porFecha = new Map((pagos ?? []).map((p) => [`${p.conductor_id}|${p.fecha}`, p]));
for (const d of agruparPorDia(actividad ?? [])) {
  // La tarifa de cada día es la SUYA, no la regla de hoy: es lo que va a mostrar
  // el panel. Si el día todavía no está valorado, se usa la regla como vista previa.
  const tarifa = tarifaDelDia(porFecha.get(`${d.conductorId}|${d.fecha}`)) ?? reglaData;
  const pago = calcularPagoDia(d.conteo, tarifa);
  console.log(
    `  ${d.fecha}  ${d.eventos[0]?.conductor?.nombre ?? "Conductor eliminado"}  ` +
      `${d.conteo.entregados} entregados · ${d.conteo.omitidos} no entregados · ` +
      `ingresos $${ingresoEstimado(d.conteo.entregados, valorPedido(tarifa)).toLocaleString("es-CL")} · ` +
      `a pagar $${pago.total.toLocaleString("es-CL")}${tarifa ? "" : "  [Sin regla]"}` +
      `${d.manuales ? `  [${d.manuales === d.eventos.length ? "Carga manual" : "Manual parcial"}]` : ""}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== 10. WhatsApp: la correlación no es un registro de destinatarios ===");
//
// Esta sección es el guardia del principio V de la constitución. La tabla
// encomienda_whatsapp_correlaciones es la ÚNICA excepción que esta feature pidió
// al "no custodiar datos de destinatarios", y se aprobó porque está recortada a
// identificadores opacos. Si alguien le agrega el teléfono o el nombre "para
// depurar más fácil", esa aprobación deja de valer — y hay que enterarse acá y
// no en una auditoría.
{
  const { data: correlaciones, error: errCorr } = await db
    .from("encomienda_whatsapp_correlaciones")
    .select("*");

  if (errCorr) {
    mal(`encomienda_whatsapp_correlaciones: ${errCorr.message}`);
  } else {
    // (a) Ninguna columna puede parecerse a un dato personal. Se mira una fila
    //     real; si la tabla está vacía se comprueba contra el tipo, que es lo
    //     que el código da por hecho de todos modos.
    const PROHIBIDAS = [
      "telefono", "phone", "phone_hash", "telefono_hash",
      "nombre", "name", "direccion", "address", "lat", "lng",
      "mensaje", "cuerpo", "body", "texto", "conversacion", "orden",
    ];
    const columnas = correlaciones?.length ? Object.keys(correlaciones[0]) : [];
    const filtradas = columnas.filter((c) => PROHIBIDAS.includes(c));
    if (filtradas.length) {
      mal(
        `¡encomienda_whatsapp_correlaciones tiene columnas de datos personales: ${filtradas.join(", ")}! ` +
          "La excepción aprobada en la 0003 no las incluye",
      );
    } else if (columnas.length) {
      ok(`correlaciones: ${columnas.length} columnas, ninguna con datos del receptor`);
    } else {
      ok("correlaciones: tabla vacía (nada que revisar hoy)");
    }

    // (b) La retención de 72 horas se está cumpliendo de verdad. Es el número
    //     que el documento principal le promete al lector, así que se mide
    //     contra las filas que hay, no contra la intención del cron.
    const limite = Date.now() - 72 * 3600 * 1000;
    const viejas = (correlaciones ?? []).filter((c) => new Date(c.created_at).getTime() < limite);
    if (viejas.length) {
      mal(
        `${viejas.length} correlación(es) con más de 72 horas: la limpieza no está corriendo ` +
          "y se está incumpliendo la retención documentada",
      );
    } else ok(`retención respetada (${correlaciones?.length ?? 0} correlación(es) en vuelo)`);

    // (c) Una respuesta ya aplicada no tiene por qué seguir ahí: el teléfono
    //     confirmó, la fila sobra. No es una falla si el barrido todavía no
    //     pasó, pero acumular muchas quiere decir que nadie la está borrando.
    const aplicadas = (correlaciones ?? []).filter((c) => c.aplicada_en);
    if (aplicadas.length > 20) {
      mal(`${aplicadas.length} correlaciones ya aplicadas siguen en la base: la limpieza no está borrando`);
    } else ok(`${aplicadas.length} correlación(es) aplicada(s) esperando el barrido`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 11. Motivo de no entrega ===");
{
  const { data: conMotivo, error: errMotivo } = await db
    .from("encomienda_actividad")
    .select("tipo, motivo")
    .not("motivo", "is", null);

  if (errMotivo) {
    mal(`encomienda_actividad.motivo: ${errMotivo.message} — falta correr la migración 0003`);
  } else {
    // Columna heredada: desde la spec 012 nadie la escribe. Se borra en 002 T051.
    const MOTIVOS = ["persona_no_encontrada", "sin_respuesta", "rechazo"];
    // Un motivo en una entrega significa que el check de la 0003 no está puesto,
    // y que el panel va a mostrar un motivo sobre una entrega exitosa.
    const malPuestos = (conMotivo ?? []).filter(
      (a) => a.tipo !== "omision" || !MOTIVOS.includes(a.motivo),
    );
    if (malPuestos.length) mal(`${malPuestos.length} evento(s) con un motivo imposible`);
    else ok(`${conMotivo?.length ?? 0} omisión(es) con motivo, todas válidas`);

  }
}

// ---------------------------------------------------------------------------
console.log("\n=== 12. RLS: sin sesión no se ve nada ===");
if (anon) {
  const publico = createClient(url, anon, { auth: { persistSession: false } });
  for (const tabla of [
    "encomienda_actividad",
    "encomienda_jornadas",
    "encomienda_pagos",
    "encomienda_reglas_pago",
    "encomienda_ingresos_reales",
    "encomienda_whatsapp_correlaciones",
    "conductores",
  ]) {
    const { data, error } = await publico.from(tabla).select("*").limit(1);
    if (error || (data?.length ?? 0) === 0) ok(`${tabla}: un anónimo no lee nada`);
    else mal(`${tabla}: ¡un anónimo lee ${data.length} fila(s)!`);
  }
}

console.log(
  fallas.length === 0
    ? "\n=== SIN FALLAS DE ESQUEMA ===\n"
    : `\n=== ${fallas.length} FALLA(S) ===\n${fallas.map((f) => " - " + f).join("\n")}\n`,
);
// exitCode y no process.exit(): salir a la fuerza mientras el hilo del resolvedor
// de módulos sigue vivo hace que libuv aborte en Windows con un "Assertion failed".
process.exitCode = fallas.length === 0 ? 0 : 1;
