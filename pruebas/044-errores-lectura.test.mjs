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

test("la palabra repetida seguida queda una vez, salvo en las calles que la repiten (2026-11-20)", () => {
  assert.equal(corregirLectura("CALLE CABRERO CABRERO 942"), "CALLE CABRERO 942");
  assert.equal(corregirLectura("Calle Cabrero cabrero 942"), "Calle Cabrero 942");
  assert.equal(corregirLectura("SANTIAGO ARATA SANTIAGO ARATA 943"), "SANTIAGO ARATA 943");
  for (const t of ["PASAJE COLO COLO 944", "LLAY LLAY 945", "LUIS URZUA URZUA 946", "RIO CALLE CALLE 947", "LA LA 948"]) {
    assert.equal(corregirLectura(t), t, t);
  }
});

test("las calles del catálogo con una palabra repetida están todas en REPETIDAS_EN_CALLES", async () => {
  const { CALLES_ARICA } = await import("@/lib/geo/geocoding/calles-arica");
  const { REPETIDAS_EN_CALLES } = await import("@/lib/geo/geocoding/errores-lectura");
  const comparable = (p) => p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const repetidas = new Set();
  for (const fila of CALLES_ARICA.split("\n").filter(Boolean)) {
    const [nombre, , otros] = fila.split("|");
    for (const n of [nombre, ...(otros ? otros.split(";") : [])]) {
      const ps = n.split(/\s+/).map(comparable);
      ps.forEach((p, i) => p.length >= 3 && p === ps[i + 1] && repetidas.add(p));
    }
  }
  for (const p of repetidas) assert.ok(REPETIDAS_EN_CALLES.has(p), `«${p}» se repite en una calle: agrégala`);
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

test("holgada: muchas palabras iguales y una con dos letras cambiadas calzan; las calles distintas no (2026-11-20)", async () => {
  const { coincidenciaHolgada, esLaCalleParecida } = await import("@/lib/geo/geocoding/consulta");
  assert.equal(coincidenciaCalle("ORIZOMBO BARBOZA", "Orozimbo Barbosa"), null, "con la estricta no calza");
  assert.ok(coincidenciaHolgada("ORIZOMBO BARBOZA", "Orozimbo Barbosa"));
  assert.ok(esLaCalleParecida("ORIZOMBO BARBOZA", "Orozimbo Barbosa"));
  // No se cuelan calles distintas.
  assert.equal(coincidenciaHolgada("LINDEROS PONIENTE", "Avenida Linderos Oriente"), null, "oriente y poniente no se corrigen");
  assert.equal(coincidenciaHolgada("SAN MARCOS", "San Martín"), null);
  assert.equal(coincidenciaHolgada("JOSE MIGUEL CARRERA", "José Manuel Carrera"), null);
  assert.equal(coincidenciaHolgada("ORIZOMBO", "Orozimbo Barbosa"), null, "una palabra sola va con la estricta");
  assert.equal(coincidenciaHolgada("ORIZOMBO BARTOLO", "Orozimbo Barbosa"), null, "la mitad tiene que calzar estricta");
  assert.equal(esLaCalleParecida("Avenida Diego Portales", "Avenida Senador Humberto Palza Corvacho"), false);
});

test("el catálogo da la calle con la holgada solo si ninguna calza estricta", async () => {
  const { callesSimilares } = await import("@/lib/geo/geocoding/calles");
  assert.deepEqual((await callesSimilares("ORIZOMBO BARBOZA")).map((c) => c.nombre), ["Orozimbo Barbosa"]);
  assert.deepEqual((await callesSimilares("BRAULIO MUNIZ")).map((c) => c.nombre), ["Braulio Muñoz"], "la estricta, como siempre");
  assert.deepEqual(await callesSimilares("PASAJE QWERTY ZXCVB"), []);
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

test("el sector tras el número de casa es referencia: se busca la calle con su número (2026-11-20)", () => {
  assert.deepEqual(separarReferencias("DAVID GIRVAN 937 CHINCHORRO ALTO"), {
    consulta: "DAVID GIRVAN 937",
    referencia: "CHINCHORRO ALTO",
    cruces: [],
  });
  // Lo que es del timbre, la ciudad y el número de un nombre se quedan como estaban.
  for (const texto of ["CHACABUCO 500 DEPTO 3", "SANTIAGO ARATA 938 SEGUNDO PISO", "LA PAZ 939 CASA", "PASAJE 1 NORTE", "CALLE 2 977 A", "LA PAZ 940 ARICA", "SAN MARCOS 100 B"]) {
    assert.equal(separarReferencias(texto).consulta, texto, texto);
  }
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

test("«DAVID GIRVAN 941 CHINCHORRO ALTO» le pregunta a Google por la calle con su número y se ubica de una", async () => {
  google = (q) => (q === "DAVID GIRVAN 941" ? puerta("David Girban", "941", -18.45, -70.29) : sinResultados);
  const r = await ubicarDireccion("DAVID GIRVAN 941 CHINCHORRO ALTO");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "David Girban 941");
});

test("«ORIZOMBO BARBOZA 942»: Google confirma la puerta en «Orozimbo Barbosa» y se ubica de una", async () => {
  // Google contesta la puerta con el nombre oficial, pregunte como pregunte.
  google = (q) => (/9(42)$/.test(q) && /barbo[sz]a/i.test(q) ? puerta("Orozimbo Barbosa", "942", -18.46, -70.3) : sinResultados);
  const r = await ubicarDireccion("ORIZOMBO BARBOZA 942");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Orozimbo Barbosa 942");
  // Con otro número en la puerta de Google, no: el número tiene que ser el escrito.
  olvidarConsultasGoogle();
  google = () => puerta("Orozimbo Barbosa", "999", -18.46, -70.3);
  assert.notEqual((await ubicarDireccion("ORIZOMBO BARBOZA 943")).tipo, "exacta");
});

test("la calle sola de Google trae su nombre: con él y el número se encuentra la puerta (2026-11-20)", async () => {
  const soloRuta = (calle) => ({
    status: "OK",
    results: [
      {
        place_id: `g-${calle}`,
        address_components: [{ long_name: calle, short_name: calle, types: ["route"] }],
        geometry: { location: { lat: -18.45, lng: -70.29 }, location_type: "GEOMETRIC_CENTER" },
      },
    ],
  });
  // Google conoce la calle como «Alvares»: con «alvarez» da solo la calle; con su nombre, la puerta.
  google = (q) => (q === "Francisco Alvares Romero 944" ? puerta("Francisco Alvares Romero", "944", -18.45, -70.29) : /alvarez/i.test(q) ? soloRuta("Francisco Alvares Romero") : sinResultados);
  const r = await ubicarDireccion("chile, pasaje francisco alvarez romero no 944");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Francisco Alvares Romero 944");
  // Al escribir, las sugerencias de Google siguen siendo solo puertas.
  const { sugerirDirecciones } = await import("@/lib/geo/geocoding/sugerir");
  olvidarConsultasGoogle();
  google = () => soloRuta("Francisco Alvares Romero");
  assert.deepEqual(await sugerirDirecciones("pasaje francisco alvarez romero 945"), []);
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
