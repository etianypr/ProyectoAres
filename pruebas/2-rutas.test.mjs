// Prueba intensiva del armado de ruta y la geometría: los módulos reales de
// lib/geo/trazado, lib/geo/ors/direcciones y lib/rutas/orden-paradas.
// Las llamadas a OpenRouteService se interceptan con un doble de fetch.
process.env.NEXT_PUBLIC_ORS_KEY = "ors.clave-de-prueba";

import test from "node:test";
import assert from "node:assert/strict";
import { distanciaMetros, rumboEntre } from "@/lib/geo/coordenada";
import {
  rumboDelCamino,
  metrosRestantes,
  distanciaAPolilinea,
  ajustarATrazado,
  recortarTrazado,
} from "@/lib/geo/trazado";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { obtenerRutaCalles, enRachas } from "@/lib/geo/ors/direcciones";

// Arica, coordenadas reales de la zona de reparto.
const EMPRESA = { lat: -18.471152, lng: -70.289929 };
const CENTRO = { lat: -18.4783, lng: -70.3126 };

function alAzar(n, semilla = 1) {
  // Generador determinista para que un fallo se pueda reproducir.
  let s = semilla;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, () => ({
    lat: -18.44 - rnd() * 0.07,
    lng: -70.26 - rnd() * 0.08,
  }));
}

function esPermutacionValida(orden, n) {
  assert.equal(orden.length, n, `devolvió ${orden.length} índices para ${n} puntos`);
  if (n > 0) assert.equal(orden[0], 0, "la base (índice 0) debe quedar primera");
  assert.deepEqual([...orden].sort((a, b) => a - b), [...Array(n).keys()], "no es una permutación");
  assert.ok(!orden.some((i) => i == null || i < 0), `hay índices inválidos: ${orden}`);
}

// ------------------------------------------------------------- geometría
test("distanciaMetros: valores conocidos", () => {
  assert.equal(Math.round(distanciaMetros(EMPRESA, EMPRESA)), 0);
  const d = distanciaMetros(EMPRESA, CENTRO);
  // ~2,6 km en línea recta entre la empresa y el centro de Arica.
  assert.ok(d > 2000 && d < 3500, `distancia fuera de rango: ${d}`);
  // 1 grado de latitud ≈ 111,2 km
  const grado = distanciaMetros({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(grado - 111195) < 500, `un grado de latitud dio ${grado}`);
});

test("distanciaMetros es simétrica y nunca NaN", () => {
  const pts = alAzar(30, 7);
  for (const a of pts) {
    for (const b of pts) {
      const d1 = distanciaMetros(a, b);
      assert.ok(Number.isFinite(d1), "distancia no finita");
      assert.ok(Math.abs(d1 - distanciaMetros(b, a)) < 1e-6);
    }
  }
});

test("rumboEntre: puntos cardinales", () => {
  const o = { lat: 0, lng: 0 };
  assert.ok(Math.abs(rumboEntre(o, { lat: 1, lng: 0 }) - 0) < 0.01, "norte");
  assert.ok(Math.abs(rumboEntre(o, { lat: 0, lng: 1 }) - 90) < 0.01, "este");
  assert.ok(Math.abs(rumboEntre(o, { lat: -1, lng: 0 }) - 180) < 0.01, "sur");
  assert.ok(Math.abs(rumboEntre(o, { lat: 0, lng: -1 }) - 270) < 0.01, "oeste");
  // Siempre dentro de 0-360: Mapbox rechaza la consulta si se sale.
  for (const p of alAzar(50, 3)) {
    const r = rumboEntre(EMPRESA, p);
    assert.ok(r >= 0 && r < 360, `rumbo fuera de rango: ${r}`);
  }
});

test("rumboDelCamino: sin trazado suficiente devuelve null (no un rumbo inventado)", () => {
  assert.equal(rumboDelCamino(EMPRESA, []), null);
  assert.equal(rumboDelCamino(EMPRESA, [[-70.28, -18.47]]), null);
});

test("rumboDelCamino: estando ya en el último punto devuelve null en vez de un valor errático", () => {
  const geo = [
    [-70.2899, -18.4711],
    [-70.28991, -18.47111],
  ];
  assert.equal(rumboDelCamino({ lat: -18.47111, lng: -70.28991 }, geo), null);
});

test("rumboDelCamino: mira hacia adelante en el trazado", () => {
  // Línea recta hacia el norte, 10 puntos de ~11 m cada uno.
  const geo = Array.from({ length: 10 }, (_, i) => [-70.2899, -18.4711 + i * 0.0001]);
  const r = rumboDelCamino({ lat: -18.4711, lng: -70.2899 }, geo, 45);
  assert.ok(r != null && Math.abs(r) < 1, `esperaba rumbo norte, dio ${r}`);
});

test("metrosRestantes: trazado vacío = 0, y decrece al avanzar", () => {
  assert.equal(metrosRestantes(EMPRESA, []), 0);
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0005]);
  let anterior = Infinity;
  for (let i = 0; i < 40; i += 5) {
    const pos = { lat: geo[i][1], lng: geo[i][0] };
    const m = metrosRestantes(pos, geo);
    assert.ok(Number.isInteger(m), "debe ser un entero (se muestra en pantalla)");
    assert.ok(m < anterior, `no decreció: ${m} >= ${anterior}`);
    anterior = m;
  }
  assert.equal(metrosRestantes({ lat: geo[39][1], lng: geo[39][0] }, geo), 0);
});

