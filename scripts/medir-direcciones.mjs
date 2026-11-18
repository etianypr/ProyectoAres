// Mide «Crear N pedidos» de «Cargar la guía» (spec 038): crear, ubicar y corregir con la IA,
// sin red, sin cuota y sin datos de nadie. Corre el cargarLineasGuia real sobre una IndexedDB
// falsa (fake-indexeddb), con la fila real de Nominatim (1,2 s entre consultas) y un `fetch`
// falso que contesta cada proveedor con una demora fija: Google por /api/geocodificar,
// Nominatim y la IA por /api/direccion-ia, que sigue un guion (busca y propone el primero).
// Las calles son del catálogo y los números, inventados.
//
//   npm run medir:direcciones                      la carga en línea
//   npm run medir:direcciones -- --adelanto 15     antes, 15 s de revisión con el adelanto de OSM
//   npm run medir:direcciones -- --sin-conexion    la conexión colgada: cuánto tarda en parar
//
// Imprime el tiempo por fase, las consultas por proveedor y un hash del resumen, de las filas
// guardadas y de las propuestas. Para comparar un cambio: correrlo antes y después; el hash
// tiene que ser el mismo y las consultas, las mismas o menos (la caché y la dedupe, spec 038).
import "fake-indexeddb/auto";
import { createHash } from "node:crypto";

const { cargarLineasGuia } = await import("@/lib/encomiendas/local/cargar-lineas");
const { leerPedidos } = await import("@/lib/encomiendas/local/almacen");
const { googleDirecto, olvidarConsultasGoogle } = await import("@/lib/geo/geocoding/google");
const nominatim = await import("@/lib/geo/geocoding/nominatim");
const geocoding = await import("@/lib/geo/geocoding");

const args = process.argv.slice(2);
const opcion = (nombre) => args.includes(nombre);
const segundosAdelanto = opcion("--adelanto") ? Number(args[args.indexOf("--adelanto") + 1] ?? 15) : null;

/** Demora de cada proveedor, en ms: ida y vuelta desde el teléfono. */
const DEMORA = { google: 400, osm: 300, ia: 2000 };

// ---------------------------------------------------------------- el mundo (calles reales, números inventados)
const clave = (t) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Puerta de Google: la calle oficial, el número y el punto. */
const puerta = (calle, numero, lat, lng, tipo = "ROOFTOP") => ({
  place_id: `g-${clave(calle)}-${numero}-${lat}`,
  address_components: [
    { long_name: numero, short_name: numero, types: ["street_number"] },
    { long_name: calle, short_name: calle, types: ["route"] },
  ],
  geometry: { location: { lat, lng }, location_type: tipo },
});
/** Un tramo de calle en OSM, sin número. */
const tramo = (nombre, lat, lng, id) => ({
  osm_type: "way", osm_id: id, lat: String(lat), lon: String(lng), category: "highway", name: nombre,
  address: { road: nombre, city: "Arica" },
});

