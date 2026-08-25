// Tarea 0 del plan del servidor MCP: NO se escribe un proveedor sin medirlo antes.
//
// Este script es DESCARTABLE. Su única salida que importa es la tabla que queda
// pegada como comentario de cabecera en src/lib/geo/proveedores/: en este
// proyecto los límites de un proveedor se escriben medidos, no supuestos (ver
// MAX_PUNTOS_POR_CONSULTA en lib/rutas.ts, "25 devuelve 200 y 26 devuelve 422").
//
//   node --env-file=.env.local scripts/sondear-proveedores.mjs
//
// La pregunta que contesta es UNA: ¿un proveedor abierto encuentra puertas de
// Arica que Mapbox+OSM no tienen? Si no, no entra a la cascada.
const RECUADRO_ARICA = "-70.45,-18.65,-70.10,-18.35";
const CENTRO = { lat: -18.4783, lng: -70.3126 };
const UA = "ares-encomiendas/1.0 (sondeo de proveedores; contacto: admin de la empresa)";

// Las seis primeras son las direcciones reales que ya están en
// pruebas/fixtures/geocoding-*.json, incluidos los dos casos caros documentados:
// "Los Aromos 120" (existe en Arica Y en Azapa) y "Linderos 3536" (el número se
// pierde porque la calle se llama "Avenida Linderos Poniente").
const DIRECCIONES = [
  "Quinsachata 1749", "Avenida Chacabuco 500", "Avenida Diego Portales 2000",
  "Linderos 3536", "Los Aromos 120", "Terminal Rodoviario",
  "Avenida Santa María 2600", "18 de Septiembre 200", "Calle Colón 123",
  "Avenida Capitán Ávalos 3000", "Pedro Aguirre Cerda 1500", "Avenida Tucapel 500",
  "Calle Sotomayor 500", "Avenida Argentina 1500", "General Velásquez 1200",
  "Calle Baquedano 300", "Avenida Comandante San Martín 500", "Población Nueva Esperanza",
  "Avenida Luis Beretta Porcel 2000", "Calle Maipú 400", "Avenida España 1200",
  "Calle Yungay 700", "Avenida Costanera 100", "Calle Patricio Lynch 400",
  "Avenida Linderos Poniente 3536", "Calle Rafael Sotomayor 300",
];

// El número que se pidió, para poder decir si el proveedor lo encontró DE VERDAD
// o solo dio la calle y dejó la parada a mitad de cuadra.
const numeroPedido = (d) => d.match(/\b(\d{1,5})\s*$/)?.[1] ?? null;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, headers = {}) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - t;
    if (!res.ok) return { error: "HTTP " + res.status, http: res.status, ms };
    return { datos: await res.json(), ms };
  } catch (e) {
    return { error: e.name, ms: Date.now() - t };
  }
}

// Mapbox: la línea base contra la que se mide todo lo demás.
async function mapbox(d) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return { error: "sin token" };
  const p = new URLSearchParams({
    q: d, country: "cl", bbox: RECUADRO_ARICA,
    types: "address,street,neighborhood,place", language: "es", access_token: token, limit: "5",
  });
  const r = await pedir("https://api.mapbox.com/search/geocode/v6/forward?" + p);
  if (r.error) return r;
  const f = r.datos.features?.[0];
  if (!f) return { ...r, vacio: true };
  const pr = f.properties ?? {};
  // match_code.street='unmatched' es Mapbox pegando el número sobre OTRA calle:
  // ese resultado NO cuenta como puerta encontrada.
  const pegado = pr.match_code?.address_number === "matched" && pr.match_code?.street === "matched";
  return {
    ms: r.ms,
    n: r.datos.features.length,
    numero: pegado ? (pr.name?.match(/\d+/)?.[0] ?? null) : null,
    etiqueta: pr.name,
    lat: pr.coordinates?.latitude,
    lng: pr.coordinates?.longitude,
  };
}

// Photon: sin API key, datos de OSM, tolera errores de tipeo.
async function photon(d) {
  const p = new URLSearchParams({
    q: d, limit: "5", lat: String(CENTRO.lat), lon: String(CENTRO.lng), bbox: RECUADRO_ARICA,
  });
  const r = await pedir("https://photon.komoot.io/api/?" + p, { "User-Agent": UA });
  if (r.error) return r;
  const f = r.datos.features?.[0];
  if (!f) return { ...r, vacio: true };
  const pr = f.properties ?? {};
  return {
    ms: r.ms,
    n: r.datos.features.length,
    numero: pr.housenumber ?? null,
    etiqueta: [pr.street ?? pr.name, pr.housenumber].filter(Boolean).join(" "),
    lat: f.geometry?.coordinates?.[1],
    lng: f.geometry?.coordinates?.[0],
  };
}