// ------------------------------------------------- pegar el punto al camino
// El defecto que esto arregla se ve en terreno: el punto azul dibujado en la
// lectura cruda del GPS aparece adentro de una manzana o sobre un techo.

test("ajustarATrazado: una lectura con error lateral vuelve a la calle", () => {
  // Recta norte-sur de 40 puntos y una lectura 20 m al costado.
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const desviada = { lat: -18.4711 + 20 * 0.0002, lng: -70.2899 + 0.00019 }; // ~20 m al este

  const antes = distanciaAPolilinea(desviada, geo);
  assert.ok(antes > 15 && antes < 25, `la lectura de prueba estaba a ${antes} m`);

  const pegada = ajustarATrazado(desviada, geo);
  assert.ok(pegada, "una lectura a 20 m tiene que pegarse");
  assert.ok(
    distanciaAPolilinea(pegada, geo) < 1,
    "el punto pegado tiene que quedar SOBRE el trazado",
  );
  assert.ok(Math.abs(pegada.desvioM - antes) < 1, "desvioM tiene que ser lo que se corrigió");
});

test("ajustarATrazado: desde adentro de la casa, el punto sale al inicio del camino", () => {
  // El caso real de arrancar el día: el trazado empieza donde Mapbox
  // enganchó al conductor en la calle, y el GPS lo pone 45 m adentro del galpón.
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const enElGalpon = { lat: -18.4711, lng: -70.2899 + 0.00043 }; // ~45 m al este

  const pegada = ajustarATrazado(enElGalpon, geo);
  assert.ok(pegada, "a 45 m de la calle el punto TIENE que pegarse: si no, sale en el patio");
  assert.equal(pegada.indice, 0, "tiene que caer en el inicio de la ruta");
  assert.ok(distanciaAPolilinea(pegada, geo) < 1);
});

test("ajustarATrazado: se pega hasta 90 m; más allá se dibuja donde de verdad está", () => {
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const alCostado = (grados) => ({ lat: -18.4711 + 20 * 0.0002, lng: -70.2899 + grados });

  // ~80 m: todavía es el patio de una casa grande o un estacionamiento.
  assert.ok(ajustarATrazado(alCostado(0.00076), geo), "a 80 m tiene que seguir pegándose");
  // ~120 m: eso ya es otra calle, y ahí mentir sería peor.
  assert.equal(ajustarATrazado(alCostado(0.00114), geo), null);

  // Y sin trazado tampoco hay nada a qué pegarse.
  assert.equal(ajustarATrazado(EMPRESA, []), null);
  assert.equal(ajustarATrazado(EMPRESA, [[-70.2899, -18.4711]]), null);
});

