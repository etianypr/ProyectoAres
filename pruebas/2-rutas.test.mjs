// Prueba intensiva del armado de ruta y la geometría: src/lib/rutas.ts real.
// Las llamadas a Mapbox se interceptan con un doble de fetch.
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.token-de-prueba";

import test from "node:test";
import assert from "node:assert/strict";
import {
  distanciaMetros,
  rumboEntre,
  rumboDelCamino,
  metrosRestantes,
  distanciaAPolilinea,
  ajustarATrazado,
  recortarTrazado,
  ordenarParadas,
  matrizDistancias,
  obtenerRutaCalles,
  obtenerNavegacion,
} from "@/lib/rutas";

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
  // El caso real de arrancar la jornada: el trazado empieza donde Mapbox
  // enganchó al chofer en la calle, y el GPS lo pone 45 m adentro del galpón.
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
  // El teléfono se suspendió (una llamada entrante) y el chofer avanzó 700 m
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

test("ordenarParadas es rápido con una jornada grande (no traba el teléfono)", () => {
  const puntos = [EMPRESA, ...alAzar(40, 99)];
  const t0 = performance.now();
  const orden = ordenarParadas(puntos, puntos.map((a) => puntos.map((b) => distanciaMetros(a, b))));
  const ms = performance.now() - t0;
  esPermutacionValida(orden, puntos.length);
  assert.ok(ms < 4000, `tardó ${Math.round(ms)} ms con 41 puntos`);
});

// ----------------------------------------------------- matrizDistancias
test("matrizDistancias: null si no entra en una consulta (más de 25 puntos)", async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => {
    llamadas++;
    throw new Error("no debería consultarse");
  };
  try {
    assert.equal(await matrizDistancias(alAzar(26, 1)), null);
    assert.equal(await matrizDistancias([EMPRESA]), null);
    assert.equal(llamadas, 0, "consultó la API sabiendo que no entra");
  } finally {
    globalThis.fetch = original;
  }
});

test("matrizDistancias: convierte los nulls de Mapbox en Infinity y nunca lanza", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ distances: [[0, null], [null, 0]] }),
  });
  try {
    assert.deepEqual(await matrizDistancias([EMPRESA, CENTRO]), [
      [0, Infinity],
      [Infinity, 0],
    ]);
  } finally {
    globalThis.fetch = original;
  }

  for (const respuesta of [
    () => ({ ok: false, json: async () => ({}) }),
    () => ({ ok: true, json: async () => ({}) }),
    () => ({ ok: true, json: async () => ({ distances: "no es matriz" }) }),
    () => {
      throw new Error("sin señal");
    },
    () => ({ ok: true, json: async () => { throw new Error("json roto"); } }),
  ]) {
    globalThis.fetch = async () => respuesta();
    try {
      assert.equal(await matrizDistancias([EMPRESA, CENTRO]), null);
    } finally {
      globalThis.fetch = original;
    }
  }
});

// ----------------------------------------------------- obtenerRutaCalles
function fetchRutaFalsa(registro) {
  return async (url) => {
    const coords = String(url).split("/").pop().split("?")[0].split(";");
    registro.push(coords.length);
    // Un punto de geometría por coordenada pedida, para poder verificar el pegado.
    const coordenadas = coords.map((c) => c.split(",").map(Number));
    return {
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: { coordinates: coordenadas },
            distance: 1000 * (coords.length - 1),
            duration: 60 * (coords.length - 1),
          },
        ],
      }),
    };
  };
}

