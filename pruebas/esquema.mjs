// Verificación del ESQUEMA COMPLETO de la base contra lo que el código espera,
// para TODA la app y no solo encomiendas. SOLO LECTURA.
//
//   npm run test:esquema
//
// El contrato lo definen los tipos de src/types/db.ts: cada `export interface`
// que corresponde a una tabla lista, campo por campo, lo que el código da por
// hecho que existe. Se leen de ahí y no de una lista escrita a mano para que
// esta prueba no envejezca sola: agregar un campo al tipo lo agrega a la
// verificación.
//
// Por qué hace falta: tsc, eslint y next build pueden estar los tres en verde
// con la app rota, porque ninguno sabe qué columnas tiene la base. Pasó con la
// migración 0028 — la columna `origen` no estaba corrida, todas las consultas
// del panel de encomiendas fallaban, y la pantalla mostraba "sin actividad" con
// los KPI en $0. Corré esto después de cada migración.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Usá: npm run test:esquema");
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false } });

const fallas = [];
const avisos = [];
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  console.log(`  FALLA ${m}`);
  fallas.push(m);
};
const aviso = (m) => {
  console.log(`  ⚠     ${m}`);
  avisos.push(m);
};

// Qué interfaz describe qué tabla. Las que no están acá son tipos compuestos.
const TABLAS = {
  Perfil: "perfiles",
  Empresa: "empresa",
  Chofer: "choferes",
  Actividad: "encomienda_actividad",
  DiaTrabajo: "encomienda_jornadas",
  ReglaDePago: "encomienda_reglas_pago",
  PagoDelDia: "encomienda_pagos",
  PeriodoFacturacion: "encomienda_periodos_facturacion",
  IngresoReal: "encomienda_ingresos_reales",
  Aviso: "encomienda_whatsapp_correlaciones",
};

// Tablas que el código usa pero que no tienen una interfaz propia. Hoy ninguna.
// Ojo: "fotos" y "logos" NO son tablas — son buckets de Storage, y se llaman
// igual con supabase.storage.from(). Van en la sección 4.
const SIN_TIPO = [];

// Tablas que NO deben existir en esta base. Dos grupos, los dos con el mismo
// síntoma —aparecen— y distinto motivo:
//
//   · pedidos/rutas/paradas: son los datos personales de los destinatarios
//     (nombre, teléfono, dirección). Se retiraron a propósito de la base y hoy
//     viven solo en el teléfono del conductor. Si reaparecen, alguien restauró
//     un respaldo viejo.
//   · el resto: son del sistema de gestión general del que se separó este
//     proyecto. Si aparecen, se corrió una migración de ese repo contra ESTE
//     proyecto de Supabase — que es el error fácil de cometer teniendo los dos
//     abiertos, y el que mezcla las dos empresas en una sola base.
const RETIRADAS = [
  "encomienda_pedidos",
  "encomienda_rutas",
  "encomienda_paradas",
  "clientes",
  "cotizaciones",
  "viajes",
  "facturas",
  "vehiculos",
  "servicios_taxi",
  "chofer_categorias",
];

// ---------------------------------------------------------------------------
// Campos de cada interfaz, leídos del propio archivo de tipos
// ---------------------------------------------------------------------------
function camposDeInterfaces(ruta) {
  const fuente = readFileSync(ruta, "utf8");
  const campos = {};
  for (const m of fuente.matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
    const [, nombre, cuerpo] = m;
    campos[nombre] = cuerpo
      // Fuera los comentarios: /** ... */ y // ...
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .split("\n")
      .map((l) => l.trim().match(/^(\w+)\s*[?]?\s*:/))
      .filter(Boolean)
      .map((m2) => m2[1]);
  }
  return campos;
}

const campos = camposDeInterfaces("src/types/db.ts");

console.log(`\nProyecto: ${url}`);