test("ajustarATrazado: la ventana impide saltar a otra pasada por la misma calle", () => {
  // Trazado en U: sube 400 m, cruza 40 m al este y vuelve a bajar. Las dos
  // ramas quedan a 40 m entre sí, o sea DENTRO de la tolerancia de 90 m: sin
  // ventana de búsqueda, el punto podría engancharse en la rama de vuelta y
  // aparecer al final de la ruta.
  const subida = Array.from({ length: 20 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const bajada = Array.from({ length: 20 }, (_, i) => [
    -70.2899 + 0.00038,
    -18.4711 + (19 - i) * 0.0002,
  ]);
  const geo = [...subida, ...bajada];

  // Arrancando (índice 0), una lectura junto al inicio de la subida tiene que
  // engancharse ahí y no en el final de la bajada, que le queda a 40 m.
  const alInicio = { lat: -18.4711 + 0.00005, lng: -70.2899 + 0.00006 };
  const pegada = ajustarATrazado(alInicio, geo, { desdeIndice: 0, ventanaM: 150 });
  assert.ok(pegada);
  assert.ok(
    pegada.indice < subida.length,
    `se enganchó en la pasada de vuelta (índice ${pegada.indice} de ${geo.length})`,
  );
});

test("ajustarATrazado: avanzando por el camino, el punto pegado también avanza", () => {
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const fin = { lat: geo[39][1], lng: geo[39][0] };

  // Arrastrando el índice de una lectura a la otra, igual que usePuntoEnRuta.
  let indice = 0;
  let anterior = Infinity;
  for (let i = 0; i < 35; i += 5) {
    // Cada lectura con su propio error lateral, alternado como rebota el GPS.
    const lado = i % 10 === 0 ? 0.00012 : -0.00012;
    const cruda = { lat: geo[i][1], lng: geo[i][0] + lado };
    const pegada = ajustarATrazado(cruda, geo, { desdeIndice: indice });
    assert.ok(pegada, `la lectura ${i} tendría que haberse pegado`);
    assert.ok(pegada.indice >= indice, "el índice emparejado no puede retroceder");
    indice = pegada.indice;

    const falta = distanciaMetros(pegada, fin);
    assert.ok(falta < anterior, `el punto pegado no avanzó: ${falta} >= ${anterior}`);
    anterior = falta;
  }
});

test("ajustarATrazado: un hueco largo del GPS no deja el punto sin pegar", () => {
  // El teléfono se suspendió (una llamada entrante) y el conductor avanzó 700 m
  // sin una sola lectura: la ventana de 300 m no alcanza. El respaldo global es
  // lo que evita que el punto quede suelto por el resto del tramo.
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const muyAdelante = { lat: geo[35][1], lng: geo[35][0] + 0.0001 };

  const pegada = ajustarATrazado(muyAdelante, geo, { desdeIndice: 0 });
  assert.ok(pegada, "sin respaldo global el punto se quedaría sin pegar todo el tramo");
  assert.ok(pegada.indice >= 34, `enganchó en el índice ${pegada.indice}, no donde está`);
});

test("recortarTrazado: la línea arranca en el punto y nunca se alarga", () => {
  const geo = Array.from({ length: 40 }, (_, i) => [-70.2899, -18.4711 + i * 0.0002]);
  const cruda = { lat: geo[20][1], lng: geo[20][0] + 0.00012 };
  const pegada = ajustarATrazado(cruda, geo);

  const recortado = recortarTrazado(geo, pegada);
  assert.deepEqual(recortado[0], [pegada.lng, pegada.lat], "tiene que empezar en el punto");
  assert.ok(recortado.length < geo.length, "lo ya recorrido tiene que desaparecer");
  assert.deepEqual(recortado.at(-1), geo.at(-1), "el destino no se toca");
  // Lo que falta recorrer, medido sobre el trazado recortado, es lo mismo que
  // medía antes: recortar no puede cambiar la distancia que se muestra.
  const antes = metrosRestantes(pegada, geo);
  const despues = metrosRestantes(pegada, recortado);
  assert.ok(Math.abs(antes - despues) <= 1, `${antes} vs ${despues}`);
});

// --------------------------------------------------------- ordenarParadas
test("ordenarParadas devuelve una permutación válida para cualquier tamaño", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 9, 12, 20, 25, 31, 40]) {
    const puntos = [EMPRESA, ...alAzar(Math.max(0, n - 1), n)];
    esPermutacionValida(ordenarParadas(puntos.slice(0, n)), n);
  }
});

test("ordenarParadas con matriz de calles: permutación válida y usa la matriz", () => {
  for (let semilla = 1; semilla <= 30; semilla++) {
    const n = 3 + (semilla % 12);
    const puntos = [EMPRESA, ...alAzar(n - 1, semilla)];
    const matriz = puntos.map((a) => puntos.map((b) => distanciaMetros(a, b) * (1 + Math.random())));
    esPermutacionValida(ordenarParadas(puntos, matriz), n);
  }
});