/** Lo que contesta Google a cada consulta (sin «, Arica, Chile»); lo demás, ZERO_RESULTS. */
const GOOGLE = new Map(
  Object.entries({
    "santiago arata 1450": [puerta("Avenida Santiago Arata Gandolfo", "1450", -18.4902, -70.3011)],
    "braulio munoz 1203": [],
    "braulio muñoz 1203": [puerta("Braulio Muñoz", "1203", -18.4731, -70.2987)],
    "braulio muñoz 1210": [puerta("Braulio Muñoz", "1210", -18.4733, -70.2985)],
    "avenida diputado humberto arellano figueroa 2210": [puerta("Avenida Diputado Humberto Arellano Figueroa", "2210", -18.4712, -70.2903, "RANGE_INTERPOLATED")],
    "avenida linderos poniente 3311": [puerta("Avenida Linderos Poniente", "3311", -18.4795, -70.3128)],
    "avenida linderos poniente 3315": [puerta("Avenida Linderos Poniente", "3315", -18.4797, -70.3126)],
    "avenida linderos oriente 3315": [puerta("Avenida Linderos Oriente", "3315", -18.4702, -70.2811)],
    "san marcos 845": [puerta("San Marcos", "845", -18.4701, -70.3001)],
    "maipu 412": [puerta("Maipú", "412", -18.4781, -70.3121)],
    "pudahuel 1730": [puerta("Pudahuel", "1730", -18.4655, -70.2899, "RANGE_INTERPOLATED")],
    "tucapel 2604": [puerta("Tucapel", "2604", -18.4567, -70.2921)],
    "lebu 1880": [puerta("Lebu", "1880", -18.4612, -70.2954)],
    "chacabuco 640": [puerta("Chacabuco", "640", -18.4771, -70.3164)],
    // La puerta de OTRA calle: se descarta (spec 016, FR-007).
    "avenida diego portales 2950": [puerta("Avenida Senador Humberto Palza Corvacho", "2950", -18.4901, -70.2952)],
    "21 de mayo 990": [puerta("21 de Mayo", "990", -18.4789, -70.3105)],
    "patricio lynch 455": [puerta("Patricio Lynch", "455", -18.4802, -70.3168)],
    "general velasquez 1325": [puerta("General Velásquez", "1325", -18.4835, -70.3087)],
    "rafael sotomayor 780": [puerta("Rafael Sotomayor", "780", -18.4769, -70.3089)],
    "yungay 515": [puerta("Yungay", "515", -18.4752, -70.3121)],
    "los aromos 120": [puerta("Los Aromos", "120", -18.4612, -70.3002), puerta("Los Aromos", "120", -18.5205, -70.2151)],
    "alejandro azolas 2150": [puerta("Avenida Alejandro Azola", "2150", -18.4923, -70.2896)],
    // Lo que busca la IA (IA_BUSCA): puertas a más de 60 m de lo que ya había, para que propongan.
    "pasaje las acacias 2050": [puerta("Las Acacias", "2050", -18.4588, -70.2799, "RANGE_INTERPOLATED")],
    "pasaje pudahuel 1730": [puerta("Pudahuel", "1730", -18.4671, -70.2911)],
    "avenida santiago arata gandolfo 3020": [puerta("Avenida Santiago Arata Gandolfo", "3020", -18.4952, -70.3044)],
    "santa maria 2390": [puerta("Avenida Santa María", "2390", -18.4597, -70.2933)],
  }).map(([k, v]) => [clave(k), v]),
);

/** Lo que contesta Nominatim a cada consulta; lo demás, []. */
const OSM = new Map(
  Object.entries({
    "humberto arellano 2210": [tramo("Avenida Diputado Humberto Arellano Figueroa", -18.47, -70.29, 2), tramo("Avenida Diputado Humberto Arellano Figueroa", -18.479, -70.293, 3)],
    "linderos 3311": [tramo("Avenida Linderos Poniente", -18.48, -70.31, 8), tramo("Avenida Linderos Oriente", -18.47, -70.28, 9)],
    "linderos 3315": [tramo("Avenida Linderos Poniente", -18.48, -70.31, 8), tramo("Avenida Linderos Oriente", -18.47, -70.28, 9)],
    "carlos witting 120": [tramo("Carlos Witting", -18.46, -70.29, 4)],
    "avenida santa maria 2390": [tramo("Avenida Santa María", -18.4651, -70.2954, 21), tramo("Avenida Santa María", -18.4502, -70.2911, 22)],
    "santiago arata 3020": [tramo("Santiago", -18.45, -70.3, 7), tramo("Santiago Arata Gandolfo", -18.49, -70.3, 1)],
    "quinsachata 1749": [{ osm_type: "node", osm_id: 13579, lat: "-18.4691", lon: "-70.3012", category: "place", address: { road: "Quinsachata", house_number: "1749", suburb: "Cerro La Cruz", city: "Arica" } }],
    "terminal rodoviario": [{ osm_type: "way", osm_id: 97531, lat: "-18.4809", lon: "-70.3081", category: "amenity", name: "Terminal Rodoviario de Arica", address: { road: "Avenida Diego Portales", suburb: "Centro", city: "Arica" } }],
  }).map(([k, v]) => [clave(k), v]),
);

/** Las líneas de la guía: repetidas, por completar (tipeo, nombre a medias), con referencia,
 *  dudosas (la cuadra, solo la calle), sin ubicar y calles repetidas. */
const DESTINOS = [
  "BRAULIO MUNOZ 1203", "SANTIAGO ARATA 1450", "HUMBERTO ARELLANO 2210", "LINDEROS 3311", "LINDEROS 3315",
  "CARLOS WITTING 120", "SAN MARCOS 845", "SAN MARCOS 845", "MAIPU 0412", "PUDAHUEL 1730",
  "TUCAPEL 2604 DEPTO 12", "LEBU 1880 CON YUNGAY", "CHACABUCO 640", "AV. DIEGO PORTALES 2950", "QUINSACHATA 1749",
  "21 DE MAYO 990", "AVENIDA SANTA MARIA 2390", "PATRICIO LYNCH 455", "GENERAL VELASQUEZ 1325", "RAFAEL SOTOMAYOR 780",
  "YUNGAY 515", "LAS ACACIAS 2050", "LOS AROMOS 120", "PASAJE 1 1452 CON TOBALABA", "PASAJE 1 1453",
  "BRAULIO MUNOS 1210", "CHACABUCO 640", "TERMINAL RODOVIARIO", "ALEJANDRO AZOLAS 2150", "SANTIAGO ARATA 3020",
];
const lineas = DESTINOS.map((destino, i) => ({ of: String(900100 + i), destino }));

