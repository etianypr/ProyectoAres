// ============================================================================
// Trae los datos de encomiendas desde la base del sistema del que se separó este
// proyecto (ORIGEN) a la base de ares (DESTINO).
//
//   npm run migrar              # ENSAYO: no escribe nada, solo dice qué haría
//   npm run migrar -- --aplicar # escribe de verdad
//
// Lee las credenciales de .env.migracion (copiá .env.migracion.example). Hacen
// falta las llaves service_role de LAS DOS bases: este script tiene que leer
// saltándose RLS y escribir filas con ids ya decididos.
//
// Es RE-EJECUTABLE: todo se inserta con "upsert por id", así que correrlo dos
// veces no duplica nada. Si se corta a la mitad, se vuelve a correr y sigue.
//
// ----------------------------------------------------------------------------
// LO MÁS IMPORTANTE DE ESTE ARCHIVO: EL ORDEN
//
// La base de ares no es un depósito pasivo — tiene triggers que RECALCULAN la
// plata. Insertar estas tablas en el orden equivocado no da error: da cifras
// distintas, en silencio, y recién se nota cuando alguien compara una
// liquidación vieja con lo que dice el panel.
//
// El orden correcto, y por qué cada paso va donde va:
//
//   1. choferes      Nada depende de ellos todavía. Se conservan los ids
//                    ORIGINALES: así todas las filas de encomiendas siguen
//                    apuntando a quien apuntaban, sin remapear nada.
//   2. periodos      Los referencia encomienda_ingresos_reales (paso 7).
//   3. regla de pago Su insert dispara un barrido de "días cerrados sin cifras".
//                    Acá todavía no hay ninguna jornada, así que no hace nada —
//                    que es exactamente lo que se quiere. Después de las
//                    jornadas, ese mismo barrido valoraría días con la regla de
//                    hoy.
//   4. actividad     Su insert dispara "congelar si la jornada está cerrada".
//                    Todavía no hay jornadas: no congela nada.
//   5. pagos         Las cifras YA calculadas, con la tarifa con la que se
//                    calcularon (las columnas regla_*). Van ANTES que las
//                    jornadas, y esto es el corazón del asunto (sigue abajo).
//   6. jornadas      Cerrar una jornada dispara el cálculo del día. Como el paso
//                    5 ya dejó la fila de pago con SU tarifa congelada, la
//                    función la reusa y vuelve a dar exactamente lo mismo.
//   7. ingresos reales
//
// SI LOS PASOS 5 Y 6 SE INVIRTIERAN: al insertar la jornada cerrada, la base
// buscaría la tarifa del día, no la encontraría (no hay fila de pago todavía) y
// caería en la regla de AHORA. Todos los días históricos quedarían revalorizados
// con la tarifa actual. Un día de hace seis meses que se pagó a $300 por entrega
// aparecería pagado a lo que se pague hoy. Nadie lo vería hasta el reclamo.
//
// La sección final compara cifra por cifra origen contra destino, justamente
// para que esto no dependa de que este comentario se haya leído.
//
// ----------------------------------------------------------------------------
// LO QUE NO SE PUEDE MIGRAR: LAS CUENTAS DE ACCESO
//
// Las cuentas de Auth (auth.users) no se mueven entre proyectos de Supabase.
// Los conductores llegan con su ficha, su nombre y su correo, pero con
// `user_id` en null: no van a poder entrar hasta que un administrador los
// vuelva a invitar desde /choferes ("Invitar"). Es un botón por conductor y hay
// que hacerlo antes de que salgan a repartir.
//
// El aviso sale otra vez al final, con la lista de a quiénes hay que invitar.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");

const ORIGEN_URL = process.env.ORIGEN_SUPABASE_URL;
const ORIGEN_KEY = process.env.ORIGEN_SERVICE_ROLE_KEY;
const DESTINO_URL = process.env.DESTINO_SUPABASE_URL;
const DESTINO_KEY = process.env.DESTINO_SERVICE_ROLE_KEY;

if (!ORIGEN_URL || !ORIGEN_KEY || !DESTINO_URL || !DESTINO_KEY) {
  console.error(
    "Faltan credenciales. Copiá .env.migracion.example a .env.migracion y completá:\n" +
      "  ORIGEN_SUPABASE_URL / ORIGEN_SERVICE_ROLE_KEY   (la base del sistema viejo)\n" +
      "  DESTINO_SUPABASE_URL / DESTINO_SERVICE_ROLE_KEY (la base de ares)\n",
  );
  process.exit(1);
}