test("ordenarParadas tolera una matriz con pares sin camino (null → Infinity)", () => {
  const puntos = [EMPRESA, ...alAzar(9, 11)];
  const matriz = puntos.map((a, i) =>
    puntos.map((b, j) => (i !== j && (i + j) % 4 === 0 ? Infinity : distanciaMetros(a, b))),
  );
  esPermutacionValida(ordenarParadas(puntos, matriz), puntos.length);
});

test("ordenarParadas tolera una matriz TODA sin camino sin devolver índices basura", () => {
  const puntos = [EMPRESA, ...alAzar(7, 13)];
  const matriz = puntos.map(() => puntos.map(() => Infinity));
  esPermutacionValida(ordenarParadas(puntos, matriz), puntos.length);
});

test("ordenarParadas tolera una matriz incompleta o mal formada", () => {
  const puntos = [EMPRESA, ...alAzar(7, 17)];
  esPermutacionValida(ordenarParadas(puntos, [[0, 1]]), puntos.length); // filas de menos
  esPermutacionValida(
    ordenarParadas(puntos, puntos.map(() => [])),
    puntos.length,
  ); // filas vacías
  esPermutacionValida(
    ordenarParadas(puntos, puntos.map(() => puntos.map(() => NaN))),
    puntos.length,
  ); // NaN por todas partes
});

test("ordenarParadas mejora la ruta respecto del orden de carga", () => {
  let mejoradas = 0;
  const total = 25;
  for (let semilla = 1; semilla <= total; semilla++) {
    const puntos = [EMPRESA, ...alAzar(9, semilla * 3)];
    const orden = ordenarParadas(puntos);
    const largo = (o) =>
      o.slice(0, -1).reduce((a, _, i) => a + distanciaMetros(puntos[o[i]], puntos[o[i + 1]]), 0);
    const identidad = puntos.map((_, i) => i);
    if (largo(orden) < largo(identidad)) mejoradas++;
    assert.ok(largo(orden) <= largo(identidad) + 1, "la ruta ordenada salió PEOR que sin ordenar");
  }
  assert.ok(mejoradas >= total * 0.8, `solo mejoró ${mejoradas}/${total}`);
});

test("ordenarParadas: con matriz por calles nunca sale peor que el orden en línea recta (medido por calle)", () => {
  for (let semilla = 1; semilla <= 20; semilla++) {
    const puntos = [EMPRESA, ...alAzar(8, semilla * 5)];
    // Matriz asimétrica (sentidos únicos): el caso que motivó pedirla.
    const matriz = puntos.map((a, i) =>
      puntos.map((b, j) => distanciaMetros(a, b) * (i < j ? 1 : 1.6)),
    );
    const porCalle = (o) =>
      o.slice(0, -1).reduce((acc, _, k) => acc + matriz[o[k]][o[k + 1]], 0);
    const conMatriz = ordenarParadas(puntos, matriz);
    const sinMatriz = ordenarParadas(puntos, null);
    assert.ok(
      porCalle(conMatriz) <= porCalle(sinMatriz) + 1e-6,
      `con matriz ${porCalle(conMatriz)} > sin matriz ${porCalle(sinMatriz)}`,
    );
  }
});

test("ordenarParadas es rápido con un día grande (no traba el teléfono)", () => {
  const puntos = [EMPRESA, ...alAzar(40, 99)];
  const t0 = performance.now();
  const orden = ordenarParadas(puntos, puntos.map((a) => puntos.map((b) => distanciaMetros(a, b))));
  const ms = performance.now() - t0;
  esPermutacionValida(orden, puntos.length);
  assert.ok(ms < 4000, `tardó ${Math.round(ms)} ms con 41 puntos`);
});

// La matriz de calles por bloques: pruebas/rutas-017.test.mjs (spec 017, R1).

// ----------------------------------------------------- obtenerRutaCalles
// Doble de la API de direcciones de ORS: un punto de geometría por coordenada
// pedida, 1 km y 60 s por tramo, y todo de calle principal (se puede dar la
// vuelta: no hay pasadas de frente).
function respuestaRutaOrs(coords, { metrosPorTramo = 1000, tipo = 2, metros } = {}) {
  const tramos = coords.length - 1;
  const porTramo = metros != null ? metros / tramos : metrosPorTramo;
  return {
    ok: true,
    status: 200,
    json: async () => ({
      features: [
        {
          geometry: { coordinates: coords },
          properties: {
            summary: { distance: porTramo * tramos },
            way_points: coords.map((_, i) => i),
            segments: Array.from({ length: tramos }, () => ({ distance: porTramo, duration: 60 })),
            extras: { waytype: { values: [[0, coords.length - 1, tipo]] } },
          },
        },
      ],
    }),
  };
}

