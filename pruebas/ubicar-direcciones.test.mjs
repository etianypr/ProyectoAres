// Spec 016: que la dirección de la guía se ubique sola pese al tipeo.
//
// Los nombres de calle son reales (del catálogo de OpenStreetMap); los NÚMEROS
// son inventados: ninguna dirección de un destinatario entra al repo. Google y
// Nominatim se responden reemplazando el fetch global, como en
// asistencia-direcciones.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";

const { normalizarConsulta, coincidenciaCalle, distanciaEdicion } = await import(
  "@/lib/geo/geocoding/consulta"
);
const { callesParecidas, largoDeCalle } = await import("@/lib/geo/geocoding/calles");
const { ubicarDireccion } = await import("@/lib/geo/geocoding");
const { googleDirecto, olvidarConsultasGoogle } = await import("@/lib/geo/geocoding/google");

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
let osm = () => [];
let google = () => ({ status: "ZERO_RESULTS", results: [] });
let consultas = [];

test.before(() => {
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    // El teléfono pregunta a Google por /api/geocodificar: se hace lo mismo que
    // la ruta (googleDirecto con la clave del servidor).
    if (url === "/api/geocodificar") {
      const { direccion } = JSON.parse(opciones.body);
      const sugerencias = await googleDirecto(direccion, "clave-prueba");
      if (!sugerencias) return new Response("{}", { status: 502 });
      return new Response(JSON.stringify({ sugerencias }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const params = new URL(url).searchParams;
    const cual = url.includes("googleapis") ? "google" : "osm";
    const q = (params.get("q") ?? params.get("address") ?? "").replace(/, Arica, Chile$/, "");
    consultas.push({ cual, q });
    const cuerpo = cual === "google" ? google(q) : osm(q);
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
  delete globalThis.window;
});
test.beforeEach(() => {
  osm = () => [];
  google = () => ({ status: "ZERO_RESULTS", results: [] });
  consultas = [];
  olvidarConsultasGoogle();
  globalThis.window = {}; // Google se pregunta desde el teléfono
});

const resultadoGoogle = (calle, numero, lat, lng, location_type = "ROOFTOP") => ({
  status: "OK",
  results: [
    {
      place_id: `g-${calle}-${numero}`,
      address_components: [
        { long_name: numero, short_name: numero, types: ["street_number"] },
        { long_name: calle, short_name: calle, types: ["route"] },
      ],
      geometry: { location: { lat, lng }, location_type },
    },
  ],
});
const sinResultados = { status: "ZERO_RESULTS", results: [] };
const tramoOsm = (nombre, lat, lng, id) => ({
  osm_type: "way",
  osm_id: id,
  lat: String(lat),
  lon: String(lng),
  category: "highway",
  name: nombre,
  address: { road: nombre, city: "Arica" },
});

test("la puerta de Google con el nombre largo de la calle se acepta", async () => {
  // La avenida se llama de dos formas ("Alejandro Azolas" y "Avenida Alejandro
  // Azola", spec 016): la última palabra la tiene nuestra comparación de nombres.
  google = () => resultadoGoogle("Avenida Alejandro Azola", "901", -18.49, -70.29);
  const r = await ubicarDireccion("ALEJANDRO AZOLAS 901");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Avenida Alejandro Azola 901");
});

test("la puerta de OTRA calle se descarta", async () => {
  google = () => resultadoGoogle("Avenida Senador Humberto Palza Corvacho", "902", -18.5, -70.3);
  const r = await ubicarDireccion("Avenida Diego Portales 902");
  assert.equal(r.tipo, "no_encontrada");
});

test("con el nombre mal escrito se pregunta por el oficial y se encuentra la puerta", async () => {
  google = (q) => (q === "Braulio Muñoz 903" ? resultadoGoogle("Braulio Muñoz", "903", -18.47, -70.3) : sinResultados);
  const r = await ubicarDireccion("BRAULIO MUNIZ 903");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Braulio Muñoz 903");
  assert.ok(consultas.some((c) => c.cual === "google" && c.q === "Braulio Muñoz 903"));
});

test("un error de Google (clave, cupo, cobro) no se recuerda como 'no existe'", async () => {
  // Auditoría del día real (2026-11-10): con REQUEST_DENIED el teléfono guardaba
  // la lista vacía y no volvía a preguntar en toda la sesión.
  google = () => ({ status: "REQUEST_DENIED", results: [], error_message: "clave" });
  const caida = await ubicarDireccion("Braulio Muñoz 906");
  assert.notEqual(caida.tipo, "exacta");

  google = () => resultadoGoogle("Braulio Muñoz", "906", -18.47, -70.3);
  consultas = [];
  const r = await ubicarDireccion("Braulio Muñoz 906");
  assert.ok(consultas.some((c) => c.cual === "google"), "vuelve a preguntarle a Google");
  assert.equal(r.tipo, "exacta");
});

test("ZERO_RESULTS sí es una respuesta: no se vuelve a pagar la misma consulta", async () => {
  google = () => sinResultados;
  await ubicarDireccion("Braulio Muñoz 907");
  consultas = [];
  await ubicarDireccion("Braulio Muñoz 907");
  assert.ok(!consultas.some((c) => c.cual === "google"));
});

test("en una calle corta sin el número, la parada va a la calle con aviso", async () => {
  osm = () => [tramoOsm("Carlos Witting", -18.46, -70.29, 4)];
  const r = await ubicarDireccion("CARLOS WITTING 0904");
  assert.equal(r.tipo, "aproximada");
  assert.equal(r.elegida?.direccion, "Carlos Witting");
  assert.match(r.advertencia, /corta/);
});

test("en una calle larga sin el número no se elige, y la calle escrita va primero", async () => {
  osm = () => [tramoOsm("Santiago", -18.45, -70.3, 7), tramoOsm("Santiago Arata Gandolfo", -18.49, -70.3, 1)];
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
  google = (q) => {
    if (q === "Avenida Linderos Poniente 907") return resultadoGoogle("Avenida Linderos Poniente", "907", -18.4795, -70.3128);
    if (q === "Avenida Linderos Oriente 907") return resultadoGoogle("Avenida Linderos Oriente", "907", -18.4796, -70.3127);
    return sinResultados;
  };
  osm = () => [tramoOsm("Avenida Linderos Poniente", -18.48, -70.31, 8), tramoOsm("Avenida Linderos Oriente", -18.47, -70.28, 9)];
  const r = await ubicarDireccion("Linderos 907");
  assert.equal(r.tipo, "exacta");
  assert.ok(r.elegida);
});

// ---------------------------------------------------------------------------
// Google, el que da la puerta (spec 019; antes último recurso, spec 016)
// ---------------------------------------------------------------------------

test("con solo la calle en OSM, Google da la puerta y queda exacta", async () => {
  osm = () => [tramoOsm("Santiago Arata Gandolfo", -18.49, -70.3, 10)];
  google = () => resultadoGoogle("Avenida Santiago Arata Gandolfo", "910", -18.4905, -70.301);
  const r = await ubicarDireccion("SANTIAGO ARATA 910");
  assert.equal(r.tipo, "exacta");
  assert.deepEqual([r.elegida?.fuente, r.elegida?.direccion], ["google", "Avenida Santiago Arata Gandolfo 910"]);
  assert.ok(consultas.some((c) => c.cual === "google" && c.q === "SANTIAGO ARATA 910"));
});

test("Google no se consulta sin número, ni desde el servidor", async () => {
  await ubicarDireccion("PUDAHUEL");
  assert.ok(!consultas.some((c) => c.cual === "google"), "sin número no hay puerta que buscar");

  delete globalThis.window; // en el servidor no hay sesión de conductor
  consultas = [];
  const r = await ubicarDireccion("CALLE SIN DATOS 912");
  assert.equal(r.tipo, "no_encontrada");
  assert.ok(!consultas.some((c) => c.cual === "google"));
});

test("una respuesta de Google en otra calle, otro número o fuera de Arica no se usa", async () => {
  for (const respuesta of [
    resultadoGoogle("Avenida Diego Portales", "913", -18.48, -70.3),
    resultadoGoogle("Avenida Santiago Arata Gandolfo", "999", -18.49, -70.3),
    resultadoGoogle("Avenida Santiago Arata Gandolfo", "913", -33.45, -70.66),
  ]) {
    olvidarConsultasGoogle();
    google = () => respuesta;
    const r = await ubicarDireccion("SANTIAGO ARATA 913");
    assert.notEqual(r.elegida?.fuente, "google");
  }
});

test("la cuadra de Google entra con aviso; la puerta, sin aviso", async () => {
  google = () => resultadoGoogle("San Marcos", "914", -18.4701, -70.3001, "RANGE_INTERPOLATED");
  const cuadra = await ubicarDireccion("SAN MARCOS 914");
  assert.deepEqual([cuadra.tipo, cuadra.elegida?.fuente], ["aproximada", "google"]);
  assert.match(cuadra.advertencia, /cuadra/);

  olvidarConsultasGoogle();
  google = () => resultadoGoogle("San Marcos", "914", -18.4702, -70.3002, "ROOFTOP");
  const puerta = await ubicarDireccion("SAN MARCOS 914");
  assert.deepEqual([puerta.tipo, puerta.elegida?.fuente, puerta.advertencia], ["exacta", "google", null]);
});

test("lo ya preguntado a Google no se vuelve a pagar", async () => {
  google = () => resultadoGoogle("San Marcos", "915", -18.4702, -70.3002);
  await ubicarDireccion("SAN MARCOS 915");
  await ubicarDireccion("SAN MARCOS 915");
  assert.equal(consultas.filter((c) => c.cual === "google").length, 1);
});
