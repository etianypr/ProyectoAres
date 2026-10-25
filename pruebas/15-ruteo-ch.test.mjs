// OpenRouteService: el trazado por calles abierto (grafo de OSM, Jerarquías de
// Contracción). Lo usa el servidor MCP, NO el camino del conductor — ese sigue
// saliendo de Mapbox por las razones escritas en lib/geo/mapbox/direcciones.ts.
//
// Igual que el resto del proyecto, se reemplaza el `fetch` global y no el
// módulo: así corre el armado real del cuerpo (el orden lng/lat, los
// avoid_features, el idioma) y la interpretación real de cada error. Eso es
// justo lo que se rompe cuando el proveedor cambia algo.
//
// La respuesta sale de fixtures/ruta-ors-arica.json, CAPTURADA de la API real
// sobre el mismo tramo de Arica que fixtures/tramo-arica.json usa para Mapbox.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { obtenerRutaAbierta, ErrorClaveORS } from "@/lib/geo/openrouteservice";
// Las funciones REALES que van a recibir esta geometría. Que entre sin traducir
// es la mitad del valor de este módulo.
import { ajustarATrazado, metrosRestantes, distanciaAPolilinea } from "@/lib/geo/trazado";

const ORS = JSON.parse(readFileSync("pruebas/fixtures/ruta-ors-arica.json", "utf8"));
const REAL = ORS.features[0];
const GEOMETRIA = REAL.geometry.coordinates; // 58 pares [lng, lat] reales de Arica
const PASOS_REALES = REAL.properties.segments[0].steps;

// El tramo de Mapbox sobre el MISMO origen y destino, para el contraste.
const TRAMO_MAPBOX = JSON.parse(readFileSync("pruebas/fixtures/tramo-arica.json", "utf8")).trazado;

// Origen y destino del tramo real, ya en {lat, lng}.
const DESDE = { lat: GEOMETRIA[0][1], lng: GEOMETRIA[0][0] };
const HASTA = {
  lat: GEOMETRIA[GEOMETRIA.length - 1][1],
  lng: GEOMETRIA[GEOMETRIA.length - 1][0],
};
/** Un punto del medio del trazado. El índice se calcula y no se escribe a mano:
 *  la captura real trae 58 puntos y la anterior traía 121, así que un número
 *  fijo acá se rompe cada vez que se recaptura el fixture. */
const MEDIO = (() => {
  const indice = Math.floor(GEOMETRIA.length / 2);
  return { indice, lat: GEOMETRIA[indice][1], lng: GEOMETRIA[indice][0] };
})();

/** El sobre geojson de ORS. Por defecto, la respuesta real tal cual se capturó;
 *  los parámetros son para forzar los casos que la API no devuelve sola. */
function respuestaORS({ trazado, distance, duration, wayPoints, steps } = {}) {
  return {
    features: [
      {
        geometry: { coordinates: trazado ?? GEOMETRIA },
        properties: {
          summary: {
            distance: distance ?? REAL.properties.summary.distance,
            duration: duration ?? REAL.properties.summary.duration,
          },
          ...(wayPoints ? { way_points: wayPoints } : {}),
          ...(steps ? { segments: [{ steps }] } : {}),
        },
      },
    ],
  };
}

const fetchOriginal = globalThis.fetch;
let pedidos = [];
let contestar = () => respuestaORS();

function instalar() {
  pedidos = [];
  globalThis.fetch = async (url, opciones) => {
    pedidos.push({ url: String(url), ...opciones, cuerpo: JSON.parse(opciones?.body ?? "{}") });
    const r = contestar();
    if (r instanceof Error) throw r;
    if (typeof r === "number") return new Response("nope", { status: r });
    return new Response(JSON.stringify(r), {
      status: 200,
      headers: { "content-type": "application/geo+json" },
    });
  };
}

test.before(() => {
  process.env.ORS_API_KEY = "clave-de-prueba";
  instalar();
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.ORS_API_KEY;
});
test.beforeEach(() => {
  pedidos = [];
  contestar = () => respuestaORS();
});

const ultimo = () => pedidos[pedidos.length - 1];

// ---------------------------------------------------------------------------
// El orden lng/lat, que es el error que no da error
// ---------------------------------------------------------------------------

test("las coordenadas salen como [lng, lat], no al revés", async () => {
  // Invertir el par no rompe nada: devuelve una ruta por el océano Índico. Ya
  // hay una prueba igual para el mapa estático, y es el mismo error.
  await obtenerRutaAbierta([DESDE, HASTA]);

  const [primera] = ultimo().cuerpo.coordinates;
  assert.equal(primera[0], DESDE.lng, "el primer valor tiene que ser la LONGITUD");
  assert.equal(primera[1], DESDE.lat, "el segundo valor tiene que ser la LATITUD");
  // Arica está en longitud -70 y latitud -18: si se invirtieran, la latitud
  // quedaría en -70, que no existe como lugar habitado de Chile.
  assert.ok(primera[0] < -70 && primera[0] > -71, "la longitud no es de Arica");
  assert.ok(primera[1] < -18 && primera[1] > -19, "la latitud no es de Arica");
});

