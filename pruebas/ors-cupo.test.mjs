// Spec 024: sin cupo de OpenRouteService no es «Sin señal».
//
// En la prueba del 2026-11-07 ORS contestó 403 «Quota exceeded» a los trazados; esa
// respuesta llega sin CORS, el navegador la ve como un corte de red y la app decía
// «Sin señal». Ahora un corte con la red andando (ARES contesta) se toma como cupo,
// y se cuenta cuántas consultas salen al día. ORS y ARES se responden con un doble
// del fetch global.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { consultasOrsDeHoy, postOrs, ultimaFallaOrs } from "@/lib/geo/ors/cliente";
import { avisoSinTrazado, calcularRutaLocal } from "@/lib/encomiendas/local/generar-ruta";
import { guardarPedido } from "@/lib/encomiendas/local/almacen";
import { olvidarMatriz } from "@/lib/geo/matriz";

// Estas pruebas cuidan el camino de respaldo, el de OpenRouteService: la red de
// calles propia (spec 031) va apagada, como cuando se elige en Diagnóstico.
import { apagarRed } from "@/lib/geo/red/grafo";
apagarRed(true);

const fetchOriginal = globalThis.fetch;
const localStorageOriginal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const locationOriginal = Object.getOwnPropertyDescriptor(globalThis, "location");

/** Un localStorage en memoria y un `location` de navegador, para el contador y
 *  para preguntarle a ARES si hay red. */
function comoNavegador(t) {
  const datos = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) },
  });
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://ares.prueba/conductor") });
  process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";
  t.after(() => {
    globalThis.fetch = fetchOriginal;
    if (localStorageOriginal) Object.defineProperty(globalThis, "localStorage", localStorageOriginal);
    else delete globalThis.localStorage;
    if (locationOriginal) Object.defineProperty(globalThis, "location", locationOriginal);
    else delete globalThis.location;
  });
}

/** ORS responde `ors`; ARES (/api) contesta 405 si `hayRed`, o no hay red. */
function instalar({ ors, hayRed }) {
  const pedidos = [];
  globalThis.fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    pedidos.push({ url, metodo: init?.method });
    if (url.startsWith("/api/")) {
      if (!hayRed) throw new TypeError("Failed to fetch");
      return new Response(null, { status: 405 });
    }
    return ors(url, init);
  };
  return pedidos;
}

test("429 y 403 de ORS son cupo", async (t) => {
  comoNavegador(t);
  for (const status of [429, 403]) {
    instalar({ ors: () => new Response("Quota exceeded", { status }), hayRed: true });
    assert.deepEqual(await postOrs("/v2/directions/driving-car/geojson", {}, 1000), { cupo: true });
    assert.equal(ultimaFallaOrs(), "cupo");
  }
});

test("un corte con la red andando es cupo; sin red, «Sin señal»", async (t) => {
  comoNavegador(t);
  const bloqueado = () => {
    throw new TypeError("Failed to fetch");
  };
  const conRed = instalar({ ors: bloqueado, hayRed: true });
  assert.equal(await postOrs("/v2/directions/driving-car/geojson", {}, 1000), null);
  assert.equal(ultimaFallaOrs(), "cupo");
  // A ARES se le pregunta sin datos: un HEAD, nada más.
  const aAres = conRed.filter((p) => p.url.startsWith("/api/"));
  assert.deepEqual(aAres, [{ url: "/api/geocodificar", metodo: "HEAD" }]);

  instalar({ ors: bloqueado, hayRed: false });
  assert.equal(await postOrs("/v2/directions/driving-car/geojson", {}, 1000), null);
  assert.equal(ultimaFallaOrs(), "sin_senal");

  instalar({ ors: () => Response.json({ ok: true }), hayRed: true });
  assert.ok(await postOrs("/v2/directions/driving-car/geojson", {}, 1000));
  assert.equal(ultimaFallaOrs(), null, "una que llega borra la falla");
});

test("se cuentan las consultas del día, matrices y trazados por separado", async (t) => {
  comoNavegador(t);
  instalar({ ors: () => Response.json({}), hayRed: true });
  const antes = consultasOrsDeHoy();
  await postOrs("/v2/matrix/driving-car", {}, 1000);
  await postOrs("/v2/directions/driving-car/geojson", {}, 1000);
  await postOrs("/v2/directions/driving-car/geojson", {}, 1000);
  const despues = consultasOrsDeHoy();
  assert.equal(despues.matriz - antes.matriz, 1);
  assert.equal(despues.trazado - antes.trazado, 2);
});

test("el aviso de la propuesta dice cupo o sin señal según el motivo", () => {
  assert.match(avisoSinTrazado("cupo"), /cupo gratis de hoy/);
  assert.match(avisoSinTrazado("sin_senal"), /no hay señal/);
  assert.match(avisoSinTrazado(null), /no hay señal/);
  assert.doesNotMatch(avisoSinTrazado("error"), /señal|cupo/);
});

test("calcularRutaLocal: matriz que llega y trazado bloqueado → la propuesta dice cupo", async (t) => {
  comoNavegador(t);
  olvidarMatriz();
  instalar({
    hayRed: true,
    ors: (url, init) => {
      if (url.includes("/v2/directions")) throw new TypeError("Failed to fetch");
      const cuerpo = JSON.parse(init.body);
      const filas = cuerpo.sources.map((i) => cuerpo.destinations.map((j) => (i === j ? 0 : 500 + 10 * (i + j))));
      return Response.json({ distances: filas, durations: filas.map((f) => f.map((m) => m / 8)) });
    },
  });
  const fecha = "2026-08-22";
  for (const n of [1, 2]) {
    await guardarPedido(
      { nombre: `Cliente ${n}`, telefono: "+56912340000", direccion: `Calle ${n} 100, Arica`, lat: -18.48 - n * 0.004, lng: -70.3, notas: null },
      fecha,
    );
  }
  const propuesta = await calcularRutaLocal(fecha, { tipo: "gps", lat: -18.4783, lng: -70.2979 });
  assert.equal(propuesta.sinTrazado, true);
  assert.equal(propuesta.motivoSinTrazado, "cupo");
  assert.ok(propuesta.advertencias.includes(avisoSinTrazado("cupo")));
});
