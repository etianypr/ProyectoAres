// Rutas al siguiente nivel (spec 017, US3): la matriz de calles por bloques (R1)
// y el optimizador con horarios (R2, R5). OpenRouteService se reemplaza con un
// doble de fetch que contesta la línea recta × 1,2 para los orígenes y destinos
// pedidos.
process.env.NEXT_PUBLIC_ORS_KEY = "ors.clave-de-prueba";

import test from "node:test";
import assert from "node:assert/strict";
import { distanciaMetros } from "@/lib/geo/coordenada";
import {
  elementos,
  matrizCalles,
  olvidarMatriz,
  planificarConsultas,
} from "@/lib/geo/matriz";
import { evaluar, optimizarConHorarios } from "@/lib/rutas/orden-paradas/con-horarios";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { optimizarSinCongelar } from "@/lib/rutas/orden-paradas/sin-congelar";

function alAzar(n, semilla = 1) {
  let s = semilla;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, () => ({ lat: -18.44 - rnd() * 0.07, lng: -70.26 - rnd() * 0.08 }));
}

/** ORS acepta 3.500 pares por consulta (verificado: 60 × 60 devuelve 400). */
const MAX_PARES = 3_500;

/** Doble de la Matrix API de ORS. `sinCamino(a, b)` = null para ese par;
 *  `estado(k)` = el código HTTP de la consulta k (200 si no dice nada). */
