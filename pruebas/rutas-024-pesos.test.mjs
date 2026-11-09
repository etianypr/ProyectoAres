// Spec 024: el orden cobra km y tiempo en plata (dueño, 2026-11-08: el km a $130 y
// la hora al volante a $6.000; generar-ruta/pesos.ts).
//
// Lo que se prueba: la matriz de costo (sin tiempos es la de siempre), que con la
// matriz real de un día simulado la ruta tarda menos casi sin manejar más, que la
// pasada de bultos no se come lo ganado en tiempo, que la recomendada se elige por
// costo y, de punta a punta, que calcularRutaLocal pide el tiempo a ORS y lo usa.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { adelantarBultos } from "@/lib/rutas/orden-paradas/descarga";
import { conFinal } from "@/lib/rutas/orden-paradas/costo";
import { matrizDeCosto, METROS_POR_SEGUNDO, pesosDeManejar } from "@/lib/encomiendas/local/generar-ruta/pesos";
import { matrizPorZonas, zonasPorCercania } from "@/lib/encomiendas/local/generar-ruta/zonas";
import { elegirUtiles } from "@/lib/encomiendas/local/generar-ruta/estrategias";
import { calcularRutaLocal } from "@/lib/encomiendas/local/generar-ruta";
import { guardarPedido } from "@/lib/encomiendas/local/almacen";
import { olvidarMatriz } from "@/lib/geo/matriz";

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));

test("pesosDeManejar: un km a $130 y una hora a $6.000", () => {
  assert.equal(pesosDeManejar(1000, 0), 130);
  assert.equal(pesosDeManejar(0, 3600), 6000);
  // Un segundo vale lo mismo que ~12,8 m de bencina.
  assert.ok(Math.abs(pesosDeManejar(METROS_POR_SEGUNDO, 0) - pesosDeManejar(0, 1)) < 1e-9);
});

test("matrizDeCosto: sin tiempos, los metros tal cual (el orden de antes)", () => {
  const metros = [
    [0, 100],
    [120, 0],
  ];
  assert.equal(matrizDeCosto(metros, null), metros);
  assert.equal(matrizDeCosto(metros, [[0, null], [null, 0]]), metros);
});

test("matrizDeCosto: el tramo lento cuesta más, el promedio queda en metros y el par sin tiempo va a la velocidad media", () => {
  // 0→1 y 0→2 miden lo mismo; 0→2 tarda el triple.
  const metros = [
    [0, 1000, 1000],
    [1000, 0, 1000],
    [1000, 1000, 0],
  ];
  const segundos = [
    [0, 100, 300],
    [100, 0, null],
    [100, 100, 0],
  ];
  const c = matrizDeCosto(metros, segundos);
  assert.ok(c[0][2] > c[0][1], "el tramo lento cuesta más");
  const fuera = (m) => m.flatMap((f, i) => f.filter((_, j) => i !== j));
  const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(promedio(fuera(c)) - promedio(fuera(metros))) < 1e-6, "misma escala que los metros");
  // Sin tiempo, 1→2 se estima a la velocidad media de los demás: 700 s en 5.000 m.
  assert.ok(Math.abs(c[1][2] - c[0][1] * ((1000 + METROS_POR_SEGUNDO * 140) / (1000 + METROS_POR_SEGUNDO * 100))) < 1e-6);
  assert.equal(c[1][1], 0);
});