test("obtenerRutaCalles: una sola consulta cuando entra (<= 25 puntos)", async () => {
  const original = globalThis.fetch;
  const registro = [];
  globalThis.fetch = fetchRutaFalsa(registro);
  try {
    const puntos = [EMPRESA, ...alAzar(9, 21)];
    const r = await obtenerRutaCalles(puntos);
    assert.deepEqual(registro, [10]);
    assert.equal(r.geometria.length, 10);
    assert.equal(r.distanciaM, 9000);
    assert.equal(r.duracionS, 540);
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerRutaCalles: parte en tramos y pega el trazado sin duplicar ni perder puntos", async () => {
  const original = globalThis.fetch;
  const registro = [];
  globalThis.fetch = fetchRutaFalsa(registro);
  try {
    // 31 puntos = jornada de 30 paradas + la base.
    const puntos = [EMPRESA, ...alAzar(30, 31)];
    const r = await obtenerRutaCalles(puntos);
    assert.deepEqual(registro, [25, 7], "no partió en tramos de 25 con el punto de unión repetido");
    // 25 + 7 - 1 repetido = 31: todos los puntos, ninguno dos veces.
    assert.equal(r.geometria.length, 31);
    const vistos = new Set(r.geometria.map((c) => c.join(",")));
    assert.equal(vistos.size, 31, "el punto de unión quedó duplicado");
    assert.equal(r.distanciaM, 24000 + 6000);
    // El trazado empieza en la base y termina en la última parada.
    assert.deepEqual(r.geometria[0], [EMPRESA.lng, EMPRESA.lat]);
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerRutaCalles: cubre TODOS los tramos para tamaños de jornada variados", async () => {
  const original = globalThis.fetch;
  try {
    for (const n of [2, 24, 25, 26, 27, 49, 50, 51, 74]) {
      const registro = [];
      globalThis.fetch = fetchRutaFalsa(registro);
      const puntos = [EMPRESA, ...alAzar(n - 1, n)];
      const r = await obtenerRutaCalles(puntos);
      assert.equal(r.geometria.length, n, `con ${n} puntos el trazado quedó de ${r.geometria.length}`);
      assert.ok(registro.every((t) => t <= 25), `un tramo pidió ${Math.max(...registro)} puntos`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerRutaCalles: null (no un trazado a medias) si un tramo falla", async () => {
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (url) => {
    n++;
    if (n === 2) return { ok: false, json: async () => ({}) };
    return fetchRutaFalsa([])(url);
  };
  try {
    const r = await obtenerRutaCalles([EMPRESA, ...alAzar(30, 5)]);
    assert.equal(r, null, "devolvió media ruta: el chofer vería una línea cortada");
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerRutaCalles: sin token avisa fuerte (no degrada en silencio)", async () => {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  try {
    await assert.rejects(() => obtenerRutaCalles([EMPRESA, CENTRO]), /NEXT_PUBLIC_MAPBOX_TOKEN/);
  } finally {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = token;
  }
});

test("obtenerRutaCalles: menos de 2 puntos no consulta nada", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("no debería consultarse");
  };
  try {
    assert.equal(await obtenerRutaCalles([EMPRESA]), null);
    assert.equal(await obtenerRutaCalles([]), null);
  } finally {
    globalThis.fetch = original;
  }
});

// ----------------------------------------------------- obtenerNavegacion
function respuestaNavegacion() {
  return {
    ok: true,
    json: async () => ({
      routes: [
        {
          geometry: { coordinates: [[-70.29, -18.47], [-70.3, -18.48]] },
          legs: [
            {
              steps: [
                {
                  maneuver: { type: "depart", modifier: "left", instruction: "Salga a la izquierda" },
                  distance: 0,
                  geometry: { coordinates: [[-70.29, -18.47]] },
                  bannerInstructions: [{ primary: { text: "Chacabuco" } }],
                  voiceInstructions: [
                    { announcement: "cerca", distanceAlongGeometry: 50 },
                    { announcement: "lejos", distanceAlongGeometry: 300 },
                  ],
                },
                {
                  maneuver: { type: "turn", modifier: "right", instruction: "Gire a la derecha" },
                  distance: 240,
                  geometry: { coordinates: [[-70.295, -18.475], [-70.3, -18.48]] },
                },
              ],
            },
          ],
        },
      ],
    }),
  };
}

test("obtenerNavegacion: normaliza el rumbo para que Mapbox no rechace la consulta", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return respuestaNavegacion();
  };
  try {
    for (const rumbo of [0, 359.6, -45, 720, 400.4, NaN, null, undefined]) {
      urls.length = 0;
      await obtenerNavegacion(EMPRESA, CENTRO, rumbo);
      const bearings = urls
        .map((u) => new URL(u).searchParams.get("bearings"))
        .filter(Boolean);
      for (const b of bearings) {
        const grados = Number(b.split(",")[0]);
        assert.ok(
          Number.isInteger(grados) && grados >= 0 && grados < 360,
          `bearings inválido para rumbo ${rumbo}: ${b}`,
        );
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerNavegacion: si el rumbo deja la consulta sin camino, reintenta sin rumbo", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return { ok: false, json: async () => ({}) };
    return respuestaNavegacion();
  };
  try {
    const r = await obtenerNavegacion(EMPRESA, CENTRO, 90);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes("bearings"));
    assert.ok(!urls[1].includes("bearings"), "el reintento debe ir sin rumbo");
    assert.equal(r.pasos.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerNavegacion: avisos de voz del más lejano al más cercano", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => respuestaNavegacion();
  try {
    const r = await obtenerNavegacion(EMPRESA, CENTRO, 90);
    assert.deepEqual(
      r.pasos[0].avisos.map((a) => a.aMetros),
      [300, 50],
    );
    assert.equal(r.pasos[0].banner, "Chacabuco");
    assert.equal(r.pasos[1].banner, null);
    assert.equal(r.pasos[1].distanciaM, 240);
  } finally {
    globalThis.fetch = original;
  }
});

test("obtenerNavegacion: se traga cualquier fallo (corre en bucle mientras el chofer maneja)", async () => {
  const original = globalThis.fetch;
  for (const respuesta of [
    () => { throw new Error("sin señal"); },
    () => ({ ok: false, json: async () => ({}) }),
    () => ({ ok: true, json: async () => ({}) }),
    () => ({ ok: true, json: async () => ({ routes: [{}] }) }),
    () => ({ ok: true, json: async () => ({ routes: [{ legs: [{}] }] }) }),
  ]) {
    globalThis.fetch = async () => respuesta();
    try {
      assert.equal(await obtenerNavegacion(EMPRESA, CENTRO, 90), null);
    } finally {
      globalThis.fetch = original;
    }
  }
});

test("obtenerNavegacion sin token no revienta la pantalla del chofer", async () => {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  try {
    assert.equal(await obtenerNavegacion(EMPRESA, CENTRO, 90), null);
  } finally {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = token;
  }
});

test("las consultas de ruta van con continue_straight=false (el bug de las vueltas a la manzana)", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return respuestaNavegacion();
  };
  try {
    await obtenerNavegacion(EMPRESA, CENTRO, null);
    assert.equal(new URL(urls[0]).searchParams.get("continue_straight"), "false");
    assert.equal(new URL(urls[0]).searchParams.get("language"), "es");
  } finally {
    globalThis.fetch = original;
  }
});