// ---------------------------------------------------------------------------
console.log("\n=== 1. Existencia de las tablas ===");
for (const tabla of [...Object.values(TABLAS), ...SIN_TIPO]) {
  // Sin head:true: una petición HEAD no trae cuerpo, así que error.message
  // llega vacío y "no existe" se confunde con "todo bien".
  const { error } = await db.from(tabla).select("*").limit(1);
  if (error && /does not exist|Could not find the table/i.test(error.message)) {
    mal(`${tabla}: NO existe y el código la usa`);
  }
}
for (const tabla of RETIRADAS) {
  const { error } = await db.from(tabla).select("*").limit(1);
  if (!error) mal(`${tabla}: volvió a existir después de la 0027 (datos personales)`);
}
if (fallas.length === 0) ok(`las ${Object.keys(TABLAS).length + SIN_TIPO.length} tablas existen y las 3 retiradas no están`);

// ---------------------------------------------------------------------------
console.log("\n=== 2. Cada campo de cada tipo existe como columna ===");
for (const [interfaz, tabla] of Object.entries(TABLAS)) {
  const esperados = campos[interfaz];
  if (!esperados?.length) {
    aviso(`no pude leer los campos de la interfaz ${interfaz}`);
    continue;
  }
  // De a una: PostgREST informa solo la primera columna que no encuentra.
  const faltan = [];
  for (const col of esperados) {
    const { error } = await db.from(tabla).select(col).limit(1);
    if (error) faltan.push(col);
  }
  if (faltan.length) mal(`${tabla}: el tipo ${interfaz} espera ${faltan.join(", ")} y no está(n)`);
  else ok(`${tabla} — ${esperados.length} campos de ${interfaz}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Los joins que arma el código ===");
// Un join mal nombrado no lo ve TypeScript: es un string que PostgREST resuelve
// por la foreign key. Si la FK cambia de nombre, la consulta falla en runtime.
const JOINS = [["encomienda_actividad", "*, chofer:choferes(id,nombre)"]];
for (const [tabla, select] of JOINS) {
  const { error } = await db.from(tabla).select(select).limit(1);
  if (error) mal(`join en ${tabla}: ${error.message}`);
  else ok(`join en ${tabla}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Buckets de Storage ===");
for (const bucket of ["fotos", "logos"]) {
  const { error } = await db.storage.from(bucket).list("", { limit: 1 });
  if (error) mal(`bucket '${bucket}': ${error.message}`);
  else ok(`bucket '${bucket}'`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Volumen y truncado de PostgREST ===");
// Ninguna pantalla pagina: si una tabla pasa el tope de filas por respuesta
// (1000 por defecto en Supabase), los totales salen cortos EN SILENCIO.
for (const tabla of [...Object.values(TABLAS), ...SIN_TIPO]) {
  const { data, count, error } = await db.from(tabla).select("*", { count: "exact" });
  if (error) continue;
  if (count > 0 && (data?.length ?? 0) < count) {
    mal(`${tabla}: la API devolvió ${data.length} de ${count} filas — los totales salen cortos`);
  } else if (count >= 900) {
    aviso(`${tabla}: ${count} filas, cerca del tope de 1000 por respuesta`);
  }
}
if (!fallas.some((f) => f.includes("devolvió"))) ok("ninguna tabla se está truncando hoy");

// ---------------------------------------------------------------------------
console.log("\n=== 6. RLS: sin sesión no se ve nada ===");
if (anon) {
  const publico = createClient(url, anon, { auth: { persistSession: false } });
  const filtradas = [];
  for (const tabla of [...Object.values(TABLAS), ...SIN_TIPO]) {
    const { data, error } = await publico.from(tabla).select("*").limit(1);
    if (!error && (data?.length ?? 0) > 0) filtradas.push(tabla);
  }
  if (filtradas.length) mal(`¡un anónimo lee ${filtradas.join(", ")}!`);
  else ok(`ninguna de las ${Object.keys(TABLAS).length + SIN_TIPO.length} tablas se lee sin sesión`);
}

// ---------------------------------------------------------------------------
console.log(
  fallas.length === 0
    ? `\n=== ESQUEMA OK ===${avisos.length ? ` (${avisos.length} aviso/s)` : ""}\n`
    : `\n=== ${fallas.length} FALLA(S) ===\n${fallas.map((f) => " - " + f).join("\n")}\n`,
);
// exitCode y no process.exit(): salir a la fuerza mientras el hilo del
// resolvedor de módulos sigue vivo hace que libuv aborte en Windows con un
// "Assertion failed" después de todo el informe.
process.exitCode = fallas.length === 0 ? 0 : 1;
