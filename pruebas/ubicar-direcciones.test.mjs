// Spec 016: que la dirección de la guía se ubique sola pese al tipeo.
//
// Los nombres de calle son reales (del catálogo de OpenStreetMap); los NÚMEROS
// son inventados: ninguna dirección de un destinatario entra al repo. Mapbox y
// Nominatim se responden reemplazando el fetch global, como en
// asistencia-direcciones.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";

const { normalizarConsulta, coincidenciaCalle, distanciaEdicion } = await import(
  "@/lib/geo/geocoding/consulta"
);
const { callesParecidas, largoDeCalle } = await import("@/lib/geo/geocoding/calles");
const { ubicarDireccion } = await import("@/lib/geo/geocoding");
const { googleDirecto } = await import("@/lib/geo/geocoding/google");

// ---------------------------------------------------------------------------
// Limpieza del texto
// ---------------------------------------------------------------------------

test("los ceros a la izquierda del número se sacan", () => {
  assert.equal(normalizarConsulta("PUDAHUEL 0123"), "PUDAHUEL 123");
  assert.equal(normalizarConsulta("AV. CAPITAN AVELINO VILLAGRAN 045"), "avenida CAPITAN AVELINO VILLAGRAN 45");
  assert.equal(normalizarConsulta("Pasaje 05 Norte 0"), "Pasaje 5 Norte 0");
});

test("lo que sigue al número marcado con # o N° es el depto", () => {
  assert.equal(normalizarConsulta("ALFONSO NESPOLO ARATA # 12 3"), "ALFONSO NESPOLO ARATA 12");
  assert.equal(normalizarConsulta("Tucapel N° 40 2"), "Tucapel 40");
});

test("letra, subnúmero y lugar después del número se sacan", () => {
  assert.equal(normalizarConsulta("SAN MARCOS 100 B"), "SAN MARCOS 100");
  assert.equal(normalizarConsulta("San Marcos 100B"), "San Marcos 100");
  assert.equal(normalizarConsulta("Lebu 50-2"), "Lebu 50");
  assert.equal(normalizarConsulta("LEBU 50 CERRO LA CRUZ"), "LEBU 50");
  assert.equal(normalizarConsulta("Lebu 50, villa Los Pinos"), "Lebu 50");
  assert.equal(normalizarConsulta("Chacabuco 500, Arica, Chile"), "Chacabuco 500");
});

test("un edificio con su número no es el número de casa", () => {
  assert.equal(
    normalizarConsulta("AVENIDA DIPUTADO HUMBERTO ARELLANO FIGUEROA EDIFICIO 01"),
    "AVENIDA DIPUTADO HUMBERTO ARELLANO FIGUEROA",
  );
});

test("lo que es parte del nombre de la calle se queda", () => {
  assert.equal(normalizarConsulta("Pasaje Casa Blanca 12"), "Pasaje Casa Blanca 12");
  assert.equal(normalizarConsulta("Pasaje Arica"), "Pasaje Arica");
  assert.equal(normalizarConsulta("21 de Mayo 500"), "21 de Mayo 500");
  assert.equal(normalizarConsulta("2 Oriente 100"), "2 Oriente 100");
  assert.equal(normalizarConsulta("Pasaje 1 Norte 17"), "Pasaje 1 Norte 17");
});

// ---------------------------------------------------------------------------
// ¿Es esta la calle escrita?
// ---------------------------------------------------------------------------

test("una letra cambiada en una palabra larga se corrige; en una corta, no", () => {
  assert.equal(coincidenciaCalle("Braulio Muniz", "Braulio Muñoz")?.ediciones, 1);
  assert.equal(coincidenciaCalle("Alejandro Azolas", "Avenida Alejandro Azola")?.ediciones, 1);
  assert.equal(coincidenciaCalle("Lebo", "Lebu"), null);
  assert.equal(coincidenciaCalle("Linder", "Avenida Linderos Poniente"), null);
  assert.equal(distanciaEdicion("witnig", "witting"), 2);
  assert.equal(distanciaEdicion("wittnig", "witting"), 1, "dos letras vecinas cambiadas valen una");
});

test("faltan apellido, grado o tipo de vía: sigue siendo la calle", () => {
  assert.deepEqual(coincidenciaCalle("Santiago Arata", "Santiago Arata Gandolfo"), {
    ediciones: 0,
    faltantes: 0,
    sobrantes: 1,
  });
  assert.ok(coincidenciaCalle("Humberto Arellano", "Avenida Diputado Humberto Arellano Figueroa"));
  assert.equal(coincidenciaCalle("Capitan Avalos", "Pasaje Avalos")?.faltantes, 1);
});

test("lo que distingue una calle de otra no se corrige", () => {
  assert.equal(coincidenciaCalle("Linderos Poniente", "Avenida Linderos Oriente"), null);
  assert.equal(coincidenciaCalle("Pasaje 1 Norte", "Pasaje 2 Norte"), null);
  assert.equal(coincidenciaCalle("Avenida", "Avenida Linderos"), null);
});

// ---------------------------------------------------------------------------
// Catálogo de calles de Arica
// ---------------------------------------------------------------------------

