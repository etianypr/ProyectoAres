// Spec 035: calles repetidas («Pasaje 1» en muchos lugares de Arica). La referencia de la guía
// elige el lugar de inmediato; sin ella, solo las opciones de la zona de la ruta.
// Calles y poblaciones reales del catálogo; números de casa inventados (9xx–14xx).
import { test } from "node:test";
import assert from "node:assert/strict";
import { separarReferencias, elegirConLaRuta } from "../src/lib/geo/geocoding/referencias.ts";
import { lugaresDeCalle, cruzaCon } from "../src/lib/geo/geocoding/lugares.ts";
import { nombrePoblacion, poblacionesDe, poblacionesEscritas } from "../src/lib/geo/geocoding/poblaciones.ts";

test("separarReferencias: la calle es la que va junto al número; lo demás es referencia", () => {
  const casos = [
    ["LINDEROS PROVIDENCI CALLE 2 901", "CALLE 2 901", "LINDEROS PROVIDENCI", []],
    ["PASAJE 1 1450 CON CALLE 5", "PASAJE 1 1450", "CON CALLE 5", ["CALLE 5"]],
    ["PJE 1 1450", "PJE 1 1450", "", []],
    ["AV SANTA MARIA 2150", "AV SANTA MARIA 2150", "", []],
    ["21 DE MAYO 500", "21 DE MAYO 500", "", []],
    ["CHACABUCO 500 DEPTO 3", "CHACABUCO 500 DEPTO 3", "", []],
    ["POB LINDEROS PASAJE 1 1450", "PASAJE 1 1450", "POB LINDEROS", []],
    ["PASAJE 1 1450 POB LINDEROS", "PASAJE 1 1450", "POB LINDEROS", []],
    ["TUCAPEL 1450 ESQ. CALLE 5 Y PASAJE 2", "TUCAPEL 1450", "ESQ. CALLE 5 Y PASAJE 2", ["CALLE 5", "PASAJE 2"]],
    ["LOS AROMOS 120 FRENTE A LA SEDE", "LOS AROMOS 120", "FRENTE A LA SEDE", []],
    ["CALLE 2 977 A", "CALLE 2 977 A", "", []],
  ];
  for (const [texto, consulta, referencia, cruces] of casos) {
    assert.deepEqual(separarReferencias(texto), { consulta, referencia, cruces }, texto);
  }
});

test("lugaresDeCalle: «Pasaje 1» está en varios lugares; «Pasaje 1 Norte» y una calle única no", async () => {
  const p1 = await lugaresDeCalle("Pasaje 1");
  assert.ok(p1.length >= 4, `Pasaje 1 en ${p1.length} lugares`);
  assert.ok(p1.every((l) => /^Pasaje (1|Uno)$/.test(l.nombre)));
  assert.equal((await lugaresDeCalle("pasaje uno")).length, p1.length, "«Uno» es «1»");
  assert.ok(!(await lugaresDeCalle("Pasaje 1 Norte")).some((l) => l.nombre === "Pasaje 1"));
  assert.deepEqual(await lugaresDeCalle("Chacabuco"), []);
});

test("cruzaCon: el lugar que cruza la calle escrita", async () => {
  const p1 = await lugaresDeCalle("Pasaje 1");
  const conCruce = p1.find((l) => l.cruces.length > 0);
  assert.ok(conCruce);
  assert.ok(cruzaCon(conCruce, conCruce.cruces[0].toUpperCase()));
  assert.ok(!cruzaCon(conCruce, "Avenida Inexistente Uno"));
});

test("poblaciones: el texto de la guía nombra su población; cada lugar sabe en cuál cae", async () => {
  assert.ok((await poblacionesEscritas("LINDEROS PROVIDENCI")).includes("LINDEROS"));
  assert.ok((await poblacionesEscritas("POB TUCAPEL")).some((n) => n.startsWith("TUCAPEL")), "sin el romano calzan todas las Tucapel");
  assert.deepEqual(await poblacionesEscritas("ARICA"), [], "«Arica» no nombra ninguna");
  const p1 = await lugaresDeCalle("Pasaje 1");
  const conPoblacion = (await Promise.all(p1.map((l) => poblacionesDe(l.muestras)))).filter((x) => x.length > 0);
  assert.ok(conPoblacion.length >= p1.length / 2, `${conPoblacion.length} de ${p1.length} con población`);
  assert.equal(nombrePoblacion("LINDEROS"), "Pob. Linderos");
  assert.equal(nombrePoblacion("CONJ HAB SANTA CLARA II"), "Conj. Hab. Santa Clara II");
  assert.equal(nombrePoblacion("VILLA ESPAÑA"), "Villa España");
});

const lugar = (id, lat, lng, sector, extra = {}) => ({
  id, direccion: "Pasaje 1", detalle: `Pob. X · ${sector}`, lat, lng, soloCalle: true, confianza: "aproximada",
  coincideNumero: null, fuente: "osm", sector, poblacion: "X", ...extra,
});
// Puntos reales de dos sectores: Sur (-18.50, -70.29) y Norte (-18.43, -70.29).
const SUR = lugar("sur", -18.5005, -70.2974, "Sur");
const NORTE = lugar("norte", -18.431, -70.2902, "Norte");
const AMBIGUA = { tipo: "ambigua", candidatos: [NORTE, SUR], elegida: null, advertencia: "x" };
const RUTA_SUR = [{ lat: -18.495, lat2: 0, lng: -70.29 }, { lat: -18.49, lng: -70.295 }, { lat: -18.498, lng: -70.3 }];

