// NO se escribe un proveedor sin medirlo antes: en este proyecto los límites de
// un proveedor se escriben medidos, no supuestos.
//
//   npm run sondear   (node --env-file=.env.local scripts/sondear-proveedores.mjs)
//
// GASTA: 27 consultas a Google Geocoding (dentro de las 10.000 gratis del mes,
// con GOOGLE_MAPS_KEY) y 27 al buscador de ORS (de su cupo gratis de 1.000 al
// día). Avisar antes de correrlo (AGENTS.md, «Límites»).
//
// La pregunta que contesta es UNA: ¿un proveedor abierto encuentra puertas de
// Arica que Google+OSM no tienen? Si no, no entra a la cascada. Desde la spec
// 019 la línea base es Google (antes Mapbox) y el candidato, el buscador de ORS
// (Photon se midió antes y no aportó ninguna puerta).
const RECUADRO_ARICA = "-70.45,-18.65,-70.10,-18.35";
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

// Google: la línea base contra la que se mide todo lo demás (spec 019). Solo la
// puerta o la cuadra cuentan: el centro de la calle no es una puerta.
async function google(d) {
  const clave = process.env.GOOGLE_MAPS_KEY;
  if (!clave) return { error: "sin GOOGLE_MAPS_KEY" };
  const [oeste, sur, este, norte] = RECUADRO_ARICA.split(",");
  const p = new URLSearchParams({
    address: d + ", Arica, Chile", components: "country:CL", region: "cl", language: "es",
    bounds: `${sur},${oeste}|${norte},${este}`, key: clave,
  });
  const r = await pedir("https://maps.googleapis.com/maps/api/geocode/json?" + p);
  if (r.error) return r;
  const f = r.datos.results?.[0];
  if (!f) return { ...r, vacio: true };
  const tipo = f.geometry?.location_type;
  const puerta = tipo === "ROOFTOP" || tipo === "RANGE_INTERPOLATED";
  const numero = f.address_components?.find((c) => c.types.includes("street_number"))?.long_name;
  return {
    ms: r.ms,
    n: r.datos.results.length,
    numero: puerta ? (numero ?? null) : null,
    etiqueta: f.formatted_address?.split(",")[0] + " (" + tipo + ")",
    lat: f.geometry?.location?.lat,
    lng: f.geometry?.location?.lng,
  };
}

// El buscador de ORS (Pelias: OSM más OpenAddresses): gratis, con la misma
// cuenta que la matriz. El candidato a dar puertas sin pagar.
async function ors(d) {
  const clave = process.env.NEXT_PUBLIC_ORS_KEY || process.env.ORS_API_KEY;
  if (!clave) return { error: "sin clave de ORS" };
  const [oeste, sur, este, norte] = RECUADRO_ARICA.split(",");
  const p = new URLSearchParams({
    text: d + ", Arica", "boundary.country": "CL", "boundary.rect.min_lon": oeste, "boundary.rect.min_lat": sur,
    "boundary.rect.max_lon": este, "boundary.rect.max_lat": norte, size: "5", lang: "es",
  });
  const r = await pedir("https://api.openrouteservice.org/geocode/search?" + p, { Authorization: clave });
  if (r.error) return r;
  const f = r.datos.features?.[0];
  if (!f) return { ...r, vacio: true };
  const pr = f.properties ?? {};
  return {
    ms: r.ms,
    n: r.datos.features.length,
    numero: pr.layer === "address" ? (pr.housenumber ?? null) : null,
    etiqueta: [pr.street ?? pr.name, pr.housenumber].filter(Boolean).join(" ") + " (" + pr.layer + ")",
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

const PROVEEDORES = [["google", google, 0], ["ors", ors, 1600], ["nominatim", nominatim, 1200]];
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
  [...resumen.google.filas, ...resumen.nominatim.filas].filter((f) => f.acierto).map((f) => f.d),
);
const aporta = resumen.ors.filas.filter((f) => f.acierto && !base.has(f.d));
console.log("\nPuertas que ORS encuentra y Google+OSM NO: " + aporta.length);
for (const f of aporta) console.log("  + " + f.d + " -> " + f.r.lat + "," + f.r.lng + " (" + f.r.etiqueta + ")");

const rescate = resumen.ors.filas.filter(
  (f) =>
    !f.r.error && !f.r.vacio &&
    [...resumen.google.filas, ...resumen.nominatim.filas]
      .filter((g) => g.d === f.d)
      .every((g) => g.r.error || g.r.vacio),
);
console.log("\nDirecciones que SOLO ORS ubica (los otros dos vacios): " + rescate.length);
for (const f of rescate) console.log("  + " + f.d + " -> " + f.r.etiqueta);

// Qué contesta cada uno ante una dirección que no existe: es lo que decide si el
// paso al siguiente proveedor se dispara por 404 o por un 200 con lista vacía.
console.log("\n## Ante una direccion inexistente\n");
for (const [n, fn, espera] of PROVEEDORES) {
  if (espera) await esperar(espera);
  const r = await fn("Calle Que No Existe En Ninguna Parte 99999");
  console.log("  " + n.padEnd(12) + (r.error ? "error " + r.error : r.vacio ? "HTTP 200 con lista VACIA" : "devolvio algo: " + r.etiqueta));
}
