// Arma, desde OpenStreetMap, dos archivos que viajan en el código:
//   · src/lib/geo/geocoding/calles-arica.ts: los nombres de calle de Arica, para corregir el
//     tipeo de una dirección antes de preguntarle a un buscador (spec 016);
//   · src/lib/geo/geocoding/lugares-calles.ts: los nombres que están en lugares distintos
//     («Pasaje 1», «Calle 2»…), con cada lugar por separado: su punto, puntos de muestra y las
//     calles que lo cruzan (spec 035). Así se sabe dónde está cada uno sin preguntarle a nadie.
//
//   node scripts/generar-calles.mjs                 consulta Overpass
//   node scripts/generar-calles.mjs calles-osm.json usa una descarga ya hecha
//
// A Overpass solo se le manda el recuadro de Arica: ningún dato de pedidos.
// Se corre a mano cuando aparecen calles nuevas; los archivos se versionan.
import { readFileSync, writeFileSync } from "node:fs";

const RECUADRO = "-18.65,-70.45,-18.35,-70.10"; // sur,oeste,norte,este
const CONSULTA = `[out:json][timeout:120];way["highway"]["name"](${RECUADRO});out body geom;`;
const DESTINO = new URL("../src/lib/geo/geocoding/calles-arica.ts", import.meta.url);
const DESTINO_LUGARES = new URL("../src/lib/geo/geocoding/lugares-calles.ts", import.meta.url);
/** Tramos que no son calles donde viva alguien. */
const DESCARTAR = new Set(["raceway", "cycleway", "bridleway", "proposed", "construction"]);
const OTROS_NOMBRES = ["alt_name", "old_name", "short_name", "official_name", "loc_name"];
/** Dos tramos con el mismo nombre a más de esto son lugares distintos: la misma vara que
 *  METROS_AMBIGUEDAD de ubicar.ts (más que una cuadra de Arica). */
const METROS_OTRO_LUGAR = 300;
/** Puntos de muestra por lugar: alcanzan para saber en qué poblaciones cae. */
const MUESTRAS = 8;

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
/** En lugares-calles.ts la coma separa latitud y longitud: un nombre no la lleva. */
const sinComa = (t) => t.replace(/,/g, " ").replace(/\s+/g, " ").trim();

function metros(s, o, n, e) {
  const rad = (g) => (g * Math.PI) / 180;
  const x = rad(e - o) * Math.cos(rad((s + n) / 2));
  const y = rad(n - s);
  return Math.round(Math.sqrt(x * x + y * y) * 6371000);
}
const entre = (a, b) => metros(Math.min(a.lat, b.lat), Math.min(a.lon, b.lon), Math.max(a.lat, b.lat), Math.max(a.lon, b.lon));

const { elements } = await descargar();
const vias = elements.filter((w) => w.type === "way" && w.tags?.highway && !DESCARTAR.has(w.tags.highway) && w.geometry?.length && limpio(w.tags.name));

// ---- el catálogo de nombres (como siempre) ----
const calles = new Map();
for (const w of vias) {
  const nombre = limpio(w.tags.name);
  const c = calles.get(nombre) ?? { s: 90, o: 180, n: -90, e: -180, otros: new Set() };
  for (const p of w.geometry) {
    c.s = Math.min(c.s, p.lat);
    c.o = Math.min(c.o, p.lon);
    c.n = Math.max(c.n, p.lat);
    c.e = Math.max(c.e, p.lon);
  }
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

// ---- los lugares de cada nombre repetido ----
const nombresDeNodo = new Map(); // nodo → nombres de las vías que pasan por él
for (const w of vias) {
  for (const n of w.nodes ?? []) {
    const s = nombresDeNodo.get(n) ?? new Set();
    s.add(limpio(w.tags.name));
    nombresDeNodo.set(n, s);
  }
}
const porNombre = new Map();
for (const w of vias) {
  const nombre = limpio(w.tags.name);
  porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), w]);
}
const lugares = [];
for (const [nombre, ws] of [...porNombre.entries()].sort(([a], [b]) => a.localeCompare(b, "es"))) {
  // Grupos de tramos que se tocan o quedan a menos de METROS_OTRO_LUGAR.
  const grupos = [];
  for (const w of ws) {
    const tocan = grupos.filter((g) => g.some((v) => v.geometry.some((p) => w.geometry.some((q) => entre(p, q) < METROS_OTRO_LUGAR))));
    for (const t of tocan) grupos.splice(grupos.indexOf(t), 1);
    grupos.push([w, ...tocan.flat()]);
  }
  if (grupos.length < 2) continue;
  for (const g of grupos) {
    const pts = g.flatMap((v) => v.geometry);
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
    // El punto del lugar es el vértice más cercano al promedio: cae sobre la calle.
    const centro = pts.reduce((a, p) => (entre(p, { lat, lon }) < entre(a, { lat, lon }) ? p : a));
    const paso = Math.max(1, Math.floor(pts.length / MUESTRAS));
    const muestras = pts.filter((_, i) => i % paso === 0).slice(0, MUESTRAS);
    const cruces = new Set();
    for (const v of g) for (const n of v.nodes ?? []) for (const otro of nombresDeNodo.get(n) ?? []) if (otro !== nombre) cruces.add(otro);
    const f = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    const otras = [...cruces].map(sinComa).sort((a, b) => a.localeCompare(b, "es"));
    lugares.push(`${sinComa(nombre)}|${f(centro)}|${muestras.map(f).join(";")}|${otras.join(";")}`);
  }
}

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
writeFileSync(
  DESTINO_LUGARES,
  `// GENERADO por scripts/generar-calles.mjs el ${hoy}. No se edita a mano.
// Datos © colaboradores de OpenStreetMap, licencia ODbL (openstreetmap.org/copyright).
//
// Las calles cuyo nombre está en lugares distintos de Arica (spec 035): un lugar por línea,
// "nombre|lat,lng del lugar|puntos de muestra lat,lng;…|calles que lo cruzan;…". Dos tramos con el
// mismo nombre a más de ${METROS_OTRO_LUGAR} m son lugares distintos.
export const LUGARES_CALLES = \`
${lugares.join("\n")}
\`;
`,
);
console.log(`${filas.length} calles → ${DESTINO.pathname}`);
console.log(`${lugares.length} lugares de calles repetidas → ${DESTINO_LUGARES.pathname}`);