function orsFalso({ registro = [], estado = () => 200, sinCamino = () => false } = {}) {
  return async (url, init) => {
    assert.match(String(url), /api\.openrouteservice\.org\/v2\/matrix\/driving-car/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "ors.clave-de-prueba");
    const cuerpo = JSON.parse(init.body);
    const coords = cuerpo.locations.map(([lng, lat]) => ({ lat, lng }));
    const origenes = cuerpo.sources;
    const destinos = cuerpo.destinations;
    assert.ok(origenes.length * destinos.length <= MAX_PARES, `una consulta pidió ${origenes.length * destinos.length} pares`);
    registro.push({ coords: coords.length, elementos: origenes.length * destinos.length });
    const status = estado(registro.length);
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    return {
      ok: true,
      status,
      json: async () => ({
        distances: origenes.map((i) =>
          destinos.map((j) => (sinCamino(coords[i], coords[j]) ? null : distanciaMetros(coords[i], coords[j]) * 1.2)),
        ),
      }),
    };
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

// ------------------------------------------------------------- R1: consultas
test("planificarConsultas: la primera vez, cada par una sola vez, también la vuelta a la partida", () => {
  const n = 67;
  const faltan = new Set();
  // La ruta es cerrada (terreno 2026-10-28): volver a la partida (j = 0) se pide.
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) faltan.add(i * n + j);
  const consultas = planificarConsultas(n, faltan);

  const vistos = new Map();
  for (const c of consultas) {
    assert.ok(elementos(c) <= MAX_PARES);
    for (const i of c.origenes) for (const j of c.destinos) vistos.set(i * n + j, (vistos.get(i * n + j) ?? 0) + 1);
  }
  for (const k of faltan) assert.equal(vistos.get(k), 1, `el par ${k} se pidió ${vistos.get(k) ?? 0} veces`);
  const total = consultas.reduce((s, c) => s + elementos(c), 0);
  // n × n: los únicos de más son los de cada punto a sí mismo.
  assert.equal(total, n * n);
  // Un día de 67 puntos son 2 consultas de las 500 gratis del día.
  assert.equal(consultas.length, 2);
});

test("planificarConsultas: un pedido nuevo pide solo su fila y su columna", () => {
  const n = 61;
  const p = 37;
  const faltan = new Set();
  for (let x = 0; x < n; x++) {
    if (x === p) continue;
    faltan.add(p * n + x);
    faltan.add(x * n + p);
  }
  const consultas = planificarConsultas(n, faltan);
  const total = consultas.reduce((s, c) => s + elementos(c), 0);
  assert.equal(total, faltan.size);
  assert.equal(consultas.length, 2, `${consultas.length} consultas para un pedido`);
});

// ----------------------------------------------------------- R1: matrizCalles
test("matrizCalles: con 61 puntos arma la matriz completa por bloques", async () => {
  olvidarMatriz();
  const puntos = alAzar(61, 3);
  const registro = [];
  const r = await conFetch(orsFalso({ registro }), () => matrizCalles(puntos));
  assert.ok(r.metros, "no armó la matriz");
  assert.equal(r.completa, true);
  assert.equal(r.metros.length, 61);
  const err = Math.abs(r.metros[5][40] - distanciaMetros(puntos[5], puntos[40]) * 1.2);
  assert.ok(err < 1e-6, "el par no es el que contestó ORS");
  assert.equal(r.pedidos, 61 * 61, "con la vuelta a la partida");
  assert.equal(registro.length, 2);
});

test("matrizCalles: rehacer con los mismos puntos no consulta; un pedido más pide ~2n", async () => {
  olvidarMatriz();
  const puntos = alAzar(40, 5);
  await conFetch(orsFalso(), () => matrizCalles(puntos));

  const otra = [];
  const r = await conFetch(orsFalso({ registro: otra }), () => matrizCalles(puntos));
  assert.equal(otra.length, 0, "volvió a pedir lo que ya tenía");
  assert.equal(r.pedidos, 0);

  const nuevo = { lat: -18.47, lng: -70.3 };
  const mas = [];
  const r2 = await conFetch(orsFalso({ registro: mas }), () => matrizCalles([...puntos, nuevo]));
  assert.ok(r2.pedidos <= 2 * 41, `un pedido nuevo pidió ${r2.pedidos} pares`);
  assert.ok(mas.length <= 2);
});

test("matrizCalles: un par sin camino vale caro pero FINITO (R3)", async () => {
  olvidarMatriz();
  const puntos = alAzar(6, 9);
  const aislado = puntos[3];
  const r = await conFetch(
    orsFalso({ sinCamino: (a, b) => a.lat === aislado.lat || b.lat === aislado.lat }),
    () => matrizCalles(puntos),
  );
  assert.ok(Number.isFinite(r.metros[1][3]) && r.metros[1][3] > 20_000);
  // Con el costo finito, el orden se sigue optimizando.
  const orden = ordenarParadas(puntos, r.metros);
  assert.equal(new Set(orden).size, 6);
});

test("matrizCalles: sin clave de ORS no consulta nada y lo dice", async () => {
  olvidarMatriz();
  const clave = process.env.NEXT_PUBLIC_ORS_KEY;
  delete process.env.NEXT_PUBLIC_ORS_KEY;
  try {
    const registro = [];
    const r = await conFetch(orsFalso({ registro }), () => matrizCalles(alAzar(20, 2)));
    assert.equal(r.metros, null);
    assert.equal(r.motivo, "sin_token");
    assert.equal(registro.length, 0);
  } finally {
    process.env.NEXT_PUBLIC_ORS_KEY = clave;
  }
});

test("matrizCalles: si ORS dice que se acabaron las consultas del día, lo dice (nunca cobra)", async () => {
  olvidarMatriz();
  const r = await conFetch(orsFalso({ estado: () => 429 }), () => matrizCalles(alAzar(20, 2)));
  assert.equal(r.metros, null);
  assert.equal(r.motivo, "cupo");
});

test("matrizCalles: si una consulta no llega, esos pares van estimados; sin red avisa", async () => {
  olvidarMatriz();
  const puntos = alAzar(67, 4);
  const r = await conFetch(orsFalso({ estado: (k) => (k === 2 ? 503 : 200) }), () => matrizCalles(puntos));
  assert.equal(r.completa, false, "una consulta no llegó y no lo dijo");
  assert.ok(r.pedidos > 0 && r.pedidos < 67 * 67);
  assert.ok(r.metros.every((fila) => fila.every(Number.isFinite)), "un par sin dato quedó sin estimar");

  olvidarMatriz();
  const sinRed = await conFetch(async () => {
    throw new Error("sin señal");
  }, () => matrizCalles(puntos));
  assert.equal(sinRed.metros, null);
  assert.equal(sinRed.motivo, "sin_respuesta");
});

// ------------------------------------------------- R2: optimizador con horarios
const BLOQUES = [
  { abre: 600, cierra: 720 },
  { abre: 720, cierra: 840 },
  { abre: 840, cierra: 960 },
  { abre: 960, cierra: 1080 },
];

function diaDePrueba(n, conBloque, semilla) {
  const puntos = alAzar(n, semilla);
  let s = semilla * 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const metros = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) metros[i * n + j] = distanciaMetros(puntos[i], puntos[j]) * 1.3;
  const matriz = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => metros[i * n + j]));
  const ventanas = puntos.map((_, i) => (i > 0 && i <= conBloque ? BLOQUES[Math.floor(rnd() * 4)] : null));
  return { puntos, matriz, dia: { metros, n, ventanas, inicio: 9 * 60, kmh: 25, servicio: 4 } };
}

