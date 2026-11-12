// Arma src/lib/geo/red/red-arica.ts: la red de calles de Arica sacada de
// OpenStreetMap, para calcular en el teléfono las distancias de la ruta sabiendo
// hacia dónde apunta el auto (spec 031).
//
//   node scripts/generar-red.mjs               consulta Overpass (una consulta)
//   node scripts/generar-red.mjs red-osm.json  usa una descarga ya hecha
//   RED_CRUDO=red-osm.json node scripts/…      además guarda la descarga ahí
//
// A Overpass solo se le manda el recuadro de Arica: ningún dato de pedidos.
// Se corre a mano cuando cambian las calles; el archivo se versiona.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const RECUADRO = "-18.65,-70.45,-18.35,-70.10"; // sur,oeste,norte,este
/** Por donde pasa un auto. El orden es el código de clase que lee el motor. */
const CLASES = [
  ["motorway", "motorway_link", "trunk", "trunk_link"],
  ["primary", "primary_link"],
  ["secondary", "secondary_link"],
  ["tertiary", "tertiary_link"],
  ["unclassified", "road"],
  ["residential"],
  ["living_street"],
  ["service"],
  ["track"],
];
const CLASE_DE = new Map(CLASES.flatMap((nombres, c) => nombres.map((n) => [n, c])));
const CONSULTA = `[out:json][timeout:180];
way["highway"~"^(${[...CLASE_DE.keys()].join("|")})$"](${RECUADRO})->.v;
.v out body qt;
node(w.v)->.n;
.n out skel qt;
node.n["barrier"];
out body qt;
relation["type"="restriction"](${RECUADRO});
out body qt;`;
const DESTINO = new URL("../src/lib/geo/red/red-arica.ts", import.meta.url);

/** Bits del código de cada arista, encima de la clase (0–8). */
const UN_SENTIDO = 16;
const PRIVADA = 32;
/** No es lugar para detenerse a entregar: autopista, enlace, entrada de auto. */
const SIN_PARADA = 64;
/** La velocidad de la arista: la máxima anotada en km/h (0 si no hay), más 1000 si
 *  no está pavimentada. El motor saca de ahí a cuánto se anda (red/tiempos.ts). */
const SIN_PAVIMENTO = 1000;
const TIERRA = new Set(["unpaved", "dirt", "ground", "gravel", "fine_gravel", "compacted", "sand", "earth", "mud", "grass", "pebblestone"]);
function velocidad(t) {
  const maxima = /^\d+$/.test(t.maxspeed ?? "") ? Math.min(999, Number(t.maxspeed)) : 0;
  const tierra = t.surface ? TIERRA.has(t.surface) : t.highway === "track";
  return maxima + (tierra ? SIN_PAVIMENTO : 0);
}

const NO_PASA = new Set(["no"]);
/** Solo para quien va ahí: no se usa de paso. */
const SOLO_DESTINO = new Set(["private", "delivery", "permit", "residents"]);
/** Barreras que no dejan pasar un auto (las mismas que usa el perfil de auto de ORS). */
const BARRERAS = new Set(["bollard", "block", "jersey_barrier", "chain", "debris", "cycle_barrier", "motorcycle_barrier", "stile", "turnstile", "bus_trap", "sump_buster"]);
/** Portones: cierran si dicen que no se pasa; si son privados, se pasa solo para llegar. */
const PORTONES = new Set(["gate", "lift_gate", "swing_gate", "sliding_gate", "kissing_gate"]);

async function descargar() {
  const archivo = process.argv[2];
  if (archivo) return JSON.parse(readFileSync(archivo, "utf8"));
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "ares-encomiendas/1.0" },
    body: new URLSearchParams({ data: CONSULTA }),
  });
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
  const texto = await res.text();
  if (process.env.RED_CRUDO) writeFileSync(process.env.RED_CRUDO, texto);
  return JSON.parse(texto);
}

/** Lo que dice la vía sobre los autos: el permiso más específico manda. */
function acceso(tags) {
  return tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access ?? "yes";
}

// --- Enteros compactos: zigzag + grupos de 5 bits con bit de «sigue», en un
// alfabeto que no necesita escaparse dentro de un string. ---
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function entero(n) {
  let v = n < 0 ? -2 * n - 1 : 2 * n;
  let salida = "";
  while (v >= 32) {
    salida += ALFABETO[32 + (v % 32)];
    v = Math.floor(v / 32);
  }
  return salida + ALFABETO[v];
}
const ESCALA = 1e6;
const fijo = (grados) => Math.round(grados * ESCALA);