test("el catálogo devuelve el nombre oficial", async () => {
  assert.equal((await callesParecidas("BRAULIO MUNIZ"))[0]?.nombre, "Braulio Muñoz");
  assert.equal((await callesParecidas("SANTIAGO ARATA"))[0]?.nombre, "Santiago Arata Gandolfo");
  assert.equal(
    (await callesParecidas("HUMBERTO ARELLANO"))[0]?.nombre,
    "Avenida Diputado Humberto Arellano Figueroa",
  );
});

test("si una calle calza tal cual, no se ofrecen las parecidas", async () => {
  const nombres = (await callesParecidas("Alejandro Azolas")).map((c) => c.nombre);
  assert.deepEqual(nombres, ["Alejandro Azolas"]);
});

test("el catálogo sabe cuánto mide cada calle", async () => {
  assert.ok((await largoDeCalle("Carlos Witting")) <= 300);
  assert.ok((await largoDeCalle("santiago arata gandolfo")) > 1000);
  assert.equal(await largoDeCalle("Calle Que No Existe"), null);
});

// ---------------------------------------------------------------------------
// ubicarDireccion con proveedores simulados
// ---------------------------------------------------------------------------

const fetchOriginal = globalThis.fetch;
let mapbox = () => ({ features: [] });
let osm = () => [];
let google = () => ({ status: "ZERO_RESULTS", results: [] });
let consultas = [];