test("optimizarConHorarios: con 60 paradas y 15 bloques, llega a todos y es rápido", () => {
  const { puntos, matriz, dia } = diaDePrueba(61, 15, 21);
  const corta = ordenarParadas(puntos, matriz);
  const t0 = performance.now();
  const orden = optimizarConHorarios([corta], dia);
  const ms = performance.now() - t0;
  assert.equal(new Set(orden).size, 61);
  assert.equal(orden[0], 0);
  const r = evaluar(orden, dia);
  assert.equal(Math.round(r.fuera), 0, `quedaron ${Math.round(r.fuera)} minutos fuera de bloque`);
  assert.ok(evaluar(corta, dia).fuera > 0, "el caso de prueba no tenía nada que arreglar");
  assert.ok(ms < 3000, `tardó ${Math.round(ms)} ms`);
});

test("optimizarConHorarios: nunca peor que el mejor arranque, y el mismo día da el mismo orden", () => {
  for (const semilla of [1, 2, 3, 4, 5]) {
    const { puntos, matriz, dia } = diaDePrueba(25, 6, semilla);
    const corta = ordenarParadas(puntos, matriz);
    const a = optimizarConHorarios([corta], dia);
    const b = optimizarConHorarios([corta], dia);
    assert.deepEqual(a, b, "no es determinista");
    assert.ok(evaluar(a, dia).costo <= evaluar(corta, dia).costo + 1e-6);
  }
});

test("optimizarSinCongelar: por partes da el MISMO orden que de un tirón (R5)", async () => {
  const { puntos, matriz, dia } = diaDePrueba(40, 10, 13);
  const corta = ordenarParadas(puntos, matriz);
  let cedio = 0;
  const intervalo = setInterval(() => cedio++, 0);
  const porPartes = await optimizarSinCongelar([corta], dia);
  clearInterval(intervalo);
  assert.deepEqual(porPartes, optimizarConHorarios([corta], dia));
  assert.ok(cedio > 0, "no le devolvió el turno a la pantalla ni una vez");
});

test("optimizarConHorarios: sin bloques no alarga la ruta más corta", () => {
  const { puntos, matriz, dia } = diaDePrueba(30, 0, 8);
  const corta = ordenarParadas(puntos, matriz);
  const orden = optimizarConHorarios([corta], dia);
  assert.ok(evaluar(orden, dia).metros <= evaluar(corta, dia).metros + 1e-6);
});

test("evaluar: pasadas las 18:00 cuesta caro", () => {
  const { dia } = diaDePrueba(5, 0, 2);
  const temprano = evaluar([0, 1, 2, 3, 4], dia);
  const tarde = evaluar([0, 1, 2, 3, 4], { ...dia, inicio: 17 * 60 + 55 });
  assert.equal(temprano.tarde, 0);
  assert.ok(tarde.tarde > 0 && tarde.costo > temprano.costo + 5000);
});
