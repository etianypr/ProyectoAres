// Spec 024: los bultos fuera del auto lo antes posible, casi sin manejar de más.
//
// El orden sigue siendo el de menos km. Lo que se prueba es la pasada de encima
// (orden-paradas/descarga.ts): adelanta bultos cuando sale casi gratis, nunca se
// pasa de la tolerancia de km.
import test from "node:test";
import assert from "node:assert/strict";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { adelantarBultos, esperaDeLosBultos } from "@/lib/rutas/orden-paradas/descarga";
import { conFinal, distanciaOrden } from "@/lib/rutas/orden-paradas/costo";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { ordenarConSentido } from "@/lib/encomiendas/local/generar-ruta/sentido";

/** 4 min por parada a 25 km/h, como planificar.ts. */
const METROS_POR_PARADA = (4 * 25 * 1000) / 60;
const BASE = { lat: -18.4783, lng: -70.2979 };
/** Metros a grados de longitud en Arica. */
const LNG_POR_M = 1 / (111_320 * Math.cos((BASE.lat * Math.PI) / 180));
const LAT_POR_M = 1 / 111_320;

const enLinea = (puntos) => (a, b) => distanciaMetros(puntos[a], puntos[b]);
const cerrada = (puntos) => conFinal(enLinea(puntos), (i) => distanciaMetros(puntos[i], puntos[0]));

/** Una parada suelta a 900 m al este y un barrio de cinco a 1 km al oeste. */
function sueltaYBarrio() {
  const puntos = [BASE, { lat: BASE.lat, lng: BASE.lng + 900 * LNG_POR_M }];
  for (let k = 0; k < 5; k++) {
    puntos.push({ lat: BASE.lat + k * 30 * LAT_POR_M, lng: BASE.lng - 1000 * LNG_POR_M });
  }
  return puntos;
}

test("esperaDeLosBultos: lo manejado hasta cada parada y las paradas de antes, por bulto", () => {
  const metros = (a, b) => Math.abs(a - b) * 100;
  // 0 → 1 (100 m, 2 bultos) → 2 (100 m más, 1 bulto): 2 × 100 + 1 × (200 + 50).
  assert.equal(esperaDeLosBultos([0, 1, 2], metros, [0, 2, 1], 50), 450);
});

test("a igual km, la ruta cerrada arranca por el barrio y no por la parada suelta", () => {
  const puntos = sueltaYBarrio();
  const vuelta = (i) => distanciaMetros(puntos[i], BASE);
  const sinBultos = ordenarParadas(puntos, null, vuelta);
  assert.equal(sinBultos[1], 1, "sin bultos, a igual km se arranca por la más cercana (la suelta)");

  const descarga = { bultos: [0, 1, 1, 1, 1, 1, 1], matrizReal: null, tolerancia: 0.01, metrosPorParada: METROS_POR_PARADA };
  const conBultos = ordenarParadas(puntos, null, vuelta, false, { descarga });
  assert.notEqual(conBultos[1], 1, "con bultos, primero el barrio: cinco bultos fuera antes de cruzar");
  assert.equal(conBultos[conBultos.length - 1], 1, "la suelta queda al final");
  const costo = cerrada(puntos);
  assert.ok(Math.abs(distanciaOrden(conBultos, costo) - distanciaOrden(sinBultos, costo)) < 1, "los mismos km");
});

test("adelantar los bultos no maneja más de la tolerancia", () => {
  // Al revés se maneja 3,3 % más (un sentido único), y al revés se dejarían los
  // cinco bultos de la parada 2 primero.
  const m = [
    [0, 1000, 1000],
    [1000, 0, 1000],
    [1000, 1100, 0],
  ];
  const puntos = [BASE, BASE, BASE];
  const vuelta = (i) => m[i][0];
  const descarga = (tolerancia) => ({ bultos: [0, 1, 5], matrizReal: null, tolerancia, metrosPorParada: METROS_POR_PARADA });
  assert.deepEqual(ordenarParadas(puntos, m, vuelta), [0, 1, 2]);
  assert.deepEqual(ordenarParadas(puntos, m, vuelta, false, { descarga: descarga(0.01) }), [0, 1, 2], "1 %: no alcanza");
  assert.deepEqual(ordenarParadas(puntos, m, vuelta, false, { descarga: descarga(0.05) }), [0, 2, 1], "5 %: sí");
});

test("de dos paradas en el mismo lugar, primero la de más bultos", () => {
  const puntos = [BASE, { lat: BASE.lat - 0.004, lng: BASE.lng }, { lat: BASE.lat - 0.004, lng: BASE.lng }, { lat: BASE.lat - 0.008, lng: BASE.lng }];
  const vuelta = (i) => distanciaMetros(puntos[i], BASE);
  for (const bultos of [[0, 1, 3, 1], [0, 3, 1, 1]]) {
    const orden = ordenarParadas(puntos, null, vuelta, false, {
      descarga: { bultos, matrizReal: null, tolerancia: 0.01, metrosPorParada: METROS_POR_PARADA },
    });
    const pesada = bultos.indexOf(3);
    const liviana = pesada === 1 ? 2 : 1;
    assert.ok(orden.indexOf(pesada) < orden.indexOf(liviana), `bultos ${bultos}: ${orden}`);
  }
});

// ---------------------------------------------------------------------------
// Días al azar: lo que la pasada nunca hace
// ---------------------------------------------------------------------------