test("la geometría vuelve tal cual, en el mismo formato que lib/geo/trazado", async () => {
  const r = await obtenerRutaAbierta([DESDE, HASTA]);
  assert.equal(r.trazado.length, GEOMETRIA.length);
  assert.deepEqual(r.trazado[0], GEOMETRIA[0]);
  // 3418,1 m → 3418: se redondea a metros y segundos enteros.
  assert.equal(r.distanciaM, Math.round(REAL.properties.summary.distance));
  assert.equal(r.duracionS, Math.round(REAL.properties.summary.duration));
});

test("ORS y Mapbox no trazan lo mismo, y está bien que así sea", async () => {
  // Sobre el MISMO origen y destino: ORS da 3418 m en 58 puntos y Mapbox 3612 m
  // en 121. Eligen caminos distintos y muestrean distinto. Está acá para que
  // nadie lea una diferencia de 200 m como un error de alguno de los dos.
  const r = await obtenerRutaAbierta([DESDE, HASTA]);
  assert.ok(r.distanciaM < 3600 && r.distanciaM > 3200);
  assert.ok(
    r.trazado.length < TRAMO_MAPBOX.length,
    "el muestreo de ORS dejó de ser más ralo que el de Mapbox",
  );
});

test("esa geometría entra SIN traducir a la maquinaria de la ruta", async () => {
  // Es la razón de devolver [lng, lat] y no {lat, lng}: si hubiera que dar
  // vuelta los pares en el camino, alguien los daría vuelta mal algún día.
  const r = await obtenerRutaAbierta([DESDE, HASTA]);

  const pegado = ajustarATrazado(DESDE, r.trazado);
  assert.ok(pegado, "ajustarATrazado no supo leer la geometría");

  const faltan = metrosRestantes(DESDE, r.trazado);
  assert.ok(faltan > 3000 && faltan < 4200, `faltaban ${faltan} m para un tramo de 3,6 km`);

  // Un punto del propio trazado está a cero metros del trazado.
  assert.ok(distanciaAPolilinea({ lat: MEDIO.lat, lng: MEDIO.lng }, r.trazado) < 1);
});

// ---------------------------------------------------------------------------
// Lo que se le pide a ORS
// ---------------------------------------------------------------------------

test("se pide el endpoint geojson, que ya trae las coordenadas crudas", async () => {
  // El endpoint /json entrega una polilínea codificada y habría que escribir un
  // decodificador —y probarlo—. Este no.
  await obtenerRutaAbierta([DESDE, HASTA]);
  assert.match(ultimo().url, /\/v2\/directions\/driving-car\/geojson$/);
  assert.equal(ultimo().method, "POST");
  assert.equal(ultimo().headers.Authorization, "clave-de-prueba");
});

test("las instrucciones se piden en castellano, y solo si se piden", async () => {
  await obtenerRutaAbierta([DESDE, HASTA]);
  assert.equal(ultimo().cuerpo.instructions, false, "se pidieron instrucciones sin querer");
  assert.equal(ultimo().cuerpo.language, "es");

  contestar = () => respuestaORS({ steps: PASOS_REALES });
  const r = await obtenerRutaAbierta([DESDE, HASTA], { instrucciones: true });
  assert.equal(ultimo().cuerpo.instructions, true);
  assert.equal(r.pasos.length, PASOS_REALES.length);
  assert.equal(r.pasos[0].texto, PASOS_REALES[0].instruction);
  assert.equal(r.pasos[0].distanciaM, Math.round(PASOS_REALES[0].distance));
  // El punto de cada maniobra sale del way_points inicial del paso.
  const i = PASOS_REALES[2].way_points[0];
  assert.deepEqual(r.pasos[2].punto, { lat: GEOMETRIA[i][1], lng: GEOMETRIA[i][0] });
});

test("las instrucciones de ORS dicen \"Camina\" aunque el perfil sea en auto", async () => {
  // No es un bug nuestro: es cómo ORS traduce al castellano el perfil
  // driving-car. Queda fijado acá porque es una de las razones por las que la
  // navegación del conductor sigue saliendo de Mapbox, que dice "Conduzca".
  contestar = () => respuestaORS({ steps: PASOS_REALES });
  const r = await obtenerRutaAbierta([DESDE, HASTA], { instrucciones: true });
  assert.match(r.pasos[0].texto, /^Camina/, "ORS cambió su redacción: revisá si ya sirve para el conductor");
});

