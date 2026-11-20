// Spec 044: las calles aprendidas (dueño, 2026-11-20). Cómo viene escrita → cómo se llama, sin
// número de casa. Calles reales del catálogo con números inventados (9xx).
import test from "node:test";
import assert from "node:assert/strict";

const { aprenderCalle, fijarAprendizaje, fijarCallesAprendidas, claveDeCalle } = await import("@/lib/geo/geocoding/aprendidas");
const { ubicarDireccion } = await import("@/lib/geo/geocoding");
const { googleDirecto, olvidarConsultasGoogle } = await import("@/lib/geo/geocoding/google");
const { olvidarConsultasNominatim } = await import("@/lib/geo/geocoding/nominatim");

let aprendidas = [];
test.beforeEach(() => {
  aprendidas = [];
  fijarCallesAprendidas([]);
  fijarAprendizaje((escrita, oficial, fuente) => void aprendidas.push({ escrita, oficial, fuente }));
});
test.after(() => fijarAprendizaje(null));

test("se aprende la calle escrita → oficial, sin el número y con la clave sin tildes", async () => {
  await aprenderCalle("ORIZOMBO BARBOZA", "Orozimbo Barbosa", "ia");
  assert.deepEqual(aprendidas, [{ escrita: "orizombo barboza", oficial: "Orozimbo Barbosa", fuente: "ia" }]);
  assert.equal(claveDeCalle("José Díaz  Gana"), "jose diaz gana");
});

test("no se aprende lo que cambiaría la calle de otras casas ni lo que no es un error de lectura", async () => {
  await aprenderCalle("LINDEROS", "Avenida Linderos Poniente", "google"); // dos avenidas
  await aprenderCalle("PASAJE 1", "Pasaje Uno", "conductor"); // genérico, en varios lugares
  await aprenderCalle("LA PAZ", "Avenida Diego Portales", "conductor"); // otra calle: se mudó
  await aprenderCalle("SANTIAGO ARATA 901", "Santiago Arata Gandolfo 901", "ia"); // con número de casa
  await aprenderCalle("Orozimbo Barbosa", "Orozimbo Barbosa", "google"); // ya es la oficial
  assert.deepEqual(aprendidas, []);
});

test("lo aprendido se usa al ubicar: se busca directo con el nombre oficial", async () => {
  const fetchOriginal = globalThis.fetch;
  const consultas = [];
  globalThis.window = {};
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    if (url === "/api/geocodificar") {
      const { direccion } = JSON.parse(opciones.body);
      const sugerencias = await googleDirecto(direccion, "clave-prueba");
      return new Response(JSON.stringify({ sugerencias }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const q = (new URL(url).searchParams.get("address") ?? new URL(url).searchParams.get("q") ?? "").replace(/, Arica, Chile$/, "");
    consultas.push(q);
    const puerta = /^Orozimbo Barbosa 9(5[0-9])$/.test(q)
      ? {
          status: "OK",
          results: [
            {
              place_id: `g-${q}`,
              address_components: [
                { long_name: q.split(" ").at(-1), short_name: q.split(" ").at(-1), types: ["street_number"] },
                { long_name: "Orozimbo Barbosa", short_name: "Orozimbo Barbosa", types: ["route"] },
              ],
              geometry: { location: { lat: -18.46, lng: -70.3 }, location_type: "ROOFTOP" },
            },
          ],
        }
      : { status: "ZERO_RESULTS", results: [] };
    return new Response(JSON.stringify(url.includes("googleapis") ? puerta : []), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    olvidarConsultasGoogle();
    olvidarConsultasNominatim();
    fijarCallesAprendidas([{ escrita: "orizombo bartolo", oficial: "Orozimbo Barbosa" }]);
    const r = await ubicarDireccion("ORIZOMBO BARTOLO 951");
    assert.equal(r.tipo, "exacta");
    assert.equal(r.elegida?.direccion, "Orozimbo Barbosa 951");
    assert.equal(consultas[0], "Orozimbo Barbosa 951", "la primera consulta ya va con el nombre aprendido");
  } finally {
    globalThis.fetch = fetchOriginal;
    delete globalThis.window;
  }
});
