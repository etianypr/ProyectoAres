// ============================================================================
// Respaldo de la flota de reparto que quedó en el sistema del que nos separamos.
//
// POR QUÉ ESTO NO ES UNA MIGRACIÓN
//
// Ares no gestiona flota: su esquema tiene perfiles, empresa, choferes y las
// tablas encomienda_*, y ninguna columna apunta a un vehículo. La camioneta del
// reparto existe como ficha en el sistema viejo —con sus papeles y sus gastos—
// y esa información no tiene dónde entrar acá sin inventarle un módulo que hoy
// nadie usa.
//
// Así que se guarda tal cual, en archivos, antes de perder el acceso a esa base.
// Si algún día Ares necesita flota, el dato está; y si no, no se arrastró un
// módulo entero por si acaso.
//
// SOLO LEE. No escribe una sola fila en ninguna base.
//
// ----------------------------------------------------------------------------
// CÓMO SE CORRE
//
//   cp .env.migracion.example .env.migracion   # y completar ORIGEN_*
//   npm run respaldo
//
// Bastan las dos variables de ORIGEN: el destino no se toca. La llave es
// service_role porque hay que leer saltándose RLS.
//
// Deja en respaldo/:
//   vehiculos-encomiendas.json   las fichas completas, con sus vencimientos
//   vehiculos-encomiendas.csv    lo mismo, para abrir en Excel
//   gastos-vehiculos.json        todos los gastos imputados a esas patentes
//   gastos-vehiculos.csv
//   LEEME.txt                    qué es cada archivo y cuándo se generó
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const URL_ORIGEN = process.env.ORIGEN_SUPABASE_URL;
const KEY_ORIGEN = process.env.ORIGEN_SERVICE_ROLE_KEY;

if (!URL_ORIGEN || !KEY_ORIGEN) {
  console.error(
    "Faltan ORIGEN_SUPABASE_URL y/o ORIGEN_SERVICE_ROLE_KEY.\n" +
      "Copiá .env.migracion.example como .env.migracion y completá esos dos valores.",
  );
  process.exit(1);
}

const origen = createClient(URL_ORIGEN, KEY_ORIGEN, {
  auth: { persistSession: false },
});

const CARPETA = join(process.cwd(), "respaldo");

const ok = (m) => console.log(`  ✓ ${m}`);
const aviso = (m) => console.log(`  ! ${m}`);

/** Vuelca filas a CSV. Comillas dobles escapadas, null como celda vacía. */
function aCsv(filas) {
  if (filas.length === 0) return "";
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  const celda = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [
    columnas.join(","),
    ...filas.map((f) => columnas.map((c) => celda(f[c])).join(",")),
  ].join("\r\n");
}

// El BOM es lo que hace que Excel en Windows lea los acentos bien. Sin él,
// "Camión" se abre como "CamiÃ³n" y el respaldo queda inservible de un vistazo.
async function guardar(nombre, filas) {
  await writeFile(join(CARPETA, `${nombre}.json`), JSON.stringify(filas, null, 2), "utf8");
  await writeFile(join(CARPETA, `${nombre}.csv`), "﻿" + aCsv(filas), "utf8");
  ok(`${nombre}: ${filas.length} fila${filas.length === 1 ? "" : "s"} (.json y .csv)`);
}

async function main() {
  console.log("Respaldo de la flota de reparto\n");
  console.log(`Origen: ${URL_ORIGEN}`);
  console.log("Modo:   SOLO LECTURA\n");

  await mkdir(CARPETA, { recursive: true });

  console.log("=== 1. Vehículos de encomiendas ===");
  const { data: vehiculos, error: eVeh } = await origen
    .from("vehiculos")
    .select("*")
    .eq("categoria", "encomiendas")
    .order("patente");
  if (eVeh) throw new Error(`leyendo vehiculos: ${eVeh.message}`);

  if (vehiculos.length === 0) {
    aviso("No hay vehículos con categoria='encomiendas'.");
    aviso("Puede que ya se hayan reclasificado en el sistema viejo. Revisalo antes");
    aviso("de dar el respaldo por hecho: este script no adivina cuáles eran.");
  }
  await guardar("vehiculos-encomiendas", vehiculos);

  const patentes = vehiculos.map((v) => v.patente);
  if (patentes.length > 0) console.log(`  patentes: ${patentes.join(", ")}`);

  console.log("\n=== 2. Gastos de esas patentes ===");
  // gastos_vehiculo.vehiculo_id es la patente (migración 0007/0008 del sistema
  // viejo: la patente es la PK del vehículo, no un uuid).
  let gastos = [];
  if (patentes.length > 0) {
    const { data, error } = await origen
      .from("gastos_vehiculo")
      .select("*")
      .in("vehiculo_id", patentes)
      .order("fecha");
    if (error) throw new Error(`leyendo gastos_vehiculo: ${error.message}`);
    gastos = data;
  }
  await guardar("gastos-vehiculos", gastos);

  const total = gastos.reduce((s, g) => s + (g.monto_total ?? 0), 0);
  if (gastos.length > 0) {
    console.log(`  total gastado: $${total.toLocaleString("es-CL")}`);
  }

  const fecha = new Date().toISOString();
  await writeFile(
    join(CARPETA, "LEEME.txt"),
    [
      "RESPALDO DE LA FLOTA DE REPARTO",
      `Generado: ${fecha}`,
      `Origen:   ${URL_ORIGEN}`,
      "",
      "Qué hay acá:",
      "",
      `  vehiculos-encomiendas.{json,csv}  ${vehiculos.length} ficha(s) de vehículo con`,
      "      marca, modelo, año, kilometraje y los tres vencimientos (revisión",
      "      técnica, SOAP, permiso de circulación).",
      `      Patentes: ${patentes.join(", ") || "(ninguna)"}`,
      "",
      `  gastos-vehiculos.{json,csv}       ${gastos.length} gasto(s) imputado(s) a esas`,
      `      patentes. Total: $${total.toLocaleString("es-CL")}`,
      "",
      "Por qué está en archivos y no en la base de Ares:",
      "",
      "  Ares no gestiona flota. Su esquema no tiene tabla de vehículos y ninguna",
      "  pantalla los muestra, así que estos datos no tenían dónde entrar. Se",
      "  guardaron acá para no perderlos al cortar el acceso a la base anterior.",
      "",
      "  Si más adelante Ares necesita llevar la flota, estos archivos son el",
      "  punto de partida: no hay que volver a pedirle nada al sistema viejo.",
      "",
      "Los CSV llevan BOM para que Excel en Windows muestre bien los acentos.",
      "",
    ].join("\n"),
    "utf8",
  );
  ok("LEEME.txt");

  console.log(`\nListo. Todo quedó en ${CARPETA}`);
}

main().catch((e) => {
  console.error(`\nFalló el respaldo: ${e.message}`);
  process.exit(1);
});