test("elegirConLaRuta: un solo lugar en los sectores de la ruta se elige sin preguntar", () => {
  const r = elegirConLaRuta(AMBIGUA, RUTA_SUR);
  assert.equal(r.elegida?.id, "sur");
  assert.equal(r.tipo, "aproximada");
  assert.match(r.advertencia, /Único Pasaje 1 en los sectores de la ruta/);
});

test("elegirConLaRuta: el de otro sector no se ofrece; ninguno en la zona → todos por cercanía", () => {
  const SUR2 = lugar("sur2", -18.4935, -70.3036, "Sur");
  const r = elegirConLaRuta({ ...AMBIGUA, candidatos: [NORTE, SUR, SUR2] }, RUTA_SUR);
  assert.equal(r.elegida, null);
  assert.deepEqual(r.candidatos.map((c) => c.id).sort(), ["sur", "sur2"]);
  const lejos = [{ lat: -18.47, lng: -70.25 }, { lat: -18.471, lng: -70.251 }, { lat: -18.472, lng: -70.252 }];
  const todos = elegirConLaRuta(AMBIGUA, lejos);
  assert.equal(todos.candidatos.length, 2);
});

test("elegirConLaRuta: lo que calzó con la referencia manda; sin ruta todavía no filtra", () => {
  const r = elegirConLaRuta({ ...AMBIGUA, candidatos: [{ ...NORTE, calza: true }, SUR, { ...lugar("n2", -18.4296, -70.2914, "Norte"), calza: true }] }, RUTA_SUR);
  assert.deepEqual(r.candidatos.map((c) => c.id).sort(), ["n2", "norte"], "las que calzan, aunque estén en otro sector");
  assert.equal(elegirConLaRuta(AMBIGUA, RUTA_SUR.slice(0, 2)), AMBIGUA);
});

// ---- ubicarDireccion con los buscadores simulados (sin red ni cuota) ----
const { ubicarDireccion } = await import("@/lib/geo/geocoding");
const { olvidarConsultasGoogle, googleDirecto } = await import("@/lib/geo/geocoding/google");
const { olvidarConsultasNominatim } = await import("@/lib/geo/geocoding/nominatim");
// OSM se recuerda durante el día (spec 038): cada prueba parte sin lo de la anterior.
test.beforeEach(() => olvidarConsultasNominatim());
let consultasGoogle = 0;
const fetchOriginal = globalThis.fetch;
test.before(() => {
  globalThis.window = {};
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    if (url === "/api/geocodificar") {
      const { direccion } = JSON.parse(opciones.body);
      return new Response(JSON.stringify({ sugerencias: await googleDirecto(direccion, "clave-prueba") }), { status: 200 });
    }
    if (url.includes("googleapis")) {
      consultasGoogle++;
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
  delete globalThis.window;
});

test("la referencia de la guía elige el lugar de inmediato, con una sola consulta a Google", async () => {
  olvidarConsultasGoogle();
  consultasGoogle = 0;
  // Providencia cruza a uno solo de los «Calle 2» (Flor del Inca y Agro Linderos, sector Norte).
  const r = await ubicarDireccion("LINDEROS PROVIDENCI CALLE 2 977");
  assert.ok(r.elegida, r.advertencia);
  assert.equal(r.elegida.sector, "Norte");
  assert.match(r.elegida.detalle, /Flor del Inca/);
  assert.match(r.advertencia, /Ubicado por la referencia de la guía/);
  assert.ok(consultasGoogle <= 1, "ninguna consulta de más a Google");
});

test("«con» una calle que cruza también elige; sin referencia queda en duda con cada población", async () => {
  const conCruce = await ubicarDireccion("PASAJE 1 1452 CON TOBALABA");
  assert.match(conCruce.elegida?.detalle ?? "", /Tucapel IX/);
  const sola = await ubicarDireccion("PASAJE 1 1453");
  assert.equal(sola.tipo, "ambigua", "ya no cae en «solo la calle»");
  assert.equal(sola.elegida, null);
  assert.ok(sola.candidatos.length >= 4);
  assert.ok(sola.candidatos.every((c) => c.sector && c.detalle));
});

test("lugarSupuesto: el aviso dos paradas antes dice adónde va y cuántos lugares más hay", async () => {
  const { lugarSupuesto, lugarProvisorio } = await import("@/lib/encomiendas/problemas");
  const r = await ubicarDireccion("PASAJE 1 1454");
  const { punto, problema } = lugarProvisorio(r);
  assert.ok(problema.opciones.every((o) => o.sector), "las opciones guardan su sector y población");
  const texto = lugarSupuesto({ ...punto, problemas: [problema] });
  assert.match(texto, /^Va a .+ · (Norte|Sur); hay \d+ lugares más$/);
  assert.equal(lugarSupuesto({ lat: 1, lng: 1, problemas: [] }), null);
});