test("con la matriz real de un día de 80 paradas: menos tiempo y menos plata, casi sin km de más", () => {
  // Como ordenarGrupo (estrategias.ts): el costo con zonas, y el mejor orden por
  // metros con zonas como un arranque más.
  const { puntos, metros, segundos } = DIA;
  const zonas = zonasPorCercania(metros);
  const conZonas = (m) => matrizPorZonas(m, zonas);
  const ordenar = (m, extra) => ordenarParadas(puntos, conZonas(m), (i) => m[i][0], true, extra);
  const medir = (orden) => {
    let m = 0;
    let s = 0;
    for (let k = 1; k <= orden.length; k++) {
      const a = orden[k - 1];
      const b = k < orden.length ? orden[k] : 0;
      m += metros[a][b];
      s += segundos[a][b];
    }
    return { m, s, pesos: pesosDeManejar(m, s) };
  };
  const porKm = medir(ordenar(metros));
  const costo = matrizDeCosto(metros, segundos);
  const porCosto = medir(ordenar(costo, { arranquePorMetros: { matriz: conZonas(metros), vuelta: (i) => metros[i][0] } }));
  assert.ok(porCosto.pesos < porKm.pesos, `cuesta ${Math.round(porCosto.pesos)} y no menos que ${Math.round(porKm.pesos)}`);
  assert.ok(porCosto.s < porKm.s, "tarda menos");
  assert.ok(porCosto.m <= porKm.m * 1.01, `maneja ${porCosto.m} m contra ${porKm.m} m: más de 1 %`);
});

test("los bultos se adelantan si el costo sube menos de 1 %, y no si sube más", () => {
  // Al revés se dejan primero los cinco bultos de la 2 y se manejan los mismos
  // metros; lo único que cambia es el tiempo de 0→2.
  const metros = [
    [0, 1000, 1000],
    [1000, 0, 1000],
    [1000, 1000, 0],
  ];
  const vuelta = (i) => metros[i][0];
  const conTiempo = (lento) => {
    const base = metros.map((f, i) => f.map((m, j) => (i === 0 && j === 2 ? m + lento : m)));
    const c = conFinal((a, b) => base[a][b], vuelta);
    return adelantarBultos([0, 1, 2], c, {
      bultos: [0, 1, 5],
      tolerancia: 0.01,
      metrosPorParada: 1667,
      metros: conFinal((a, b) => metros[a][b], vuelta),
      base: c,
    });
  };
  // +0,5 %: casi gratis, como pidió el dueño. Antes el tiempo contaba como algo
  // "cobrado aparte" (zonas, sentido) y cualquier subida, por chica, lo frenaba.
  assert.deepEqual(conTiempo(15), [0, 2, 1]);
  // +6,7 %: no.
  assert.deepEqual(conTiempo(200), [0, 1, 2]);
});

test("los bultos mueven un barrio entero cuando el costo no son metros", () => {
  // Dos barrios de cuatro: A = 1–4 (un bulto cada uno) y B = 5–8 (tres cada uno).
  // Dentro de cada barrio se avanza en un sentido (al revés, 2 km por tramo), así
  // que lo único que adelanta a B sin manejar más es moverlo entero: de a una a
  // tres paradas lo partiría. El costo es el doble de los metros (el tiempo) y el
  // orden cobra 3.000 por cambiar de barrio.
  const n = 9;
  const zona = [-1, 0, 0, 0, 0, 1, 1, 1, 1];
  const metros = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => {
      if (i === j) return 0;
      if (i === 0 || j === 0) return 1000;
      if (zona[i] === zona[j]) return j === i + 1 ? 100 : 2000;
      return (i === 4 && j === 5) || (i === 8 && j === 1) ? 1000 : 1500;
    }),
  );
  const base = metros.map((f) => f.map((m) => m * 2));
  const orden = base.map((f, i) => f.map((c, j) => (i > 0 && j > 0 && zona[i] !== zona[j] ? c + 3000 : c)));
  const resultado = adelantarBultos([0, 1, 2, 3, 4, 5, 6, 7, 8], conFinal((a, b) => orden[a][b], (i) => base[i][0]), {
    bultos: [0, 1, 1, 1, 1, 3, 3, 3, 3],
    tolerancia: 0.01,
    metrosPorParada: 1667,
    metros: conFinal((a, b) => metros[a][b], (i) => metros[i][0]),
    base: conFinal((a, b) => base[a][b], (i) => base[i][0]),
  });
  assert.deepEqual(resultado, [0, 5, 6, 7, 8, 1, 2, 3, 4]);
});