function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Barrios de Arica con algunas paradas sueltas, y una matriz por calles con
 *  rodeo por par y una parte por sentido (los sentidos únicos). */
function diaConBarrios(n, semilla) {
  const r = azar(semilla);
  const centros = Array.from({ length: 8 + Math.floor(r() * 6) }, () => ({ lat: -18.44 - r() * 0.07, lng: -70.26 - r() * 0.08 }));
  const puntos = [{ lat: -18.471152, lng: -70.289929 }];
  const bultos = [0];
  while (puntos.length < n) {
    const c = centros[Math.floor(r() * centros.length)];
    const suelta = r() < 0.08;
    puntos.push(
      suelta
        ? { lat: -18.43 - r() * 0.09, lng: -70.25 - r() * 0.1 }
        : { lat: c.lat + (r() - 0.5) * 0.008, lng: c.lng + (r() - 0.5) * 0.008 },
    );
    bultos.push(r() < 0.2 ? 2 : 1);
  }
  const rodeo = puntos.map(() => puntos.map(() => 0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) rodeo[i][j] = rodeo[j][i] = 1.15 + r() * 0.5;
  const m = puntos.map((a, i) => puntos.map((b, j) => (i === j ? 0 : distanciaMetros(a, b) * rodeo[i][j] * (0.93 + r() * 0.14))));
  return { puntos, bultos, m };
}

test("en días al azar: nunca más de 1 % de km y nunca más espera", () => {
  for (const [n, semilla] of [[30, 3], [45, 7], [60, 11], [60, 23], [75, 31], [90, 41]]) {
    const { puntos, bultos, m } = diaConBarrios(n, semilla);
    const vuelta = (i) => m[i][0];
    const metros = conFinal((a, b) => m[a][b], vuelta);
    const corta = ordenarParadas(puntos, m, vuelta);
    const conBultos = adelantarBultos(corta, metros, { bultos, metros, tolerancia: 0.01, metrosPorParada: METROS_POR_PARADA });

    assert.deepEqual([...conBultos].sort((a, b) => a - b), puntos.map((_, i) => i), `día ${semilla}: todas una vez`);
    assert.equal(conBultos[0], 0, `día ${semilla}: parte de la base`);
    assert.ok(distanciaOrden(conBultos, metros) <= distanciaOrden(corta, metros) * 1.01 + 1e-6, `día ${semilla}: km`);
    assert.ok(
      esperaDeLosBultos(conBultos, metros, bultos, METROS_POR_PARADA) <= esperaDeLosBultos(corta, metros, bultos, METROS_POR_PARADA),
      `día ${semilla}: espera`,
    );
  }
});

test("con 0 de tolerancia, adelantar bultos no maneja ni un metro más", () => {
  const { puntos, m } = diaConBarrios(40, 5);
  const vuelta = (i) => m[i][0];
  const corta = ordenarParadas(puntos, m, vuelta);
  const conBultos = ordenarParadas(puntos, m, vuelta, false, {
    descarga: { bultos: puntos.map((_, i) => (i ? 1 : 0)), matrizReal: m, tolerancia: 0, metrosPorParada: METROS_POR_PARADA },
  });
  const metros = conFinal((a, b) => m[a][b], vuelta);
  assert.ok(distanciaOrden(conBultos, metros) <= distanciaOrden(corta, metros) + 1e-6);
});

// ---------------------------------------------------------------------------
// La mejora por sentido de calles no vuelve a dibujar por los bultos
// ---------------------------------------------------------------------------

test("ordenarConSentido: un orden que cambió solo por los bultos no pide otro trazado; uno más corto sí", async (t) => {
  process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";
  const fetchOriginal = globalThis.fetch;
  let consultas = 0;
  globalThis.fetch = async () => {
    consultas++;
    return new Response("no", { status: 503 });
  };
  t.after(() => (globalThis.fetch = fetchOriginal));

  // Calles estrechas (no se da la vuelta): «Liviano» (1 bulto) y «Pesado» (3) en
  // la misma casa al norte, y «Fondo» al este.
  const casa = { lat: BASE.lat + 400 * LAT_POR_M, lng: BASE.lng };
  const paradas = [
    { id: "liviano", ...casa, bultos: 1 },
    { id: "pesado", ...casa, bultos: 3 },
    { id: "fondo", lat: BASE.lat, lng: BASE.lng + 800 * LNG_POR_M, bultos: 1 },
  ];
  const puntos = [BASE, ...paradas];
  const matriz = puntos.map((a) => puntos.map((b) => distanciaMetros(a, b)));
  const indice = new Map(paradas.map((p, i) => [p.id, i + 1]));
  const estrecha = { clase: "residential", eje: 0, extraM: 200 };
  const calles = { trazado: [], distanciaM: 1600, duracionS: 300, puntos: [null, estrecha, estrecha, estrecha] };
  const descarga = { matriz, tolerancia: 0.01 };

  // Mismos km: solo se adelanta el de tres bultos. No vale otro trazado.
  assert.equal(await ordenarConSentido(BASE, paradas, indice, matriz, calles, BASE, descarga), null);
  assert.equal(consultas, 0, "sin consultas");

  // Un orden de partida más largo (de la casa a «Fondo» y de vuelta a la casa):
  // la mejora sí se vuelve a dibujar.
  const desordenadas = [paradas[0], paradas[2], paradas[1]];
  await ordenarConSentido(BASE, desordenadas, indice, matriz, calles, BASE, descarga);
  assert.ok(consultas > 0, "el más corto se dibuja para confirmarlo");
});