// Protección contra el error más caro posible: apuntar las dos a la misma base.
// Con origen == destino, los upserts se pisarían encima de los datos vivos.
if (ORIGEN_URL === DESTINO_URL) {
  console.error(
    "ORIGEN y DESTINO son el MISMO proyecto de Supabase. Eso no es una migración:\n" +
      "sería reescribir la base de origen encima de sí misma. Revisá .env.migracion.\n",
  );
  process.exit(1);
}

const origen = createClient(ORIGEN_URL, ORIGEN_KEY, { auth: { persistSession: false } });
const destino = createClient(DESTINO_URL, DESTINO_KEY, { auth: { persistSession: false } });

const problemas = [];
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  console.log(`  FALLA ${m}`);
  problemas.push(m);
};

console.log(`\nORIGEN  ${ORIGEN_URL}`);
console.log(`DESTINO ${DESTINO_URL}`);
console.log(APLICAR ? "\nMODO: APLICAR (se va a escribir)\n" : "\nMODO: ENSAYO (no se escribe nada)\n");

/** Saca las columnas que no existen o no se pueden escribir en el destino.
 *
 *  empresa_id SIEMPRE se va: apunta a la fila de empresa de la OTRA base, que en
 *  ares no existe (la FK lo rechazaría). Lo rellena solo el trigger
 *  set_empresa_id con la empresa de esta base. */
function limpiar(fila, quitar = []) {
  const copia = { ...fila };
  for (const col of ["empresa_id", ...quitar]) delete copia[col];
  return copia;
}

/** Trae TODAS las filas de una tabla, paginando.
 *
 *  Sin paginar, PostgREST corta en 1000 filas por respuesta y la migración se
 *  llevaría el primer mes y nada más, sin decir una palabra. La actividad crece
 *  ~1.500 filas al mes: el tope se pasa enseguida. */
async function traerTodo(tabla, orden = "id") {
  const filas = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await origen
      .from(tabla)
      .select("*")
      .order(orden)
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`leyendo ${tabla}: ${error.message}`);
    filas.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGINA) return filas;
  }
}

/** Escribe en el destino en lotes, con upsert por id (re-ejecutable). */
async function escribir(tabla, filas, { onConflict = "id" } = {}) {
  if (!filas.length) return 0;
  if (!APLICAR) return filas.length;
  const LOTE = 500;
  let escritas = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await destino.from(tabla).upsert(lote, { onConflict });
    if (error) throw new Error(`escribiendo ${tabla}: ${error.message}`);
    escritas += lote.length;
    process.stdout.write(`\r        ${tabla}: ${escritas}/${filas.length}`);
  }
  process.stdout.write("\r\x1b[K");
  return escritas;
}

