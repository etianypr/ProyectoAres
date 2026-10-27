// Rutas al siguiente nivel (spec 017, US3): la matriz de calles por bloques (R1)
// y el optimizador con horarios (R2, R5). Mapbox se reemplaza con un doble de
// fetch que contesta la línea recta × 1,2 para los orígenes y destinos pedidos.
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.token-de-prueba";

import test from "node:test";
import assert from "node:assert/strict";
import { distanciaMetros } from "@/lib/geo/coordenada";
import {
  elementos,
  matrizCalles,
  olvidarMatriz,
  planificarConsultas,
} from "@/lib/geo/mapbox/matriz";
import { evaluar, optimizarConHorarios } from "@/lib/rutas/orden-paradas/con-horarios";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { optimizarSinCongelar } from "@/lib/rutas/orden-paradas/sin-congelar";

function alAzar(n, semilla = 1) {
  let s = semilla;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, () => ({ lat: -18.44 - rnd() * 0.07, lng: -70.26 - rnd() * 0.08 }));
}

const cupoLibre = () => ({ disponible: () => Infinity, gastar() {} });

/** Doble de la Matrix API. `sinCamino(i, j)` = null para ese par. */
function mapboxFalso({ registro = [], falla = () => false, sinCamino = () => false } = {}) {
  return async (url) => {
    const u = new URL(String(url));
    const coords = u.pathname.split("/").pop().split(";").map((c) => {
      const [lng, lat] = c.split(",").map(Number);
      return { lat, lng };
    });
    assert.ok(coords.length <= 25, `una consulta llevó ${coords.length} coordenadas`);
    const origenes = u.searchParams.get("sources").split(";").map(Number);
    const destinos = u.searchParams.get("destinations").split(";").map(Number);
    registro.push({ coords: coords.length, elementos: origenes.length * destinos.length });
    if (falla(registro.length)) return { ok: false, json: async () => ({}) };
    return {
      ok: true,
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
test("planificarConsultas: la primera vez, cada par una sola vez y nunca hacia la partida", () => {
  const n = 61;
  const faltan = new Set();
  for (let i = 0; i < n; i++) for (let j = 1; j < n; j++) if (i !== j) faltan.add(i * n + j);
  const consultas = planificarConsultas(n, faltan);

  const vistos = new Map();
  for (const c of consultas) {
    assert.ok(new Set([...c.origenes, ...c.destinos]).size <= 25);
    assert.ok(!c.destinos.includes(0), "pidió llegar a la partida");
    for (const i of c.origenes) for (const j of c.destinos) vistos.set(i * n + j, (vistos.get(i * n + j) ?? 0) + 1);
  }
  for (const k of faltan) assert.equal(vistos.get(k), 1, `el par ${k} se pidió ${vistos.get(k) ?? 0} veces`);
  const total = consultas.reduce((s, c) => s + elementos(c), 0);
  // n × (n - 1): los únicos de más son los n - 1 de cada punto a sí mismo.
  assert.equal(total, n * (n - 1));
  assert.ok(consultas.length <= 30, `${consultas.length} consultas`);
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
  faltan.delete(p * n + 0); // nunca hacia la partida
  const consultas = planificarConsultas(n, faltan);
  const total = consultas.reduce((s, c) => s + elementos(c), 0);
  assert.equal(total, faltan.size);
  assert.ok(consultas.length <= 6, `${consultas.length} consultas para un pedido`);
});

// ----------------------------------------------------------- R1: matrizCalles
test("matrizCalles: con 61 puntos arma la matriz completa por bloques", async () => {
  olvidarMatriz();
  const puntos = alAzar(61, 3);
  const registro = [];
  const r = await conFetch(mapboxFalso({ registro }), () => matrizCalles(puntos, cupoLibre()));
  assert.ok(r.metros, "no armó la matriz");
  assert.equal(r.completa, true);
  assert.equal(r.metros.length, 61);
  const err = Math.abs(r.metros[5][40] - distanciaMetros(puntos[5], puntos[40]) * 1.2);
  assert.ok(err < 1e-6, "el par no es el que contestó Mapbox");
  assert.equal(r.pedidos, 61 * 60);
  assert.ok(registro.length <= 30);
});

test("matrizCalles: rehacer con los mismos puntos no consulta; un pedido más pide ~2n", async () => {
  olvidarMatriz();
  const puntos = alAzar(40, 5);
  await conFetch(mapboxFalso(), () => matrizCalles(puntos, cupoLibre()));

  const otra = [];
  const r = await conFetch(mapboxFalso({ registro: otra }), () => matrizCalles(puntos, cupoLibre()));
  assert.equal(otra.length, 0, "volvió a pedir lo que ya tenía");
  assert.equal(r.pedidos, 0);

  const nuevo = { lat: -18.47, lng: -70.3 };
  const mas = [];
  const r2 = await conFetch(mapboxFalso({ registro: mas }), () => matrizCalles([...puntos, nuevo], cupoLibre()));
  assert.ok(r2.pedidos <= 2 * 41, `un pedido nuevo pidió ${r2.pedidos} elementos`);
  assert.ok(mas.length <= 4);
});

test("matrizCalles: un par sin camino vale caro pero FINITO (R3)", async () => {
  olvidarMatriz();
  const puntos = alAzar(6, 9);
  const aislado = puntos[3];
  const r = await conFetch(
    mapboxFalso({ sinCamino: (a, b) => a.lat === aislado.lat || b.lat === aislado.lat }),
    () => matrizCalles(puntos, cupoLibre()),
  );
  assert.ok(Number.isFinite(r.metros[1][3]) && r.metros[1][3] > 20_000);
  // Con el costo finito, el orden se sigue optimizando.
  const orden = ordenarParadas(puntos, r.metros);
  assert.equal(new Set(orden).size, 6);
});

test("matrizCalles: sin cupo no consulta nada y lo dice", async () => {
  olvidarMatriz();
  const registro = [];
  let gastado = 0;
  const cupo = { disponible: () => 100, gastar: (n) => (gastado += n) };
  const r = await conFetch(mapboxFalso({ registro }), () => matrizCalles(alAzar(20, 2), cupo));
  assert.equal(r.metros, null);
  assert.equal(r.motivo, "cupo");
  assert.equal(registro.length, 0);
  assert.equal(gastado, 0);
});

test("matrizCalles: descuenta del cupo solo lo que llegó; sin red avisa", async () => {
  olvidarMatriz();
  let gastado = 0;
  const cupo = { disponible: () => 1_000_000, gastar: (n) => (gastado += n) };
  const puntos = alAzar(30, 4);
  const r = await conFetch(mapboxFalso({ falla: (k) => k === 2 }), () => matrizCalles(puntos, cupo));
  assert.equal(r.completa, false, "un bloque no llegó y no lo dijo");
  assert.equal(gastado, r.pedidos);
  assert.ok(r.metros.every((fila) => fila.every(Number.isFinite)), "un par sin dato quedó sin estimar");

  olvidarMatriz();
  const sinRed = await conFetch(async () => {
    throw new Error("sin señal");
  }, () => matrizCalles(puntos, cupo));
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