/** El guion de la IA: lo que busca para cada dirección (si no, la misma). */
const IA_BUSCA = new Map([
  ["LAS ACACIAS 2050", "Pasaje Las Acacias 2050"],
  ["HUMBERTO ARELLANO 2210", "Avenida Diputado Humberto Arellano Figueroa 2210"],
  ["PUDAHUEL 1730", "Pasaje Pudahuel 1730"],
  ["SANTIAGO ARATA 3020", "Avenida Santiago Arata Gandolfo 3020"],
  ["AVENIDA SANTA MARIA 2390", "Santa María 2390"],
]);

// ---------------------------------------------------------------- el fetch falso
const consultas = { google: 0, osm: 0, ia: 0 };
let sinConexion = false;
const json = (cuerpo) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
const abortado = (senal) => senal?.reason ?? new DOMException("Abortado", "AbortError");

/** Espera la demora del proveedor; sin conexión, hasta que el tope o el llamador aborte. */
function demora(ms, senal) {
  return new Promise((listo, falla) => {
    if (senal?.aborted) return falla(abortado(senal));
    const reloj = sinConexion ? null : setTimeout(listo, ms);
    senal?.addEventListener("abort", () => (clearTimeout(reloj), falla(abortado(senal))), { once: true });
  });
}

function respuestaIA(mensajes) {
  const ultimo = mensajes.at(-1);
  if (typeof ultimo.content === "string") {
    const direccion = /«(.*)»/.exec(ultimo.content)?.[1] ?? "";
    const consulta = IA_BUSCA.get(direccion) ?? direccion;
    return { contenido: [{ type: "tool_use", id: "t1", name: "buscar_direccion", input: { consulta } }], fin: "tool_use" };
  }
  const resultado = ultimo.content.find((b) => b.type === "tool_result");
  const lista = resultado?.content?.startsWith("[") ? JSON.parse(resultado.content) : [];
  if (lista.length === 0) return { contenido: [{ type: "text", text: "Sin candidatos." }], fin: "end_turn" };
  const c = lista[0];
  return {
    contenido: [{ type: "tool_use", id: "t2", name: "proponer", input: { candidato: c.id, direccion: c.direccion, confianza: "media", motivo: "guion" } }],
    fin: "tool_use",
  };
}

globalThis.window = {}; // Google se pregunta desde el teléfono
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = typeof entrada === "string" ? entrada : entrada.url;
  const senal = opciones.signal;
  if (url === "/api/geocodificar") {
    consultas.google++;
    await demora(DEMORA.google, senal);
    const { direccion } = JSON.parse(opciones.body);
    return json({ sugerencias: (await googleDirecto(direccion, "clave-prueba")) ?? [] });
  }
  if (url.includes("googleapis")) {
    const address = (new URL(url).searchParams.get("address") ?? "").replace(/, Arica, Chile$/, "");
    const results = GOOGLE.get(clave(address)) ?? [];
    return json(results.length > 0 ? { status: "OK", results } : { status: "ZERO_RESULTS", results: [] });
  }
  if (url === "/api/direccion-ia") {
    consultas.ia++;
    await demora(DEMORA.ia, senal);
    return json(respuestaIA(JSON.parse(opciones.body).mensajes));
  }
  if (url.includes("nominatim")) {
    consultas.osm++;
    await demora(DEMORA.osm, senal);
    const q = (new URL(url).searchParams.get("q") ?? "").replace(/, Arica, Chile$/, "");
    return json(OSM.get(clave(q)) ?? []);
  }
  throw new Error(`host inesperado: ${url}`);
};

// ---------------------------------------------------------------- el hash
/** JSON con las claves ordenadas: el mismo dato da el mismo texto aunque cambie el orden de armado. */
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
const hash = (v) => createHash("sha256").update(canonico(v)).digest("hex").slice(0, 12);
const porOf = (a, b) => (a.of < b.of ? -1 : a.of > b.of ? 1 : 0);