try {
  // -------------------------------------------------------------------------
  console.log("=== 0. Qué hay en el origen ===");
  const [actividadOrigen, jornadasOrigen, pagosOrigen, reglasOrigen, periodosOrigen, ingresosOrigen] =
    await Promise.all([
      traerTodo("encomienda_actividad", "fecha"),
      traerTodo("encomienda_jornadas", "fecha"),
      traerTodo("encomienda_pagos", "fecha"),
      traerTodo("encomienda_reglas_pago"),
      traerTodo("encomienda_periodos_facturacion", "fecha_inicio"),
      traerTodo("encomienda_ingresos_reales"),
    ]);

  for (const [nombre, filas] of [
    ["actividad", actividadOrigen],
    ["jornadas", jornadasOrigen],
    ["liquidaciones", pagosOrigen],
    ["regla de pago", reglasOrigen],
    ["periodos de facturación", periodosOrigen],
    ["ingresos reales", ingresosOrigen],
  ]) {
    console.log(`  ${String(filas.length).padStart(6)}  ${nombre}`);
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 1. Conductores ===");
  // Quiénes vienen: todo el que aparezca en algún dato de encomiendas, MÁS los
  // que tengan la categoría 'encomiendas' aunque nunca hayan repartido (recién
  // contratados). La unión y no una sola de las dos: por categoría solo, se
  // perdería el conductor al que le sacaron la marca y tiene historial; por
  // actividad solo, se perdería el que todavía no salió.
  const idsConDatos = new Set(
    [...actividadOrigen, ...jornadasOrigen, ...pagosOrigen]
      .map((f) => f.chofer_id)
      .filter(Boolean),
  );

  const { data: porCategoria } = await origen
    .from("chofer_categorias")
    .select("chofer_id")
    .eq("categoria", "encomiendas");
  for (const c of porCategoria ?? []) idsConDatos.add(c.chofer_id);

  const todosLosChoferes = await traerTodo("choferes", "nombre");
  const choferes = todosLosChoferes.filter((c) => idsConDatos.has(c.id));

  console.log(`  ${choferes.length} de ${todosLosChoferes.length} conductores del origen vienen a ares`);
  for (const c of choferes) {
    const tieneDatos = idsConDatos.has(c.id);
    console.log(`    · ${c.nombre}${c.email ? `  <${c.email}>` : "  (sin correo)"}${tieneDatos ? "" : "  [sin historial]"}`);
  }

  // user_id fuera: apunta a un usuario de Auth del OTRO proyecto. Dejarlo sería
  // una FK rota o —peor— una ficha apuntando a un id que en ares le corresponde
  // a otra persona. Se re-invita desde el panel (ver la cabecera).
  await escribir("choferes", choferes.map((c) => limpiar(c, ["user_id"])));
  ok(`${choferes.length} conductores`);

  // -------------------------------------------------------------------------
  console.log("\n=== 2. Periodos de facturación ===");
  await escribir("encomienda_periodos_facturacion", periodosOrigen.map((p) => limpiar(p)));
  ok(`${periodosOrigen.length} periodos`);

  // -------------------------------------------------------------------------
  console.log("\n=== 3. Regla de pago ===");
  // En el origen hay una sola. Si hubiera más de una (base a medio migrar allá),
  // se para: elegir una a ojo cambiaría con cuánto se valoran los días que este
  // script no traiga ya calculados.
  if (reglasOrigen.length > 1) {
    mal(`el origen tiene ${reglasOrigen.length} reglas de pago y debería tener una sola`);
  } else if (reglasOrigen.length === 0) {
    console.log("  (el origen no tiene regla configurada — habrá que cargarla a mano en ares)");
  } else {
    const r = reglasOrigen[0];
    console.log(
      `  ${r.tipo_pago === "porcentaje" ? `${r.valor_pago} % por entrega` : `$${r.valor_pago} por entrega`}` +
        ` · $${r.valor_pedido} estimado por entrega · $${r.monto_dia} fijo por día` +
        (r.meta_entregas_dia ? ` · bono $${r.bono_monto} a las ${r.meta_entregas_dia} entregas` : ""),
    );
    // onConflict por empresa_id: la restricción única de la tabla es esa, no el
    // id. Con "id" un segundo intento crearía una segunda regla y chocaría.
    await escribir(
      "encomienda_reglas_pago",
      reglasOrigen.map((f) => limpiar(f, ["id"])),
      { onConflict: "empresa_id" },
    );
    ok("regla de pago");
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 4. Actividad ===");
  // Los ids se conservan tal cual: son los que generó el TELÉFONO y son la clave
  // de idempotencia de la cola offline. Cambiarlos rompería la garantía de que
  // reenviar un evento no lo cuente dos veces.
  await escribir("encomienda_actividad", actividadOrigen.map((f) => limpiar(f)));
  ok(`${actividadOrigen.length} eventos`);

  // -------------------------------------------------------------------------
  console.log("\n=== 5. Liquidaciones (ANTES que las jornadas) ===");
  // pago_total es columna generada: mandarlo da error 428C9.
  await escribir("encomienda_pagos", pagosOrigen.map((f) => limpiar(f, ["pago_total"])));
  ok(`${pagosOrigen.length} liquidaciones, con su tarifa congelada`);

  const sinTarifa = pagosOrigen.filter((p) => p.chofer_id && p.regla_valor_pedido == null);
  if (sinTarifa.length) {
    mal(
      `${sinTarifa.length} liquidación(es) del origen no traen la tarifa con la que se calcularon: ` +
        `al insertar su jornada, la base las va a recalcular con la regla de AHORA`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 6. Jornadas (disparan el recálculo) ===");
  await escribir("encomienda_jornadas", jornadasOrigen.map((f) => limpiar(f)));
  ok(`${jornadasOrigen.length} jornadas`);

  // -------------------------------------------------------------------------
  console.log("\n=== 7. Ingresos reales ===");
  await escribir("encomienda_ingresos_reales", ingresosOrigen.map((f) => limpiar(f)));
  ok(`${ingresosOrigen.length} liquidaciones del mandante`);

  // -------------------------------------------------------------------------
  // La comprobación que importa: ¿quedó igual?
  // -------------------------------------------------------------------------
  if (!APLICAR) {
    console.log(
      "\n=== ENSAYO TERMINADO ===\n" +
        "No se escribió nada. Para aplicarlo de verdad:\n\n" +
        "  npm run migrar -- --aplicar\n",
    );
    process.exit(problemas.length === 0 ? 0 : 1);
  }

  console.log("\n=== 8. Verificación: origen contra destino ===");

  for (const [tabla, esperadas] of [
    ["encomienda_actividad", actividadOrigen.length],
    ["encomienda_jornadas", jornadasOrigen.length],
    ["encomienda_pagos", pagosOrigen.length],
    ["encomienda_periodos_facturacion", periodosOrigen.length],
    ["encomienda_ingresos_reales", ingresosOrigen.length],
  ]) {
    const { count, error } = await destino.from(tabla).select("id", { count: "exact", head: true });
    if (error) mal(`${tabla}: no se pudo contar en el destino — ${error.message}`);
    else if (count !== esperadas) mal(`${tabla}: origen ${esperadas} filas, destino ${count}`);
    else ok(`${tabla}: ${count} filas`);
  }

  // Y la que de verdad importa: que la plata no se haya movido. Se compara cada
  // liquidación contra la del origen, cifra por cifra.
  //
  // calculado_en SÍ cambia (lo reescribe el trigger al insertar la jornada) y no
  // se compara: es cuándo se calculó, no cuánto.
  const { data: pagosDestino } = await destino.from("encomienda_pagos").select("*");
  const porClave = new Map((pagosDestino ?? []).map((p) => [`${p.chofer_id}|${p.fecha}`, p]));
  const CIFRAS = [
    "pedidos_entregados",
    "pedidos_no_entregados",
    "ingresos_totales",
    "pago_base",
    "pago_dia",
    "pago_bono",
    "pago_total",
  ];

  const movidos = [];
  for (const antes of pagosOrigen) {
    const despues = porClave.get(`${antes.chofer_id}|${antes.fecha}`);
    if (!despues) {
      movidos.push(`${antes.fecha} (chofer ${antes.chofer_id}): no llegó al destino`);
      continue;
    }
    for (const c of CIFRAS) {
      if (Number(antes[c]) !== Number(despues[c])) {
        movidos.push(`${antes.fecha}: ${c} era ${antes[c]} y quedó ${despues[c]}`);
      }
    }
  }

  if (movidos.length) {
    mal(`${movidos.length} diferencia(s) en las liquidaciones:`);
    for (const d of movidos.slice(0, 20)) console.log(`        · ${d}`);
    if (movidos.length > 20) console.log(`        … y ${movidos.length - 20} más`);
  } else {
    ok(`las ${pagosOrigen.length} liquidaciones quedaron con las MISMAS cifras`);
  }

  // -------------------------------------------------------------------------
  console.log("\n=== 9. Lo que falta hacer a mano ===");
  console.log(
    "\n  1. INVITAR A LOS CONDUCTORES. Llegaron sin cuenta de acceso: las cuentas\n" +
      "     no se mueven entre proyectos de Supabase. Hasta que se los invite no\n" +
      "     pueden abrir la app ni registrar una ruta.\n" +
      "     En ares: Conductores → clic en el conductor → 'Invitar' → copiar el link.\n",
  );
  for (const c of choferes) {
    console.log(`       · ${c.nombre}${c.email ? `  <${c.email}>` : "  ⚠ SIN CORREO: hay que ponerle uno"}`);
  }
  console.log(
    "\n  2. Completar los datos de la empresa en Configuración (nombre, RUT,\n" +
      "     dirección): la migración no los trae, son de la otra empresa.\n" +
      "\n  3. Correr `npm run test:base` contra la base de ares: comprueba el esquema\n" +
      "     y vuelve a cruzar la cuenta del código contra las cifras guardadas.\n",
  );

  console.log(
    problemas.length === 0
      ? "=== MIGRACIÓN COMPLETA, SIN DIFERENCIAS ===\n"
      : `=== ${problemas.length} PROBLEMA(S) ===\n${problemas.map((p) => " - " + p).join("\n")}\n`,
  );
  process.exitCode = problemas.length === 0 ? 0 : 1;
} catch (e) {
  console.error(`\n✖ ${e.message}\n`);
  console.error(
    APLICAR
      ? "La migración quedó a medias. Es re-ejecutable: arreglá lo de arriba y volvé\n" +
          "a correrla — lo ya escrito se actualiza en vez de duplicarse.\n"
      : "",
  );
  process.exit(1);
}