// Nominatim: el que la app YA consulta. Está acá para que la comparación sea
// justa: lo que Photon aporte tiene que ser sobre esto, no sobre nada.
async function nominatim(d) {
  const p = new URLSearchParams({
    q: d, format: "jsonv2", addressdetails: "1", limit: "5",
    countrycodes: "cl", viewbox: RECUADRO_ARICA, bounded: "1", "accept-language": "es",
  });
  const r = await pedir("https://nominatim.openstreetmap.org/search?" + p, { "User-Agent": UA });
  if (r.error) return r;
  const f = r.datos?.[0];
  if (!f) return { ...r, vacio: true };
  return {
    ms: r.ms,
    n: r.datos.length,
    numero: f.address?.house_number ?? null,
    etiqueta: f.display_name?.split(",").slice(0, 2).join(","),
    lat: Number(f.lat),
    lng: Number(f.lon),
  };
}

const PROVEEDORES = [["mapbox", mapbox, 0], ["photon", photon, 1100], ["nominatim", nominatim, 1200]];
const resumen = {};

for (const [nombre, fn, espera] of PROVEEDORES) {
  const filas = [];
  console.log("\n### " + nombre + "\n");
  for (const d of DIRECCIONES) {
    if (espera) await esperar(espera); // el 1/s que exige la política de OSM
    const r = await fn(d);
    const pedido = numeroPedido(d);
    const acierto = Boolean(pedido) && r.numero === pedido;
    filas.push({ d, pedido, r, acierto });
    const estado = r.error
      ? "x " + r.error
      : r.vacio
        ? "- vacio"
        : acierto
          ? "OK puerta"
          : r.numero
            ? "~ n " + r.numero
            : "~ solo calle";
    console.log("  " + d.padEnd(34) + String(r.ms ?? "").padStart(5) + "ms  " + estado.padEnd(14) + (r.etiqueta ?? ""));
  }
  const conNumero = DIRECCIONES.filter(numeroPedido).length;
  const ms = filas.map((f) => f.r.ms).filter(Boolean).sort((a, b) => a - b);
  resumen[nombre] = {
    puertas: filas.filter((f) => f.acierto).length,
    conNumero,
    vacios: filas.filter((f) => f.r.vacio).length,
    errores: filas.filter((f) => f.r.error).length,
    p50: ms[Math.floor(ms.length / 2)] ?? 0,
    p95: ms[Math.floor(ms.length * 0.95)] ?? 0,
    filas,
  };
}

console.log("\n\n## Resumen\n");
console.log("| proveedor | puertas exactas | vacios | errores | p50 | p95 |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const [n, r] of Object.entries(resumen)) {
  const pct = Math.round((r.puertas / r.conNumero) * 100);
  console.log("| " + n + " | " + r.puertas + "/" + r.conNumero + " (" + pct + "%) | " + r.vacios + " | " + r.errores + " | " + r.p50 + " ms | " + r.p95 + " ms |");
}

// El criterio de corte, calculado y no opinado.
const base = new Set(
  [...resumen.mapbox.filas, ...resumen.nominatim.filas].filter((f) => f.acierto).map((f) => f.d),
);
const aporta = resumen.photon.filas.filter((f) => f.acierto && !base.has(f.d));
console.log("\nPuertas que Photon encuentra y Mapbox+OSM NO: " + aporta.length);
for (const f of aporta) console.log("  + " + f.d + " -> " + f.r.lat + "," + f.r.lng + " (" + f.r.etiqueta + ")");

const rescate = resumen.photon.filas.filter(
  (f) =>
    !f.r.error && !f.r.vacio &&
    [...resumen.mapbox.filas, ...resumen.nominatim.filas]
      .filter((g) => g.d === f.d)
      .every((g) => g.r.error || g.r.vacio),
);
console.log("\nDirecciones que SOLO Photon ubica (los otros dos vacios): " + rescate.length);
for (const f of rescate) console.log("  + " + f.d + " -> " + f.r.etiqueta);

// Qué contesta cada uno ante una dirección que no existe: es lo que decide si el
// paso al siguiente proveedor se dispara por 404 o por un 200 con lista vacía.
console.log("\n## Ante una direccion inexistente\n");
for (const [n, fn, espera] of PROVEEDORES) {
  if (espera) await esperar(espera);
  const r = await fn("Calle Que No Existe En Ninguna Parte 99999");
  console.log("  " + n.padEnd(12) + (r.error ? "error " + r.error : r.vacio ? "HTTP 200 con lista VACIA" : "devolvio algo: " + r.etiqueta));
}