test("sin instrucciones no se inventan pasos", async () => {
  const r = await obtenerRutaAbierta([DESDE, HASTA]);
  assert.equal(r.pasos, null);
});

test("lo que se evita se traduce al vocabulario de ORS", async () => {
  // Quien llama escribe "peajes"; ORS entiende "tollways". La traducción vive
  // en el módulo para que nadie más tenga que saberlo.
  await obtenerRutaAbierta([DESDE, HASTA], { evitar: ["peajes", "autopistas"] });
  assert.deepEqual(ultimo().cuerpo.options.avoid_features, ["tollways", "highways"]);

  await obtenerRutaAbierta([DESDE, HASTA]);
  assert.equal(ultimo().cuerpo.options, undefined, "se mandó un options vacío");
});

test("el orden de las paradas NO se le regala a ORS salvo que se pida", async () => {
  // El orden lo decide ordenarParadas(), que además pondera los bloques
  // horarios que el receptor pidió por WhatsApp. ORS no sabe nada de eso.
  await obtenerRutaAbierta([DESDE, HASTA]);
  assert.equal(ultimo().cuerpo.optimize_waypoints, undefined);

  await obtenerRutaAbierta([DESDE, HASTA], { optimizarOrden: true });
  assert.equal(ultimo().cuerpo.optimize_waypoints, true);
});

test("cuando ORS reordena, el orden que devuelve es el que se recorrió", async () => {
  // way_points son índices dentro del trazado: el último punto que se mandó se
  // visitó ANTES que el segundo, así que el orden sale [0, 2, 1].
  const ultimoIndice = GEOMETRIA.length - 1;
  contestar = () => respuestaORS({ wayPoints: [0, ultimoIndice, MEDIO.indice] });
  const r = await obtenerRutaAbierta([DESDE, HASTA, MEDIO], { optimizarOrden: true });
  assert.deepEqual(r.orden, [0, 2, 1]);
});

test("sin way_points el orden es el que se mandó", async () => {
  const r = await obtenerRutaAbierta([DESDE, HASTA]);
  assert.deepEqual(r.orden, [0, 1]);
});

// ---------------------------------------------------------------------------
// Cuando sale mal
// ---------------------------------------------------------------------------

test("un error de ORS devuelve null y no lanza", async () => {
  for (const codigo of [400, 403, 404, 429, 500, 503]) {
    contestar = () => codigo;
    assert.equal(await obtenerRutaAbierta([DESDE, HASTA]), null, `HTTP ${codigo} no dio null`);
  }
});

test("si la red se cae, se devuelve null: el llamador conserva lo que tenía", async () => {
  contestar = () => new TypeError("fetch failed");
  assert.equal(await obtenerRutaAbierta([DESDE, HASTA]), null);
});

test("una respuesta sin trazado usable es null, no media ruta", async () => {
  // Una ruta de un punto se dibuja igual y parece que el trazado terminó ahí.
  contestar = () => respuestaORS({ trazado: [GEOMETRIA[0]] });
  assert.equal(await obtenerRutaAbierta([DESDE, HASTA]), null);

  contestar = () => ({ features: [] });
  assert.equal(await obtenerRutaAbierta([DESDE, HASTA]), null);

  contestar = () => ({});
  assert.equal(await obtenerRutaAbierta([DESDE, HASTA]), null);
});

test("la falta de API key LANZA: no es lo mismo que ORS caído", async () => {
  // Tragarse esto haría que un .env mal armado se vea igual que un servicio
  // caído, y se busca el problema donde no está. Mismo criterio que
  // ErrorTokenMapbox en lib/geo/mapbox/direcciones.ts.
  const guardada = process.env.ORS_API_KEY;
  delete process.env.ORS_API_KEY;
  try {
    await assert.rejects(() => obtenerRutaAbierta([DESDE, HASTA]), ErrorClaveORS);
  } finally {
    process.env.ORS_API_KEY = guardada;
  }
});

test("no se gasta una consulta cuando no hay ruta posible", async () => {
  assert.equal(await obtenerRutaAbierta([]), null);
  assert.equal(await obtenerRutaAbierta([DESDE]), null);
  assert.equal(pedidos.length, 0, "se consultó ORS por una ruta de menos de dos puntos");

  // 70 es el máximo MEDIDO contra la API (71 devuelve 400). Ver MAX_PUNTOS.
  const muchos = Array.from({ length: 71 }, () => DESDE);
  assert.equal(await obtenerRutaAbierta(muchos), null);
  assert.equal(pedidos.length, 0, "se consultó ORS pasándose del máximo de puntos");

  // Y 70 SÍ pasa: el límite de antes (50) rechazaba rutas que el servicio acepta.
  assert.ok(await obtenerRutaAbierta(Array.from({ length: 70 }, () => DESDE)));
  assert.equal(pedidos.length, 1);
});