test.before(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.prueba";
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    // El teléfono pregunta a Google por /api/geocodificar: se hace lo mismo que
    // la ruta (googleDirecto con la clave del servidor).
    if (url === "/api/geocodificar") {
      const { direccion } = JSON.parse(opciones.body);
      const sugerencias = await googleDirecto(direccion, "clave-prueba");
      return new Response(JSON.stringify({ sugerencias }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const params = new URL(url).searchParams;
    const q = params.get("q") ?? params.get("address") ?? "";
    const cual = url.includes("nominatim") ? "osm" : url.includes("googleapis") ? "google" : "mapbox";
    consultas.push({ cual, q });
    const cuerpo = cual === "osm" ? osm(q) : cual === "google" ? google(q) : mapbox(q);
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});
test.beforeEach(() => {
  mapbox = () => ({ features: [] });
  osm = () => [];
  google = () => ({ status: "ZERO_RESULTS", results: [] });
  consultas = [];
  delete globalThis.window;
});

function rasgo(tipo, nombre, lat, lng, match_code) {
  return {
    id: `urn:${nombre}`,
    properties: {
      mapbox_id: `urn:${nombre}:${lat}`,
      feature_type: tipo,
      name: nombre,
      place_formatted: "Arica, Región de Arica y Parinacota, Chile",
      coordinates: { latitude: lat, longitude: lng },
      ...(match_code ? { match_code } : {}),
    },
  };
}
const puerta = (nombre, lat, lng, calle = "matched") =>
  rasgo("address", nombre, lat, lng, { street: calle, address_number: "matched", confidence: "low" });
const calleSola = (nombre, lat, lng) => rasgo("street", nombre, lat, lng);
const tramoOsm = (nombre, lat, lng, id) => ({
  osm_type: "way",
  osm_id: id,
  lat: String(lat),
  lon: String(lng),
  category: "highway",
  name: nombre,
  address: { road: nombre, city: "Arica" },
});

test("la puerta que Mapbox marca 'otra calle' se acepta si es la escrita", async () => {
  mapbox = () => ({ features: [puerta("Alejandro Azolas 901", -18.49, -70.29, "unmatched")] });
  const r = await ubicarDireccion("ALEJANDRO AZOLAS 901");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Alejandro Azolas 901");
});

test("la puerta de OTRA calle se sigue descartando", async () => {
  mapbox = () => ({ features: [puerta("Avenida Senador Humberto Palza Corvacho 902", -18.5, -70.3, "unmatched")] });
  const r = await ubicarDireccion("Avenida Diego Portales 902");
  assert.equal(r.tipo, "no_encontrada");
});

test("con el nombre mal escrito se pregunta por el oficial y se encuentra la puerta", async () => {
  mapbox = (q) => (q === "Braulio Muñoz 903" ? { features: [puerta("Braulio Muñoz 903", -18.47, -70.3)] } : { features: [] });
  const r = await ubicarDireccion("BRAULIO MUNIZ 903");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Braulio Muñoz 903");
  assert.ok(consultas.some((c) => c.cual === "mapbox" && c.q === "Braulio Muñoz 903"));
});

test("en una calle corta sin el número, la parada va a la calle con aviso", async () => {
  mapbox = () => ({ features: [calleSola("Carlos Witting", -18.46, -70.29)] });
  const r = await ubicarDireccion("CARLOS WITTING 0904");
  assert.equal(r.tipo, "aproximada");
  assert.equal(r.elegida?.direccion, "Carlos Witting");
  assert.match(r.advertencia, /corta/);
});

test("en una calle larga sin el número no se elige, y la calle escrita va primero", async () => {
  mapbox = () => ({ features: [calleSola("Santiago", -18.45, -70.3)] });
  osm = () => [tramoOsm("Santiago Arata Gandolfo", -18.49, -70.3, 1)];
  const r = await ubicarDireccion("SANTIAGO ARATA 905");
  assert.equal(r.tipo, "solo_calle");
  assert.equal(r.elegida, null);
  assert.equal(r.candidatos[0].direccion, "Santiago Arata Gandolfo");
});

test("dos tramos lejanos de la misma avenida no son 'dos lugares'", async () => {
  osm = () => [
    tramoOsm("Avenida Diputado Humberto Arellano Figueroa", -18.47, -70.29, 2),
    tramoOsm("Avenida Diputado Humberto Arellano Figueroa", -18.479, -70.293, 3),
  ];
  const r = await ubicarDireccion("HUMBERTO ARELLANO 906");
  assert.equal(r.tipo, "solo_calle");
});

test("el mismo número en dos nombres de la misma calle, juntos: no hay que elegir", async () => {
  // "Avenida Linderos Poniente" y "Avenida Linderos Oriente" como si fueran una
  // sola calle con dos nombres: las dos puertas caen a 15 m.
  mapbox = (q) => {
    if (q === "Avenida Linderos Poniente 907") return { features: [puerta(q, -18.4795, -70.3128)] };
    if (q === "Avenida Linderos Oriente 907") return { features: [puerta(q, -18.4796, -70.3127)] };
    return { features: [calleSola("Avenida Linderos Poniente", -18.48, -70.31), calleSola("Avenida Linderos Oriente", -18.47, -70.28)] };
  };
  const r = await ubicarDireccion("Linderos 907");
  assert.equal(r.tipo, "exacta");
  assert.ok(r.elegida);
});

// ---------------------------------------------------------------------------
// Google, último recurso (spec 016, US3)
// ---------------------------------------------------------------------------

const resultadoGoogle = (calle, numero, lat, lng, location_type = "ROOFTOP") => ({
  status: "OK",
  results: [
    {
      place_id: `g-${numero}`,
      address_components: [
        { long_name: numero, short_name: numero, types: ["street_number"] },
        { long_name: calle, short_name: calle, types: ["route"] },
      ],
      geometry: { location: { lat, lng }, location_type },
    },
  ],
});

test("sin puerta en Mapbox ni OSM, Google la da y queda exacta", async () => {
  globalThis.window = {}; // desde el teléfono
  mapbox = () => ({ features: [calleSola("Santiago Arata Gandolfo", -18.49, -70.3)] });
  google = () => resultadoGoogle("Avenida Santiago Arata Gandolfo", "910", -18.4905, -70.301);
  const r = await ubicarDireccion("SANTIAGO ARATA 910");
  assert.equal(r.tipo, "exacta");
  assert.deepEqual([r.elegida?.fuente, r.elegida?.direccion], ["google", "Avenida Santiago Arata Gandolfo 910"]);
  assert.ok(consultas.some((c) => c.cual === "google" && c.q.startsWith("SANTIAGO ARATA 910")));
});

test("Google no se consulta si Mapbox ya dio la puerta, ni desde el servidor", async () => {
  globalThis.window = {};
  mapbox = () => ({ features: [puerta("Pudahuel 911", -18.47, -70.29)] });
  await ubicarDireccion("PUDAHUEL 911");
  assert.ok(!consultas.some((c) => c.cual === "google"));

  delete globalThis.window; // en el servidor no se usa Google
  consultas = [];
  mapbox = () => ({ features: [] });
  const r = await ubicarDireccion("CALLE SIN DATOS 912");
  assert.equal(r.tipo, "no_encontrada");
  assert.ok(!consultas.some((c) => c.cual === "google"));
});

test("una respuesta de Google en otra calle, otro número o fuera de Arica no se usa", async () => {
  globalThis.window = {};
  for (const respuesta of [
    resultadoGoogle("Avenida Diego Portales", "913", -18.48, -70.3),
    resultadoGoogle("Avenida Santiago Arata Gandolfo", "999", -18.49, -70.3),
    resultadoGoogle("Avenida Santiago Arata Gandolfo", "913", -33.45, -70.66),
  ]) {
    google = () => respuesta;
    const r = await ubicarDireccion("SANTIAGO ARATA 913");
    assert.notEqual(r.elegida?.fuente, "google");
  }
});

test("una cuadra de Google no reemplaza la cuadra de Mapbox; la puerta sí", async () => {
  globalThis.window = {};
  mapbox = () => ({
    features: [rasgo("address", "San Marcos 914", -18.47, -70.3, { street: "matched", address_number: "plausible" })],
  });
  google = () => resultadoGoogle("San Marcos", "914", -18.4701, -70.3001, "RANGE_INTERPOLATED");
  assert.equal((await ubicarDireccion("SAN MARCOS 914")).elegida?.fuente, "mapbox");
  google = () => resultadoGoogle("San Marcos", "914", -18.4702, -70.3002, "ROOFTOP");
  const r = await ubicarDireccion("SAN MARCOS 914");
  assert.deepEqual([r.tipo, r.elegida?.fuente], ["exacta", "google"]);
});
