// Spec 044: los errores de lectura de la cámara en la nómina no llegan a los buscadores.
//
// Calles reales del catálogo de OpenStreetMap con números inventados (9xx): ninguna dirección
// de un destinatario entra al repo. Google y Nominatim se responden reemplazando el fetch
// global, como en ubicar-direcciones.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";

const { corregirLectura } = await import("@/lib/geo/geocoding/errores-lectura");
const { normalizarConsulta, coincidenciaCalle } = await import("@/lib/geo/geocoding/consulta");
const { callesParecidas, corregirConCatalogo } = await import("@/lib/geo/geocoding/calles");
const { separarReferencias } = await import("@/lib/geo/geocoding/referencias");
const { ubicarDireccion, consultaOsmDe } = await import("@/lib/geo/geocoding");
const { googleDirecto, olvidarConsultasGoogle } = await import("@/lib/geo/geocoding/google");
const { olvidarConsultasNominatim } = await import("@/lib/geo/geocoding/nominatim");
const { limpiarDestino } = await import("@/lib/encomiendas/lectura/guia");

test("la O leída como 0 y la I leída como 1 vuelven a ser letras", () => {
  assert.equal(corregirLectura("SANTIAG0 ARATA 901"), "SANTIAGO ARATA 901");
  assert.equal(corregirLectura("OR0ZIMB0 BARBOSA 902"), "OROZIMBO BARBOSA 902");
  assert.equal(corregirLectura("1SLA DESOLACION 903"), "ISLA DESOLACION 903");
  assert.equal(corregirLectura("CUATRO 0TE 904 CASA"), "CUATRO OTE 904 CASA");
  assert.equal(corregirLectura("Avenida Raul Pey Casad0 905"), "Avenida Raul Pey Casado 905");
});

test("signos sueltos y números pegados se separan", () => {
  assert.equal(corregirLectura("DAVID GIRVAN 906 ARICA |Des"), "DAVID GIRVAN 906 ARICA Des");
  assert.equal(
    corregirLectura("BOGOTA N907DEPTO 318CONDOMINIO PARQUE SOCOROMA"),
    "BOGOTA 907 DEPTO 318 CONDOMINIO PARQUE SOCOROMA",
  );
});

test("lo que de verdad es un número no se toca", () => {
  for (const t of ["EL CANELO 0941", "PASAJE 1 NORTE 908", "21 DE MAYO 500", "CALLE 2 977 A", "1ER PISO", "PASAJE1 909", "SAN MARCOS 100B"]) {
    assert.equal(corregirLectura(t), t, t);
  }
});

test("la consulta deja la calle y el número de casa, sin depto ni ciudad", () => {
  const casos = [
    ["NUEVA CALEDONIA 910 15", "NUEVA CALEDONIA 910"],
    ["SANTIAG0 ARATA 911 47", "SANTIAGO ARATA 911"],
    ["SANTIAG0 ARATA 911 DP 51", "SANTIAGO ARATA 911"],
    ["AV PARIS 912 64", "avenida PARIS 912"],
    ["SANTIAG0 CANALES 913 SEGUNDO PISO", "SANTIAGO CANALES 913"],
    ["DAVID GIRVAN 914 ARICA |Des", "DAVID GIRVAN 914"],
    ["TRES ORIENTE 915 ARICA ARICA Y PARINACOTA", "TRES ORIENTE 915"],
    ["CUATRO 0TE 916 CASA", "CUATRO oriente 916"],
    ["BOGOTA N917DEPTO 318CONDOMINIO PARQUE SOCOROMA", "BOGOTA 917"],
    ["PARIS MOSA 918 18H", "PARIS MOSA 918"],
    // El número es parte del nombre: no es un depto.
    ["PASAJE 5 919", "PASAJE 5 919"],
    ["CALLE 2 977", "CALLE 2 977"],
  ];
  for (const [texto, consulta] of casos) assert.equal(normalizarConsulta(texto), consulta, texto);
});

test("una letra mal leída en una palabra de cuatro se acepta solo con otras dos que calzan", () => {
  assert.equal(coincidenciaCalle("Jose Dlaz Gana", "José Díaz Gana")?.ediciones, 1);
  assert.ok(coincidenciaCalle("Rauy Pey Casado", "Avenida Ingeniero Raúl Pey Casado"));
  assert.equal(coincidenciaCalle("Dlaz", "José Díaz Gana"), null, "sola, la palabra corta va exacta");
  assert.equal(coincidenciaCalle("Lebo", "Lebu"), null);
  assert.equal(coincidenciaCalle("Pasaje Lima", "Pasaje Lira"), null);
});