function fetchRutaFalsa(registro, opciones) {
  return async (url, init) => {
    assert.match(String(url), /api\.openrouteservice\.org\/v2\/directions\/driving-car\/geojson/);
    const cuerpo = JSON.parse(init.body);
    registro.push(cuerpo.coordinates.length);
    return respuestaRutaOrs(cuerpo.coordinates, opciones);
  };
}

async function conFetch(doble, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = doble;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("obtenerRutaCalles: una sola consulta cuando entra (<= 70 puntos)", async () => {
  const registro = [];
  const r = await conFetch(fetchRutaFalsa(registro), () => obtenerRutaCalles([EMPRESA, ...alAzar(66, 21)]));
  assert.deepEqual(registro, [67], "un día de 66 paradas y la base es UNA consulta");
  assert.equal(r.trazado.length, 67);
  assert.equal(r.distanciaM, 66_000);
  assert.equal(r.duracionS, 66 * 60);
});

test("obtenerRutaCalles: parte en tramos y pega el trazado sin duplicar ni perder puntos", async () => {
  const registro = [];
  const puntos = [EMPRESA, ...alAzar(99, 31)];
  const r = await conFetch(fetchRutaFalsa(registro), () => obtenerRutaCalles(puntos));
  assert.deepEqual(registro, [70, 31], "no partió en tramos de 70 con el punto de unión repetido");
  // 70 + 31 - 1 repetido = 100: todos los puntos, ninguno dos veces.
  assert.equal(r.trazado.length, 100);
  assert.equal(new Set(r.trazado.map((c) => c.join(","))).size, 100, "el punto de unión quedó duplicado");
  assert.equal(r.distanciaM, 99_000);
  assert.deepEqual(r.trazado[0], [EMPRESA.lng, EMPRESA.lat]);
});

test("obtenerRutaCalles: cubre TODOS los tramos para tamaños de día variados", async () => {
  for (const n of [2, 69, 70, 71, 72, 139, 140, 141]) {
    const registro = [];
    const r = await conFetch(fetchRutaFalsa(registro), () => obtenerRutaCalles([EMPRESA, ...alAzar(n - 1, n)]));
    assert.equal(r.trazado.length, n, `con ${n} puntos el trazado quedó de ${r.trazado.length}`);
    assert.ok(registro.every((t) => t <= 70), `un tramo pidió ${Math.max(...registro)} puntos`);
  }
});

test("obtenerRutaCalles: null (no un trazado a medias) si un tramo falla", async () => {
  let n = 0;
  const r = await conFetch(
    async (url, init) => {
      n++;
      if (n === 2) return { ok: false, status: 503, json: async () => ({}) };
      return fetchRutaFalsa([])(url, init);
    },
    () => obtenerRutaCalles([EMPRESA, ...alAzar(99, 5)]),
  );
  assert.equal(r, null, "devolvió media ruta: el conductor vería una línea cortada");
});

test("obtenerRutaCalles: sin clave avisa fuerte (no degrada en silencio)", async () => {
  const clave = process.env.NEXT_PUBLIC_ORS_KEY;
  delete process.env.NEXT_PUBLIC_ORS_KEY;
  try {
    await assert.rejects(() => obtenerRutaCalles([EMPRESA, CENTRO]), /NEXT_PUBLIC_ORS_KEY/);
  } finally {
    process.env.NEXT_PUBLIC_ORS_KEY = clave;
  }
});

test("obtenerRutaCalles: menos de 2 puntos no consulta nada", async () => {
  await conFetch(
    async () => {
      throw new Error("no debería consultarse");
    },
    async () => {
      assert.equal(await obtenerRutaCalles([EMPRESA]), null);
      assert.equal(await obtenerRutaCalles([]), null);
    },
  );
});

test("obtenerRutaCalles: pide sin radio (una parada lejos de la calle no bota la consulta) y libre en las paradas", async () => {
  const cuerpos = [];
  await conFetch(
    async (url, init) => {
      const c = JSON.parse(init.body);
      cuerpos.push(c);
      return respuestaRutaOrs(c.coordinates);
    },
    () => obtenerRutaCalles([EMPRESA, CENTRO, ...alAzar(3, 2)]),
  );
  assert.deepEqual(cuerpos[0].radiuses, [-1, -1, -1, -1, -1]);
  assert.equal(cuerpos[0].continue_straight, false, "el bug de las vueltas a la manzana");
  assert.deepEqual(cuerpos[0].extra_info, ["waytype"]);
});

// ------------------------------------------- los tramos de la línea del día
// Con ellos la app mide cuánto falta hasta la parada sin pedir otra ruta (spec 020).
test("obtenerRutaCalles: un tramo por parada, pegados y con sus índices en el trazado", async () => {
  const puntos = [EMPRESA, ...alAzar(90, 7), EMPRESA];
  const registro = [];
  const r = await conFetch(fetchRutaFalsa(registro), () => obtenerRutaCalles(puntos));
  assert.ok(registro.length >= 2, "este día se pide en más de una consulta");
  assert.equal(r.tramos.length, puntos.length - 1);
  assert.equal(r.tramos[0].desde, 0);
  assert.equal(r.tramos.at(-1).hasta, r.trazado.length - 1);
  r.tramos.forEach((t, k) => {
    if (k > 0) assert.equal(t.desde, r.tramos[k - 1].hasta, "cada tramo arranca donde terminó el anterior");
    const [lng, lat] = r.trazado[t.hasta];
    assert.deepEqual({ lat, lng }, puntos[k + 1], "el tramo k llega al punto k+1");
  });
  assert.equal(
    r.tramos.reduce((s, t) => s + t.metros, 0),
    r.distanciaM,
  );
});

// ------------------------------- la ruta del día no sale en reversa de un pasaje
// El auto llega a la parada hacia el este y la ruta libre sigue hacia el oeste:
// da la vuelta en la parada. En un pasaje eso es salir en reversa (terreno 2026-10-29).
const TRES = [
  { lat: -18.47, lng: -70.3 },
  { lat: -18.47, lng: -70.299 },
  { lat: -18.47, lng: -70.2995 },
];
const TRES_COORDS = TRES.map((p) => [p.lng, p.lat]);

test("obtenerRutaCalles: en un pasaje, la parada se pasa de frente (ese pedazo con continue_straight)", async () => {
  const cuerpos = [];
  const r = await conFetch(
    async (url, init) => {
      const c = JSON.parse(init.body);
      cuerpos.push(c);
      return respuestaRutaOrs(TRES_COORDS, { tipo: 3, metros: c.continue_straight ? 900 : 160 });
    },
    () => obtenerRutaCalles(TRES),
  );
  assert.equal(cuerpos.length, 2, "vuelve a pedir ese pedazo de frente");
  assert.equal(cuerpos[0].continue_straight, false);
  assert.equal(cuerpos[1].continue_straight, true);
  assert.equal(cuerpos[1].coordinates.length, 3, "la anterior, la parada y la siguiente");
  assert.equal(r.distanciaM, 900, "los km son los de pasar de frente");
  assert.equal(r.puntos[1].clase, "calle");
  assert.equal(r.puntos[1].extraM, 740);
});

test("obtenerRutaCalles: en una calle principal se puede dar la vuelta (una sola consulta)", async () => {
  let consultas = 0;
  const r = await conFetch(
    async () => {
      consultas++;
      return respuestaRutaOrs(TRES_COORDS, { tipo: 2, metros: 160 });
    },
    () => obtenerRutaCalles(TRES),
  );
  assert.equal(consultas, 1);
  assert.equal(r.distanciaM, 160);
  assert.equal(r.puntos[1].extraM, null);
});

test("enRachas: paradas seguidas de frente se piden juntas", () => {
  assert.deepEqual(enRachas([9, 3, 4, 4]), [[3, 4], [9, 9]]);
  assert.deepEqual(enRachas([]), []);
});

// ------------------------------------- el plan sabe dónde no se da la vuelta
const { penalizacionPorSentido } = await import("@/lib/encomiendas/local/generar-ruta/sentido");
const { FIN } = await import("@/lib/rutas/orden-paradas/costo");

test("penalizacionPorSentido: en calle estrecha cobra entrar y salir por el mismo extremo", () => {
  // La parada 1 está en un pasaje que corre de oeste a este (eje 90°).
  const puntos = [
    { lat: -18.47, lng: -70.31 }, // base, al oeste
    { lat: -18.47, lng: -70.3 }, // la parada del pasaje
    { lat: -18.47, lng: -70.305 }, // al oeste también
    { lat: -18.47, lng: -70.295 }, // al este
    { lat: -18.465, lng: -70.3 }, // al norte: de costado
  ];
  const estrecha = { clase: "calle", eje: 90, extraM: 600 };
  const pen = penalizacionPorSentido(puntos, [null, estrecha, null, null, null]);
  assert.equal(pen(2, 1, 0), 600, "llega del oeste y vuelve al oeste: se devuelve");
  assert.equal(pen(2, 1, FIN), 600, "volver a la base (al oeste) cuenta igual");
  assert.equal(pen(2, 1, 3), 0, "del oeste al este: pasa de frente");
  assert.equal(pen(3, 1, 2), 0, "y al revés tampoco");
  assert.equal(pen(4, 1, 2), 0, "una de costado no se cobra");
  assert.equal(pen(2, 3, 2), 0, "las paradas de calle ancha o sin dato no pagan");
  assert.equal(penalizacionPorSentido(puntos, [null, { ...estrecha, clase: "principal" }, null, null, null]), null);
});

// ------------------------------------------- paradas pegadas a una carretera
const { elegirAcceso, mismaCalle, puntoDeAcceso } = await import("@/lib/geo/acceso");
const { teselasAlrededor, ZOOM } = await import("@/lib/geo/teselas");
const { PbfWriter } = await import("pbf");

test("elegirAcceso: una casa junto a la troncal se corre a su calle (o a la local más cercana)", () => {
  const via = (clase, nombre, metros, lng) => ({ clase, nombre, metros, punto: { lat: -18.426, lng } });
  const alrededor = [
    via("trunk", "Avenida Capitán Ávalos", 6, -70.2905),
    via("minor", "Zapiga", 7, -70.2906),
    via("path", null, 3, -70.2904),
    via("minor", "Avenida Santiago Arata Gandolfo", 60, -70.2911),
  ];
  const a = elegirAcceso(alrededor, "AVENIDA SANTIAGO ARATA 4551, CONDOMINIO NORTE");
  assert.equal(a.calle, "Avenida Santiago Arata Gandolfo", "prefiere la calle de la dirección");
  assert.equal(a.carretera, "Avenida Capitán Ávalos");
  assert.equal(elegirAcceso(alrededor, "PASAJE TRES 120").calle, "Zapiga", "si no está, la local más cercana");
  assert.equal(elegirAcceso(alrededor, "AV. CAPITAN AVALOS 1234"), null, "la dirección es de esa avenida: no se toca");
  assert.equal(elegirAcceso([via("minor", "Zapiga", 5, -70.29), ...alrededor], "PASAJE TRES 120"), null, "ya está en una calle local");
  assert.equal(elegirAcceso([via("trunk", "Ruta 5", 4, -70.29), via("minor", "Lejos", 400, -70.3)], "PASAJE TRES 120"), null, "sin calle local cerca, se deja");
  assert.ok(mismaCalle("Avenida Santiago Arata Gandolfo", "AVENIDA SANTIAGO ARATA"));
  assert.ok(!mismaCalle("Avenida Capitán Ávalos", "Avenida Linderos"));
});

// Una tesela vectorial de mentira (formato de OpenMapTiles), sin red: cada capa
// lleva líneas { clase, nombre, puntos: [[lng, lat], …] }.
function teselaDePrueba(x, y, capas) {
  const n = 2 ** ZOOM;
  const px = (lng) => Math.round((((lng + 180) / 360) * n - x) * 4096);
  const py = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.round((((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - y) * 4096);
  };
  const zz = (v) => (v << 1) ^ (v >> 31);
  const pbf = new PbfWriter();
  for (const [nombre, lineas] of Object.entries(capas)) {
    const claves = ["class", "name"];
    const valores = [];
    const indice = (v) => (valores.includes(v) ? valores.indexOf(v) : valores.push(v) - 1);
    pbf.writeMessage(3, (_, p) => {
      p.writeVarintField(15, 2);
      p.writeStringField(1, nombre);
      for (const l of lineas) {
        p.writeMessage(2, (__, f) => {
          const tags = [0, indice(l.clase)];
          if (l.nombre) tags.push(1, indice(l.nombre));
          f.writePackedVarint(2, tags);
          f.writeVarintField(3, 2);
          let cx = 0;
          let cy = 0;
          const geo = [];
          l.puntos.forEach(([lng, lat], i) => {
            if (i === 0) geo.push((1 & 7) | (1 << 3));
            if (i === 1) geo.push((2 & 7) | ((l.puntos.length - 1) << 3));
            const [gx, gy] = [px(lng), py(lat)];
            geo.push(zz(gx - cx), zz(gy - cy));
            [cx, cy] = [gx, gy];
          });
          f.writePackedVarint(4, geo);
        });
      }
      for (const c of claves) p.writeStringField(3, c);
      for (const v of valores) p.writeMessage(4, (___, w) => w.writeStringField(1, v));
      p.writeVarintField(5, 4096);
    });
  }
  return pbf.finish();
}

/** El centro de la tesela donde cae el punto: a 150 m no toca otra. */
function centroDeTesela(punto) {
  const [{ x, y }] = teselasAlrededor(punto, 0);
  const n = 2 ** ZOOM;
  return {
    x,
    y,
    lng: ((x + 0.5) / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI,
  };
}

test("teselasAlrededor: una tesela en el medio, dos junto al borde", () => {
  const { x, lat, lng } = centroDeTesela({ lat: -18.4790, lng: -70.3115 });
  assert.equal(teselasAlrededor({ lat, lng }, 150).length, 1);
  const borde = (x / 2 ** ZOOM) * 360 - 180; // longitud del borde oeste de la tesela
  assert.equal(teselasAlrededor({ lat, lng: borde + 0.0005 }, 150).length, 2);
});

test("puntoDeAcceso: lee las calles de las teselas del mapa, sin Mapbox", async () => {
  const { x, y, lat, lng } = centroDeTesela({ lat: -18.4260, lng: -70.2905 });
  const casa = { lat, lng };
  // La troncal pasa a ~5 m al oeste y Zapiga a ~40 m al este. La troncal viene
  // dos veces, como en OpenFreeMap: con nombre y sin él.
  const m = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const norteSur = (dx) => [[lng + dx * m, lat + 0.002], [lng + dx * m, lat - 0.002]];
  const troncal = { clase: "trunk", puntos: norteSur(-5) };
  const zapiga = { clase: "minor", nombre: "Zapiga", puntos: norteSur(40) };
  const tesela = teselaDePrueba(x, y, {
    transportation: [troncal, { ...zapiga, nombre: undefined }],
    transportation_name: [{ ...troncal, nombre: "Avenida Capitán Ávalos" }, zapiga],
  });
  const original = globalThis.fetch;
  const pedidas = [];
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    if (String(url).endsWith("/planet")) return Response.json({ tiles: ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"] });
    return new Response(tesela);
  };
  try {
    const a = await puntoDeAcceso(casa, "PASAJE TRES 120");
    assert.equal(a?.calle, "Zapiga");
    assert.equal(a?.carretera, "Avenida Capitán Ávalos", "la troncal sin nombre no tapa a la con nombre");
    assert.ok(Math.abs(a.metros - 40) <= 3, `a ${a.metros} m`);
    assert.equal(await puntoDeAcceso(casa, "AV CAPITAN AVALOS 1234"), null, "la dirección es de la troncal");
    assert.ok(pedidas.every((u) => u.startsWith("https://tiles.openfreemap.org/")), "solo OpenFreeMap");
    assert.equal(pedidas.filter((u) => u.endsWith(".pbf")).length, 1, "la tesela se baja una vez");
  } finally {
    globalThis.fetch = original;
  }
});

test("puntoDeAcceso: sin señal, la parada queda donde estaba", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("sin red");
  };
  try {
    assert.equal(await puntoDeAcceso({ lat: -18.5, lng: -70.3 }, "PASAJE TRES 120"), null);
  } finally {
    globalThis.fetch = original;
  }
});

// ------------------------------------------------- el número de un lugar
const { cifraDelLugar } = await import("@/app/(conductor)/conductor/encomiendas/_mapa/capa-paradas");

test("cifraDelLugar: varias paradas en el mismo punto se escriben cortas", () => {
  assert.equal(cifraDelLugar(["7"]), "7");
  assert.equal(cifraDelLugar(["30", "31"]), "30–31");
  assert.equal(cifraDelLugar(["41", "42", "43", "40"]), "40–43", "seguidas aunque vengan desordenadas");
  assert.equal(cifraDelLugar(["5", "9"]), "5+1");
  assert.equal(cifraDelLugar(["12", "15", "20"]), "12+2");
});
