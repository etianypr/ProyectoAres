// Arma src/lib/geo/geocoding/calles-arica.ts: los nombres de calle de Arica
// sacados de OpenStreetMap, para corregir el tipeo de una dirección antes de
// preguntarle a Mapbox (spec 016).
//
//   node scripts/generar-calles.mjs                 consulta Overpass
//   node scripts/generar-calles.mjs calles-osm.json usa una descarga ya hecha
//
// A Overpass solo se le manda el recuadro de Arica: ningún dato de pedidos.
// Se corre a mano cuando aparecen calles nuevas; el archivo se versiona.
import { readFileSync, writeFileSync } from "node:fs";

const RECUADRO = "-18.65,-70.45,-18.35,-70.10"; // sur,oeste,norte,este
const CONSULTA = `[out:json][timeout:90];way["highway"]["name"](${RECUADRO});out tags bb;`;
const DESTINO = new URL("../src/lib/geo/geocoding/calles-arica.ts", import.meta.url);
/** Tramos que no son calles donde viva alguien. */
const DESCARTAR = new Set(["raceway", "cycleway", "bridleway", "proposed", "construction"]);
const OTROS_NOMBRES = ["alt_name", "old_name", "short_name", "official_name", "loc_name"];

async function descargar() {
  const archivo = process.argv[2];
  if (archivo) return JSON.parse(readFileSync(archivo, "utf8"));
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "ares-encomiendas/1.0" },
    body: new URLSearchParams({ data: CONSULTA }),
  });
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
  return res.json();
}

const limpio = (t) => t.replace(/[`\\|;$\r\n]/g, " ").replace(/\s+/g, " ").trim();

function metros(s, o, n, e) {
  const rad = (g) => (g * Math.PI) / 180;
  const x = rad(e - o) * Math.cos(rad((s + n) / 2));
  const y = rad(n - s);
  return Math.round(Math.sqrt(x * x + y * y) * 6371000);
}

const { elements } = await descargar();
const calles = new Map();
for (const w of elements) {
  if (DESCARTAR.has(w.tags.highway) || !w.bounds) continue;
  const nombre = limpio(w.tags.name);
  if (!nombre) continue;
  const c = calles.get(nombre) ?? { s: 90, o: 180, n: -90, e: -180, otros: new Set() };
  const b = w.bounds;
  c.s = Math.min(c.s, b.minlat);
  c.o = Math.min(c.o, b.minlon);
  c.n = Math.max(c.n, b.maxlat);
  c.e = Math.max(c.e, b.maxlon);
  for (const clave of OTROS_NOMBRES) {
    for (const otro of (w.tags[clave] ?? "").split(";").map(limpio)) {
      if (otro && otro !== nombre) c.otros.add(otro);
    }
  }
  calles.set(nombre, c);
}

const filas = [...calles.entries()]
  .sort(([a], [b]) => a.localeCompare(b, "es"))
  .map(([nombre, c]) => `${nombre}|${metros(c.s, c.o, c.n, c.e)}|${[...c.otros].join(";")}`);

const hoy = new Date().toISOString().slice(0, 10);
writeFileSync(
  DESTINO,
  `// GENERADO por scripts/generar-calles.mjs el ${hoy}. No se edita a mano.
// Datos © colaboradores de OpenStreetMap, licencia ODbL (openstreetmap.org/copyright).
//
// Una calle por línea: "nombre|largo en metros|otros nombres separados por ;".
// El largo es la diagonal del recuadro que cubren TODOS los tramos con ese
// nombre: dos calles homónimas en barrios distintos suman un largo enorme, y
// así ninguna pasa por "calle corta" (ver ubicarDireccion).
export const CALLES_ARICA = \`
${filas.join("\n")}
\`;
`,
);
console.log(`${filas.length} calles → ${DESTINO.pathname}`);