test("el catálogo da el nombre oficial de lo mal leído", async () => {
  assert.equal((await callesParecidas("JOSE DLAZ GANA"))[0]?.nombre, "José Díaz Gana");
  assert.equal((await callesParecidas("RAUY PEY CASADO"))[0]?.nombre, "Avenida Ingeniero Raúl Pey Casado");
  assert.equal((await callesParecidas("OROZIMBO BARBOZA"))[0]?.nombre, "Orozimbo Barbosa");
  assert.equal((await callesParecidas("SIMOM MOLINARES"))[0]?.nombre, "Pasaje Simón Molinares");
});

test("la palabra partida por el renglón se une; dos palabras de verdad, no", async () => {
  assert.equal(await corregirConCatalogo("SIMOM MOL INARES 920"), "SIMOM MOLINARES 920");
  assert.equal(await corregirConCatalogo("Calle Nac imiento 921"), "Calle Nacimiento 921");
  assert.equal(await corregirConCatalogo("EL ROBLE 922"), "EL ROBLE 922");
  assert.equal(await corregirConCatalogo("LA PAZ 923"), "LA PAZ 923");
});

test("un código que no es palabra de ninguna calle, antes del número, es el depto", async () => {
  assert.equal(await corregirConCatalogo("PORTAL EL ALWA ODK 97"), "PORTAL EL ALWA");
  assert.equal(await corregirConCatalogo("INGENIERO RAUL PEY 924"), "INGENIERO RAUL PEY 924");
  assert.equal(await corregirConCatalogo("CALLE XQZ 12"), "CALLE XQZ 12", "sin otra palabra, no se corta");
});

test("«X con Y número»: la casa está en la calle del número y la otra es la esquina", () => {
  assert.deepEqual(separarReferencias("CANCHA RAYADA CON BUENA ESPERANZA 925 CASA"), {
    consulta: "BUENA ESPERANZA 925 CASA",
    referencia: "CON CANCHA RAYADA",
    cruces: ["CANCHA RAYADA"],
  });
});

test("el destino leído de la nómina se ve sin los errores, con el depto", () => {
  assert.equal(limpiarDestino("SANTIAG0 ARATA 926 47"), "SANTIAGO ARATA 926 47");
  assert.equal(limpiarDestino("1SLA DESOLACION 927 ."), "ISLA DESOLACION 927");
});

// ---------------------------------------------------------------------------
// La cadena entera, con proveedores simulados
// ---------------------------------------------------------------------------

const fetchOriginal = globalThis.fetch;
let osm = () => [];
let google = () => ({ status: "ZERO_RESULTS", results: [] });
let consultas = [];

test.before(() => {
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
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
  olvidarConsultasNominatim();
  globalThis.window = {};
});

const puerta = (calle, numero, lat, lng) => ({
  status: "OK",
  results: [
    {
      place_id: `g-${calle}-${numero}`,
      address_components: [
        { long_name: numero, short_name: numero, types: ["street_number"] },
        { long_name: calle, short_name: calle, types: ["route"] },
      ],
      geometry: { location: { lat, lng }, location_type: "ROOFTOP" },
    },
  ],
});
const sinResultados = { status: "ZERO_RESULTS", results: [] };

test("«SANTIAG0 ARATA 930 71» se ubica de una, con la casa y no el depto", async () => {
  google = (q) => (/^santiago arata( gandolfo)? 930$/i.test(q) ? puerta("Santiago Arata Gandolfo", "930", -18.46, -70.29) : sinResultados);
  const r = await ubicarDireccion("SANTIAG0 ARATA 930 71");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Santiago Arata Gandolfo 930");
  assert.ok(!consultas.some((c) => /\b71\b/.test(c.q)), "el depto no se busca");
});

test("«DAVID GIRVAN 931 ARICA |Des» le pregunta a Google y se ubica de una", async () => {
  google = (q) => (q === "DAVID GIRVAN 931" ? puerta("David Girban", "931", -18.45, -70.29) : sinResultados);
  const r = await ubicarDireccion("DAVID GIRVAN 931 ARICA |Des");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "David Girban 931");
});

test("«Calle Jose Dlaz Gana 932»: la puerta de Google con el nombre bien escrito se acepta", async () => {
  google = (q) => (/d[ií]az gana 932$/i.test(q) ? puerta("José Díaz Gana", "932", -18.47, -70.3) : sinResultados);
  const r = await ubicarDireccion("Calle Jose Dlaz Gana 932");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "José Díaz Gana 932");
});

test("«PORTAL EL ALWA ODK 97» se busca sin el depto, y el adelanto pregunta lo mismo", async () => {
  await ubicarDireccion("PORTAL EL ALWA 0DK 97");
  const deOsm = consultas.filter((c) => c.cual === "osm").map((c) => c.q);
  assert.equal(deOsm[0], "PORTAL EL ALWA");
  assert.equal(await consultaOsmDe("PORTAL EL ALWA 0DK 97"), "PORTAL EL ALWA");
});