const { elements } = await descargar();
const nodos = new Map();
const vias = [];
const relaciones = [];
for (const e of elements) {
  if (e.type === "node") nodos.set(e.id, { lat: e.lat, lon: e.lon, tags: e.tags ?? nodos.get(e.id)?.tags });
  else if (e.type === "way") vias.push(e);
  else if (e.type === "relation") relaciones.push(e);
}

// Las vías que quedan, ya en el sentido en que se recorren.
const usadas = [];
for (const w of vias) {
  const t = w.tags ?? {};
  const clase = CLASE_DE.get(t.highway);
  if (clase == null || t.area === "yes" || !w.nodes || w.nodes.length < 2) continue;
  const a = acceso(t);
  if (NO_PASA.has(a)) continue;
  let ids = w.nodes.filter((id) => nodos.has(id));
  if (ids.length < 2) continue;
  const rotonda = t.junction === "roundabout" || t.junction === "circular";
  const sentido = t.oneway ?? (rotonda || t.highway === "motorway" ? "yes" : "no");
  let codigo = clase;
  if (sentido === "-1" || sentido === "reverse") {
    ids = [...ids].reverse();
    codigo |= UN_SENTIDO;
  } else if (sentido === "yes" || sentido === "1" || sentido === "true") codigo |= UN_SENTIDO;
  if (SOLO_DESTINO.has(a)) codigo |= PRIVADA;
  const enlace = t.highway.endsWith("_link") || t.highway === "motorway" || t.highway === "trunk";
  // Un pasaje de estacionamiento con nombre de calle y sin restricción es un pasaje
  // abierto (en Arica hay varios mapeados así, como Mosa): se para frente a la casa.
  // Sin nombre o privado, es la calle interna de un condominio (red/entrada.ts).
  const pasajeAbierto = t.service === "parking_aisle" && t.name && !SOLO_DESTINO.has(a);
  if (enlace || t.service === "driveway" || (t.service === "parking_aisle" && !pasajeAbierto) || rotonda) codigo |= SIN_PARADA;
  usadas.push({ id: w.id, ids, codigo, vel: velocidad(t) });
}

// Nodos del grafo: los extremos, los que comparten dos vías y las barreras.
const veces = new Map();
for (const { ids } of usadas) {
  ids.forEach((id, k) => veces.set(id, (veces.get(id) ?? 0) + (k === 0 || k === ids.length - 1 ? 2 : 1)));
}
/** 0 se pasa · 1 no pasa un auto · 2 portón privado (se pasa solo para llegar). */
const cierra = (id) => {
  const t = nodos.get(id)?.tags;
  if (!t?.barrier) return 0;
  const dice = "access" in t || "motor_vehicle" in t || "vehicle" in t || "motorcar" in t;
  const a = acceso(t);
  if (BARRERAS.has(t.barrier)) return !dice || NO_PASA.has(a) || SOLO_DESTINO.has(a) ? 1 : 0;
  if (!PORTONES.has(t.barrier)) return 0;
  return NO_PASA.has(a) ? 1 : SOLO_DESTINO.has(a) ? 2 : 0;
};
const delGrafo = [...veces.entries()].filter(([id, n]) => n >= 2 || cierra(id)).map(([id]) => id);
// En orden de barrido (por franjas de latitud): los deltas quedan chicos.
delGrafo.sort((a, b) => {
  const pa = nodos.get(a);
  const pb = nodos.get(b);
  return Math.round(pa.lat * 200) - Math.round(pb.lat * 200) || pa.lon - pb.lon;
});
const indice = new Map(delGrafo.map((id, i) => [id, i]));

// Aristas: cada vía cortada en los nodos del grafo.
const aristas = [];
const deLaVia = new Map(); // id de vía → índices de sus aristas
for (const { id, ids, codigo, vel } of usadas) {
  let desde = 0;
  for (let k = 1; k < ids.length; k++) {
    if (!indice.has(ids[k]) && k < ids.length - 1) continue;
    aristas.push({ desde: indice.get(ids[desde]), hasta: indice.get(ids[k]), codigo, vel, medio: ids.slice(desde + 1, k) });
    deLaVia.set(id, [...(deLaVia.get(id) ?? []), aristas.length - 1]);
    desde = k;
  }
}