/** Lo que se compara, sin ids ni horas (cambian en cada corrida): todo por OF. */
async function huellas(resumen, fecha) {
  const pedidos = await leerPedidos(fecha);
  const ofDe = new Map(pedidos.map((p) => [p.id, p.of]));
  const of = (id) => ofDe.get(id) ?? `?${id}`;
  // El orden de la IA sigue al de IndexedDB (ids al azar en el mismo ms): las propuestas se ordenan.
  const propuestas = resumen.propuestas.map(({ pedidoId, ...p }) => ({ of: of(pedidoId), ...p })).sort(porOf);
  const filas = pedidos
    .map((p) => {
      // La fecha es otra en cada carga (una por escenario): se compara lo demás.
      const fila = { ...p };
      delete fila.id;
      delete fila.cargadoEn;
      delete fila.fecha;
      return fila;
    })
    .sort(porOf);
  return {
    resumen: hash({ ...resumen, ids: resumen.ids.map(of), sinUbicar: resumen.sinUbicar.map((s) => ({ ...s, id: of(s.id) })), propuestas }),
    filas: hash(filas),
    propuestas: hash(propuestas),
    cifras: `${resumen.ubicados} ubicados, ${resumen.sinUbicar.length} sin ubicar, ${resumen.propuestas.length} propuestas, ${resumen.sinArreglo} sin arreglo, IA ${resumen.ia}`,
  };
}

// ---------------------------------------------------------------- una carga
let dia = 10;
async function medirCarga(titulo, { adelanto = null } = {}) {
  olvidarConsultasGoogle();
  nominatim.olvidarConsultasNominatim?.();
  const fecha = `2026-12-${String(dia++).padStart(2, "0")}`;
  const ms = () => performance.now();
  const consultasEn = () => ({ ...consultas });
  const resta = (a, b) => `Google ${a.google - b.google} · OSM ${a.osm - b.osm} · IA ${a.ia - b.ia}`;
  console.log(`\n${titulo} (${lineas.length} líneas)`);

  if (adelanto != null) {
    if (!geocoding.adelantarNominatim) {
      console.log("  sin adelanto en este código: se omite");
      return null;
    }
    const antes = consultasEn();
    const control = new AbortController();
    const t = ms();
    // La dirección que tendrá cada pedido: acá las líneas van tal cual a cargarLineasGuia.
    void Promise.all(lineas.map((l) => geocoding.adelantarNominatim(l.destino, control.signal)));
    await new Promise((listo) => setTimeout(listo, adelanto * 1000));
    control.abort(); // «Crear N pedidos»
    console.log(`  revisión ${(ms() - t).toFixed(0)} ms: ${resta(consultasEn(), antes)}`);
  }

  const marcas = { inicio: ms(), inicioC: consultasEn() };
  const resumen = await cargarLineasGuia(lineas, fecha, {
    folio: null,
    origen: "guia_pegada",
    lecturaIA: true,
    alAvanzar: (fase) => {
      if (marcas[fase]) return;
      marcas[fase] = ms();
      marcas[`${fase}C`] = consultasEn();
    },
  });
  const fin = ms();
  const finC = consultasEn();
  const ubicando = marcas.ubicando ?? fin;
  const corrigiendo = marcas.corrigiendo ?? fin;
  console.log(`  crear ${(ubicando - marcas.inicio).toFixed(0)} ms`);
  console.log(`  ubicando ${(corrigiendo - ubicando).toFixed(0)} ms: ${resta(marcas.corrigiendoC ?? finC, marcas.ubicandoC ?? marcas.inicioC)}`);
  if (marcas.corrigiendo) console.log(`  corrigiendo ${(fin - corrigiendo).toFixed(0)} ms: ${resta(finC, marcas.corrigiendoC)}`);
  console.log(`  total ${(fin - marcas.inicio).toFixed(0)} ms: ${resta(finC, marcas.inicioC)}`);
  const h = await huellas(resumen, fecha);
  console.log(`  ${h.cifras}${resumen.sinSenal ? " · paró sin conexión" : ""}`);
  console.log(`  hash resumen ${h.resumen} · filas ${h.filas} · propuestas ${h.propuestas}`);
  return h;
}

const enLinea = await medirCarga("En línea");
if (segundosAdelanto != null) {
  const conAdelanto = await medirCarga(`Con ${segundosAdelanto} s de revisión antes (adelanto de OSM)`, { adelanto: segundosAdelanto });
  if (conAdelanto) {
    const igual = ["resumen", "filas", "propuestas"].every((k) => conAdelanto[k] === enLinea[k]);
    console.log(`  ${igual ? "mismo hash que en línea" : "OJO: el hash cambió con el adelanto"}`);
  }
}
if (opcion("--sin-conexion")) {
  sinConexion = true;
  // Los topes son AbortSignal.timeout, que no sostienen el proceso: sin esto Node sale antes.
  const sostener = setInterval(() => {}, 1000);
  await medirCarga("Sin conexión (colgada: cada consulta espera su tope)");
  clearInterval(sostener);
  sinConexion = false;
}
process.exit(0);
