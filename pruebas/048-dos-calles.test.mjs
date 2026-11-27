// Spec 048: con dos calles en la dirección («X CON Y 2480») vale la que tiene ese número. Calles
// reales de Arica con números inventados; Google y OpenStreetMap simulados reemplazando el fetch
// global: sin red ni cuota.
import test from "node:test";
import assert from "node:assert/strict";
import { otraCalleConElNumero } from "@/lib/geo/geocoding/referencias";
import { decidirDosCalles } from "@/lib/geo/geocoding/dos-calles";
import { ubicarDireccion } from "@/lib/geo/geocoding";
import { olvidarConsultasGoogle, googleDirecto } from "@/lib/geo/geocoding/google";
import { olvidarConsultasNominatim } from "@/lib/geo/geocoding/nominatim";

// Google y OpenStreetMap simulados para ubicarDireccion, puestos antes de cualquier prueba.

/** Qué calles tienen la puerta, por una palabra de su nombre: dónde queda. */
let existen = {};
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
      // Google contesta con la calle como se le preguntó, si «existe».
      const pedida = new URL(url).searchParams.get("address").split(",")[0];
      const numero = pedida.match(/(\d+)\s*$/)?.[1];
      const calle = pedida.replace(/\s*\d+\s*$/, "");
      const lugar = Object.entries(existen).find(([palabra]) => calle.toLowerCase().includes(palabra));
      if (!lugar || !numero) return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });
      const [lat, lng] = lugar[1];
      const resultado = {
        place_id: `p-${calle}-${numero}`,
        address_components: [
          { long_name: numero, short_name: numero, types: ["street_number"] },
          { long_name: calle, short_name: calle, types: ["route"] },
        ],
        geometry: { location: { lat, lng }, location_type: "ROOFTOP" },
      };
      return new Response(JSON.stringify({ status: "OK", results: [resultado] }), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
});
test.beforeEach(() => {
  olvidarConsultasGoogle();
  olvidarConsultasNominatim();
  consultasGoogle = 0;
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
  delete globalThis.window;
});


test("otraCalleConElNumero: la calle que cruza, con el mismo número", () => {
  assert.equal(otraCalleConElNumero("LINDEROS CON NEGHME 2480"), "LINDEROS 2480");
  assert.equal(otraCalleConElNumero("NEGHME 2480 CON LINDEROS"), "LINDEROS 2480");
  assert.equal(otraCalleConElNumero("NEGHME 2480 ESQUINA LINDEROS"), "LINDEROS 2480");
  // Sin calle que cruce, con dos (entre), sin número o con la población antes: nada que comparar.
  assert.equal(otraCalleConElNumero("NEGHME 2480"), null);
  assert.equal(otraCalleConElNumero("NEGHME 2480 ENTRE LINDEROS Y TUCAPEL"), null);
  assert.equal(otraCalleConElNumero("LINDEROS CON NEGHME"), null);
  assert.equal(otraCalleConElNumero("LINDEROS PROVIDENCI CALLE 2 977"), null);
});

const puerta = (direccion, lat, lng, confianza = "exacta") => ({
  id: `google:${direccion}`,
  direccion,
  detalle: "Arica",
  lat,
  lng,
  soloCalle: false,
  confianza,
  coincideNumero: true,
  fuente: "google",
});
const calleSola = (direccion, lat, lng) => ({ ...puerta(direccion, lat, lng, "aproximada"), soloCalle: true, coincideNumero: null });
const sinPuerta = { tipo: "solo_calle", candidatos: [calleSola("Neghme", -18.47, -70.29)], elegida: null, advertencia: "…" };
const conPuerta = (p) => ({ tipo: "exacta", candidatos: [p], elegida: p, advertencia: null });

test("decidirDosCalles: solo la otra tiene el número → esa", () => {
  const otra = puerta("Linderos 2480", -18.46, -70.3);
  const r = decidirDosCalles(sinPuerta, [otra]);
  assert.equal(r.elegida, otra);
  assert.equal(r.tipo, "exacta");
  assert.match(r.advertencia, /La casa está en Linderos 2480/);
  const cuadra = decidirDosCalles(sinPuerta, [puerta("Linderos 2480", -18.46, -70.3, "aproximada")]);
  assert.equal(cuadra.tipo, "aproximada", "la cuadra sigue siendo dudosa: la revisa la IA");
});

test("decidirDosCalles: las dos lejos → elige el conductor; juntas o solo la del número → la del número", () => {
  const propia = puerta("Neghme 2480", -18.47, -70.29);
  const lejos = decidirDosCalles(conPuerta(propia), [puerta("Linderos 2480", -18.44, -70.3)]);
  assert.equal(lejos.tipo, "ambigua");
  assert.equal(lejos.elegida, null);
  assert.deepEqual(lejos.candidatos.slice(0, 2).map((c) => c.direccion), ["Neghme 2480", "Linderos 2480"]);
  assert.match(lejos.advertencia, /Neghme y Linderos tienen el 2480\. Elige cuál es\./);
  assert.equal(decidirDosCalles(conPuerta(propia), [puerta("Linderos 2480", -18.4705, -70.2905)]), null, "la casa de la esquina");
  assert.equal(decidirDosCalles(conPuerta(propia), []), null);
  assert.equal(decidirDosCalles(conPuerta(propia), null), null);
  assert.equal(decidirDosCalles(sinPuerta, [calleSola("Linderos", -18.46, -70.3)]), null, "la otra sin el número no sirve");
});

test("ubicarDireccion: el número no es de la calle junto a él → vale la otra", async () => {
  existen = { sotomayor: [-18.4795, -70.3155] };
  const r = await ubicarDireccion("SOTOMAYOR CON BAQUEDANO 2480");
  assert.match(r.elegida?.direccion ?? "", /Sotomayor 2480/i, r.advertencia);
  assert.equal(r.tipo, "exacta");
});

test("ubicarDireccion: las dos tienen el número y lejos → elige el conductor", async () => {
  existen = { sotomayor: [-18.4795, -70.3155], baquedano: [-18.45, -70.29] };
  const r = await ubicarDireccion("SOTOMAYOR CON BAQUEDANO 2481");
  assert.equal(r.tipo, "ambigua");
  assert.equal(r.elegida, null);
  assert.match(r.advertencia, /Elige cuál es/);
  assert.ok(r.candidatos.some((c) => /Sotomayor/i.test(c.direccion)) && r.candidatos.some((c) => /Baquedano/i.test(c.direccion)));
});

test("ubicarDireccion: solo la calle del número lo tiene → como antes, con una sola consulta de más", async () => {
  existen = { baquedano: [-18.4801, -70.3149] };
  const r = await ubicarDireccion("SOTOMAYOR CON BAQUEDANO 2482");
  assert.match(r.elegida?.direccion ?? "", /Baquedano 2482/i);
  const conCruce = consultasGoogle;
  olvidarConsultasGoogle();
  consultasGoogle = 0;
  await ubicarDireccion("BAQUEDANO 2483");
  assert.ok(conCruce - consultasGoogle <= 1, `con la calle que cruza, ${conCruce} consultas; sin ella, ${consultasGoogle}`);
});