// Restricciones de giro con un nodo de paso: [arista desde, nodo, arista hasta, solo esa].
const giros = [];
let sinUsar = 0;
for (const r of relaciones) {
  const t = r.tags ?? {};
  const tipo = t["restriction:motorcar"] ?? t.restriction ?? "";
  const exceptuados = (t.except ?? "").split(";");
  if (!/^(no|only)_/.test(tipo) || exceptuados.includes("motorcar") || exceptuados.includes("motor_vehicle")) continue;
  const de = r.members?.find((m) => m.role === "from" && m.type === "way");
  const a = r.members?.find((m) => m.role === "to" && m.type === "way");
  const por = r.members?.find((m) => m.role === "via" && m.type === "node");
  const nodo = por ? indice.get(por.ref) : undefined;
  const tocan = (via) => (deLaVia.get(via?.ref) ?? []).filter((i) => aristas[i].desde === nodo || aristas[i].hasta === nodo);
  const desde = tocan(de);
  const hasta = tocan(a);
  if (nodo == null || desde.length !== 1 || hasta.length !== 1) {
    sinUsar++;
    continue;
  }
  giros.push([desde[0], nodo, hasta[0], tipo.startsWith("only_") ? 1 : 0]);
}

// --- Salida ---
let anterior = [0, 0];
const textoNodos = delGrafo
  .map((id) => {
    const p = [fijo(nodos.get(id).lat), fijo(nodos.get(id).lon)];
    const s = entero(p[0] - anterior[0]) + entero(p[1] - anterior[1]);
    anterior = p;
    return s;
  })
  .join("");
let puntosDeForma = 0;
const textoAristas = aristas
  .map(({ desde, hasta, codigo, vel, medio }) => {
    let previo = [fijo(nodos.get(delGrafo[desde]).lat), fijo(nodos.get(delGrafo[desde]).lon)];
    puntosDeForma += medio.length;
    const forma = medio
      .map((id) => {
        const p = [fijo(nodos.get(id).lat), fijo(nodos.get(id).lon)];
        const s = entero(p[0] - previo[0]) + entero(p[1] - previo[1]);
        previo = p;
        return s;
      })
      .join("");
    return entero(desde) + entero(hasta) + entero(codigo) + entero(vel) + entero(medio.length) + forma;
  })
  .join("");
const textoGiros = giros.map((g) => g.map(entero).join("")).join("");
const textoCerrados = delGrafo.flatMap((id, i) => (cierra(id) === 1 ? [entero(i)] : [])).join("");
const textoPortones = delGrafo.flatMap((id, i) => (cierra(id) === 2 ? [entero(i)] : [])).join("");

const hoy = new Date().toISOString().slice(0, 10);
mkdirSync(new URL(".", DESTINO), { recursive: true });
writeFileSync(
  DESTINO,
  `// GENERADO por scripts/generar-red.mjs el ${hoy}. No se edita a mano.
// Datos © colaboradores de OpenStreetMap, licencia ODbL (openstreetmap.org/copyright).
//
// La red de calles de Arica y sus valles para el motor de rutas (spec 031). Todo
// son enteros compactos (ver codigo.ts): coordenadas ×1e6 como diferencia con el
// punto anterior.
//   nodos     lat y lng de cada nodo del grafo (cruces, extremos y barreras).
//   aristas   por arista: nodo desde, nodo hasta, código (clase + 16 un sentido
//             + 32 privada + 64 sin parada), velocidad (máxima anotada en km/h, 0 si no
//             hay, + 1000 sin pavimento), n puntos intermedios y sus 2n diferencias.
//   giros     por restricción: arista desde, nodo, arista hasta y 1 si es «solo por ahí».
//   cerrados  nodos con una barrera que no deja pasar.
//   portones  nodos con un portón privado: se pasa solo para llegar a una parada.
export const RED_ARICA = {
  fecha: "${hoy}",
  nodos: "${textoNodos}",
  aristas: "${textoAristas}",
  giros: "${textoGiros}",
  cerrados: "${textoCerrados}",
  portones: "${textoPortones}",
};
`,
);
const kb = (s) => `${Math.round(s.length / 1024)} KB`;
console.log(
  `${delGrafo.length} nodos, ${aristas.length} aristas (${puntosDeForma} puntos de forma), ${giros.length} giros (${sinUsar} sin usar), ` +
    `${delGrafo.filter((id) => cierra(id) === 1).length} barreras, ${delGrafo.filter((id) => cierra(id) === 2).length} portones privados → nodos ${kb(textoNodos)}, aristas ${kb(textoAristas)}`,
);