/** Una alternativa con lo que elegirUtiles mira. */
function alternativa(estrategia, metrosEstimados, costoEstimado) {
  return {
    estrategia,
    titulo: estrategia,
    motivo: "",
    paradas: [{ id: estrategia }],
    metrosEstimados,
    costoEstimado,
    confirmados: 0,
    pendientesDeContacto: 0,
    bloquesCumplidos: 0,
    bloquesIncumplidos: 0,
    fueraDeHorario: [],
    fueraDeHorarioIds: [],
  };
}

test("la recomendada es la que menos cuesta, no la más corta", () => {
  const economica = alternativa("corta", 10_000, 12_000);
  const corta = alternativa("confirmados", 9_500, 13_000);
  const elegidas = elegirUtiles([economica, corta]);
  assert.equal(elegidas[0].estrategia, "corta");
  // 5 % más corta pero más cara: no vale la pena compararla.
  assert.equal(elegidas.length, 1);
});

// ---------------------------------------------------------------------------
// De punta a punta: calcularRutaLocal con ORS respondido por un doble de fetch
// ---------------------------------------------------------------------------

const BASE = { lat: -18.4783, lng: -70.2979 };
const GRADOS_POR_KM = 1 / 111.32;
const LNG_POR_KM = GRADOS_POR_KM / Math.cos((BASE.lat * Math.PI) / 180);

function metrosEntre(a, b) {
  const latMedia = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  return Math.round(Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos(latMedia)));
}

test("calcularRutaLocal pide el tiempo a ORS y evita el tramo lento aunque mida lo mismo", async (t) => {
  // Dos paradas: P1 a 1 km al sur y P2 a 1 km al sur y 1 km al este. El triángulo
  // mide lo mismo en los dos sentidos. Ir hacia el oeste es lento (3 km/h contra
  // 30): por km se arranca por la más cercana (P1) y se vuelve al oeste desde P2
  // (1,4 km lentos); por costo se arranca por P2 y lo lento es P2→P1 (1 km).
  const pedidos = [];
  const cuerpos = [];
  const original = globalThis.fetch;
  process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";
  olvidarMatriz();
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    const cuerpo = JSON.parse(init.body);
    if (url.includes("/v2/matrix")) {
      cuerpos.push(cuerpo);
      const puntos = cuerpo.locations.map(([lng, lat]) => ({ lat, lng }));
      const filas = cuerpo.sources.map((i) => cuerpo.destinations.map((j) => [puntos[i], puntos[j]]));
      return Response.json({
        distances: filas.map((f) => f.map(([a, b]) => metrosEntre(a, b))),
        durations: filas.map((f) => f.map(([a, b]) => (metrosEntre(a, b) / 1000) * (b.lng < a.lng - 1e-6 ? 1200 : 120))),
      });
    }
    if (url.includes("/v2/directions")) {
      const coords = cuerpo.coordinates;
      const puntos = coords.map(([lng, lat]) => ({ lat, lng }));
      const segments = puntos.slice(1).map((p, i) => ({ distance: metrosEntre(puntos[i], p), duration: 60 }));
      return Response.json({
        features: [
          {
            geometry: { coordinates: coords },
            properties: { way_points: coords.map((_, i) => i), segments, extras: { waytype: { values: [[0, coords.length - 1, 2]] } } },
          },
        ],
      });
    }
    throw new Error(`consulta inesperada: ${url}`);
  };

  const fecha = "2026-08-21";
  for (const [nombre, sur, este] of [["P1", 1, 0], ["P2", 1, 1]]) {
    pedidos.push(
      await guardarPedido(
        {
          nombre,
          telefono: "+56912340000",
          direccion: `Calle ${nombre} 100, Arica`,
          lat: BASE.lat - sur * GRADOS_POR_KM,
          lng: BASE.lng + este * LNG_POR_KM,
          notas: null,
        },
        fecha,
      ),
    );
  }
  const propuesta = await calcularRutaLocal(fecha, { tipo: "gps", lat: BASE.lat, lng: BASE.lng });
  assert.deepEqual(cuerpos[0].metrics, ["distance", "duration"], "el tiempo viene en la misma consulta");
  assert.deepEqual(
    propuesta.paradas.map((p) => p.nombre),
    ["P2", "P1"],
  );
});
