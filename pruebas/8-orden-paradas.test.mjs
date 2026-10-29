// Calidad del orden de paradas. No alcanza con que devuelva una permutación
// válida (eso lo cubre 2-rutas.test.mjs): lo que importa es cuánto se maneja de
// más, que es plata y horas del conductor.
//
// La vara de abajo es el ÓPTIMO REAL, calculado por fuerza bruta (todas las
// permutaciones) con una implementación independiente de la del código. Es la
// única forma honesta de decir "esto es lo mejor posible" en vez de "esto se ve
// bien".
import test from "node:test";
import assert from "node:assert/strict";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { distanciaMetros } from "@/lib/geo/coordenada";

// Igual que en el código: hasta 14 puntos se resuelve exacto.
const MAX_EXACTO = 14;

function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Las paradas de un día repartidas por Arica, con la empresa como punto 0. */
function puntosDelDia(n, semilla) {
  const r = azar(semilla);
  const puntos = [{ lat: -18.471152, lng: -70.289929 }];
  for (let i = 1; i < n; i++) {
    puntos.push({ lat: -18.44 - r() * 0.07, lng: -70.26 - r() * 0.08 });
  }
  return puntos;
}

/** Matriz por calles: línea recta por un factor de rodeo que DEPENDE DEL
 *  SENTIDO (los sentidos únicos de Arica), más algunos pares muy castigados
 *  (la quebrada, la costanera). Es asimétrica a propósito: es lo que hace que
 *  las jugadas que solo invierten tramos no alcancen. */
function matrizCalles(puntos, semilla) {
  const r = azar(semilla * 7919 + 13);
  return puntos.map((a, i) =>
    puntos.map((b, j) => {
      if (i === j) return 0;
      return distanciaMetros(a, b) * (1.15 + r() * 0.5) * (r() < 0.08 ? 2.2 : 1);
    }),
  );
}

const largo = (orden, costo) =>
  orden.slice(0, -1).reduce((total, _, i) => total + costo(orden[i], orden[i + 1]), 0);

const costoDe = (puntos, matriz) =>
  matriz ? (a, b) => matriz[a][b] : (a, b) => distanciaMetros(puntos[a], puntos[b]);

/** Óptimo por fuerza bruta. Implementación independiente: si el exacto del
 *  código tuviera un error, acá se ve. */
function optimo(n, costo) {
  let mejor = Infinity;
  const permutar = (actual, quedan) => {
    if (quedan.length === 0) {
      mejor = Math.min(mejor, largo([0, ...actual], costo));
      return;
    }
    for (let i = 0; i < quedan.length; i++) {
      permutar([...actual, quedan[i]], [...quedan.slice(0, i), ...quedan.slice(i + 1)]);
    }
  };
  permutar([], Array.from({ length: n - 1 }, (_, i) => i + 1));
  return mejor;
}

/** Vecino más cercano a secas, sin ninguna mejora. Es la vara de "lo que
 *  saldría sin optimizar nada". */
function vecinoMasCercano(n, costo) {
  const visitado = new Array(n).fill(false);
  visitado[0] = true;
  const orden = [0];
  let actual = 0;
  for (let k = 1; k < n; k++) {
    let mejor = -1;
    let mejorDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visitado[j]) continue;
      if (mejor === -1) mejor = j;
      const d = costo(actual, j);
      if (d < mejorDist) {
        mejorDist = d;
        mejor = j;
      }
    }
    visitado[mejor] = true;
    orden.push(mejor);
    actual = mejor;
  }
  return orden;
}

// ------------------------------------------------------- el óptimo exacto
test("con pocas paradas devuelve el ÓPTIMO EXACTO, no una aproximación", () => {
  for (const n of [4, 5, 6, 7, 8, 9]) {
    for (let s = 1; s <= 12; s++) {
      const puntos = puntosDelDia(n, s * 101);
      const costo = costoDe(puntos, null);
      const nuestro = largo(ordenarParadas(puntos), costo);
      const mejor = optimo(n, costo);
      assert.ok(
        nuestro <= mejor + 1e-6,
        `n=${n} semilla=${s}: dio ${Math.round(nuestro)} m y el óptimo es ${Math.round(mejor)} m`,
      );
    }
  }
});

test("el óptimo exacto también vale con la matriz de calles ASIMÉTRICA", () => {
  // Es el caso que rompe los algoritmos que suponen que ir y volver cuesta
  // igual, así que es el que hay que verificar contra fuerza bruta.
  for (const n of [4, 6, 8, 9]) {
    for (let s = 1; s <= 12; s++) {
      const puntos = puntosDelDia(n, s * 101);
      const matriz = matrizCalles(puntos, s);
      const costo = costoDe(puntos, matriz);
      const nuestro = largo(ordenarParadas(puntos, matriz), costo);
      const mejor = optimo(n, costo);
      assert.ok(
        nuestro <= mejor + 1e-6,
        `n=${n} semilla=${s}: dio ${Math.round(nuestro)} y el óptimo es ${Math.round(mejor)}`,
      );
    }
  }
});

test("el límite del exacto es de verdad el que dice la constante", () => {
  // Si alguien sube MAX_EXACTO sin medir, esta prueba avisa por el tiempo.
  const puntos = puntosDelDia(MAX_EXACTO, 7);
  const t0 = performance.now();
  ordenarParadas(puntos);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `resolver ${MAX_EXACTO} puntos exacto tardó ${Math.round(ms)} ms`);
});

// --------------------------------------------------- días más grandes
test("en días grandes mejora bastante al vecino más cercano, y nunca lo empeora", () => {
  for (const n of [20, 31, 45]) {
    let suyo = 0;
    let nuestro = 0;
    for (let s = 1; s <= 10; s++) {
      const puntos = puntosDelDia(n, s * 101);
      const costo = costoDe(puntos, null);
      const base = largo(vecinoMasCercano(n, costo), costo);
      const optimizado = largo(ordenarParadas(puntos), costo);
      assert.ok(optimizado <= base + 1e-6, `n=${n} semilla=${s}: salió peor que sin optimizar`);
      suyo += base;
      nuestro += optimizado;
    }
    const mejora = ((suyo - nuestro) / suyo) * 100;
    assert.ok(mejora > 8, `con ${n} puntos solo mejoró ${mejora.toFixed(1)}% al vecino más cercano`);
  }
});

test("con matriz de calles, el orden elegido es el mejor MEDIDO POR CALLE", () => {
  // Ordenar mirando la línea recta y ordenar mirando las calles dan órdenes
  // distintos; el que se entrega tiene que ser el mejor con el costo real.
  for (let s = 1; s <= 10; s++) {
    const puntos = puntosDelDia(18, s * 101);
    const matriz = matrizCalles(puntos, s);
    const porCalle = costoDe(puntos, matriz);
    const conMatriz = largo(ordenarParadas(puntos, matriz), porCalle);
    const sinMatriz = largo(ordenarParadas(puntos, null), porCalle);
    assert.ok(
      conMatriz <= sinMatriz + 1e-6,
      `semilla ${s}: con matriz ${Math.round(conMatriz)} > sin matriz ${Math.round(sinMatriz)}`,
    );
  }
});

test("el mismo día da SIEMPRE la misma ruta", () => {
  // Si no, el conductor regenera y le cambia el orden sin motivo, y deja de
  // confiar en la propuesta.
  for (const n of [9, 20, 31]) {
    const puntos = puntosDelDia(n, 4242);
    const matriz = n > 14 ? null : matrizCalles(puntos, 3);
    const primera = ordenarParadas(puntos, matriz);
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(ordenarParadas(puntos, matriz), primera, `n=${n} cambió entre corridas`);
    }
  }
});

test("un día completo se ordena sin trabar el teléfono", () => {
  // 61 puntos = 60 entregas + la base, que es el día real de Arica.
  const puntos = puntosDelDia(61, 99);
  const t0 = performance.now();
  const orden = ordenarParadas(puntos);
  const ms = performance.now() - t0;
  assert.equal(new Set(orden).size, 61);
  // Holgado a propósito: acá corre en un PC, en el teléfono es varias veces
  // más lento. Lo que se vigila es que no se dispare a segundos.
  assert.ok(ms < 2000, `ordenar 61 puntos tardó ${Math.round(ms)} ms`);
});

test("sigue tolerando matrices rotas sin devolver basura", () => {
  const puntos = puntosDelDia(20, 5);
  for (const matriz of [
    [[0, 1]], // filas de menos
    puntos.map(() => []), // filas vacías
    puntos.map(() => puntos.map(() => NaN)),
    puntos.map(() => puntos.map(() => Infinity)),
  ]) {
    const orden = ordenarParadas(puntos, matriz);
    assert.equal(orden.length, 20);
    assert.equal(orden[0], 0);
    assert.deepEqual([...orden].sort((a, b) => a - b), [...Array(20).keys()]);
  }
});

// ---------------------------------------------------------------------------
// Ruta cerrada (terreno 2026-10-28): "donde empieza debe terminar".

/** Base y cuatro paradas en L: dos al este (1 y 2 km) y dos al sur (1 y 2 km). */
function enL() {
  const base = { lat: -18.4783, lng: -70.2979 };
  const km = 1 / 111.32;
  const kmEste = km / Math.cos((base.lat * Math.PI) / 180);
  return [
    base,
    { lat: base.lat, lng: base.lng + kmEste },
    { lat: base.lat, lng: base.lng + 2 * kmEste },
    { lat: base.lat - km, lng: base.lng },
    { lat: base.lat - 2 * km, lng: base.lng },
  ];
}

test("ruta cerrada: la última parada queda cerca de la base, no en la otra punta", () => {
  const puntos = enL();
  const lejos = (i) => distanciaMetros(puntos[i], puntos[0]);

  const abierta = ordenarParadas(puntos);
  assert.ok(lejos(abierta[abierta.length - 1]) > 1500, "la abierta termina en una punta (así era)");

  const cerrada = ordenarParadas(puntos, null, (i) => lejos(i));
  assert.ok(lejos(cerrada[cerrada.length - 1]) < 1100, `la cerrada termina a ${Math.round(lejos(cerrada.at(-1)))} m`);
  assert.deepEqual([...cerrada].sort(), [0, 1, 2, 3, 4]);
});

test("ruta cerrada: ante dos sentidos iguales arranca por la parada más cercana", () => {
  const base = { lat: -18.4783, lng: -70.2979 };
  const puntos = [base, ...[3, 1, 2].map((km) => ({ lat: base.lat - km / 111.32, lng: base.lng }))];
  const vuelta = (i) => distanciaMetros(puntos[i], base);
  // Ida y vuelta por una misma calle: ir primero a la de 1 km o a la de 3 km
  // mide lo mismo. Se arranca por la más cercana (el índice 2).
  assert.equal(ordenarParadas(puntos, null, vuelta)[1], 2);
});

test("ruta cerrada: el optimizador con horarios cuenta los metros de la vuelta", async () => {
  const { evaluar } = await import("@/lib/rutas/orden-paradas/con-horarios");
  const dia = { metros: [0, 1000, 1000, 0], n: 2, ventanas: [null, null], inicio: 9 * 60, kmh: 25, servicio: 4 };
  assert.equal(evaluar([0, 1], dia).metros, 1000, "abierta");
  assert.equal(evaluar([0, 1], { ...dia, vuelta: [0, 1000] }).metros, 2000, "cerrada");
});

test("ruta cerrada: un pedido tarde no va al final gratis si después hay que volver", async () => {
  const { lugarMasBarato, metrosEstimados, vueltaEstimada } = await import("@/lib/encomiendas/local/planificar");
  const base = { lat: -18.4783, lng: -70.2979 };
  const km = 1 / 111.32;
  const punto = (id, kmSur) => ({ id, lat: base.lat - kmSur * km, lng: base.lng, bloqueHorarioId: null });
  const orden = [punto("sur", 1)];
  const nuevo = punto("norte", -3); // al otro lado de la base
  const metros = metrosEstimados(base);
  assert.equal(lugarMasBarato(orden, nuevo, metros), 1, "abierta: al final, que sale gratis");
  assert.equal(lugarMasBarato(orden, nuevo, metros, 0, vueltaEstimada(base, base)), 0, "cerrada: el final ya no es gratis");
});

// ---------------------------------------------- a fondo (terreno 2026-10-29)
// La propuesta busca la ruta con menos kilómetros aunque tarde unos segundos.
// Lo que se fija: nunca sale más larga que la búsqueda rápida, y el mismo día da
// siempre la misma ruta (si no, regenerar le cambiaría el orden al conductor).
test("a fondo: nunca más larga que la rápida, y el mismo día da la misma ruta", () => {
  let mejoroAlguna = false;
  for (const [n, semilla] of [[30, 3], [45, 8], [60, 21]]) {
    const puntos = puntosDelDia(n, semilla);
    const matriz = matrizCalles(puntos, semilla);
    const vuelta = (i) => matriz[i][0];
    const conVuelta = (orden) => largo(orden, (a, b) => matriz[a][b]) + vuelta(orden[orden.length - 1]);
    const rapida = ordenarParadas(puntos, matriz, vuelta);
    const aFondo = ordenarParadas(puntos, matriz, vuelta, true);
    assert.ok(conVuelta(aFondo) <= conVuelta(rapida) + 1e-6, `${n} paradas: a fondo salió más larga`);
    assert.deepEqual(ordenarParadas(puntos, matriz, vuelta, true), aFondo, `${n} paradas: cambió al repetir`);
    if (conVuelta(aFondo) < conVuelta(rapida) - 1) mejoroAlguna = true;
  }
  assert.ok(mejoroAlguna, "a fondo no mejoró ningún día: no está buscando más");
});

// ------------------------------------- calles donde no se da la vuelta (2026-10-29)
// La búsqueda calcula el cambio de la penalización solo en las paradas que
// cambian de vecinos. Si esa cuenta estuviera mal, el resultado no sería un
// óptimo local con el costo completo: acá se prueban TODAS las jugadas a la fuerza.
const { mejorarLocal } = await import("@/lib/rutas/orden-paradas/mejora");
const { FIN, conFinal, distanciaOrden } = await import("@/lib/rutas/orden-paradas/costo");

function penalizacionAlAzar(n, semilla) {
  const r = azar(semilla * 31 + 7);
  const estrecha = Array.from({ length: n }, (_, i) => i > 0 && r() < 0.4);
  const lado = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(r() * 3) - 1));
  const metros = Array.from({ length: n }, () => 100 + r() * 900);
  const pen = (a, s, b) => {
    if (!estrecha[s]) return 0;
    const la = lado[s][a];
    const lb = lado[s][b === FIN ? 0 : b];
    return la !== 0 && la === lb ? metros[s] : 0;
  };
  pen.maximo = 1000;
  return pen;
}

test("con penalización: la búsqueda llega a un óptimo local del costo COMPLETO", () => {
  for (const semilla of [1, 2, 3, 4]) {
    const n = 18;
    const puntos = puntosDelDia(n, semilla);
    const matriz = matrizCalles(puntos, semilla);
    const costo = conFinal((a, b) => matriz[a][b], (i) => matriz[i][0]);
    const pen = penalizacionAlAzar(n, semilla);
    const inicial = [0, ...Array.from({ length: n - 1 }, (_, i) => i + 1)];
    const total = (o) => distanciaOrden(o, costo, pen);
    const resultado = mejorarLocal(inicial, costo, pen);
    assert.ok(total(resultado) <= total(inicial) + 1e-6, "empeoró");
    const mejor = total(resultado);
    // 2-opt: dar vuelta cualquier tramo.
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const o = [...resultado.slice(0, i), ...resultado.slice(i, j + 1).reverse(), ...resultado.slice(j + 1)];
        assert.ok(total(o) >= mejor - 1e-6, `semilla ${semilla}: un 2-opt (${i},${j}) todavía mejoraba`);
      }
    }
    // Or-opt: mover un grupo de 1 a 3, derecho o dado vuelta.
    for (let largo = 1; largo <= 3; largo++) {
      for (let i = 1; i + largo <= n; i++) {
        const seg = resultado.slice(i, i + largo);
        const resto = [...resultado.slice(0, i), ...resultado.slice(i + largo)];
        for (let p = 1; p <= resto.length; p++) {
          for (const s of [seg, [...seg].reverse()]) {
            const o = [...resto.slice(0, p), ...s, ...resto.slice(p)];
            assert.ok(total(o) >= mejor - 1e-6, `semilla ${semilla}: mover ${largo} desde ${i} a ${p} todavía mejoraba`);
          }
        }
      }
    }
  }
});

test("con penalización: ordenarParadas nunca sale peor que el arranque que se le da", () => {
  for (const semilla of [5, 6, 7]) {
    const n = 40;
    const puntos = puntosDelDia(n, semilla);
    const matriz = matrizCalles(puntos, semilla);
    const vuelta = (i) => matriz[i][0];
    const costo = conFinal((a, b) => matriz[a][b], vuelta);
    const pen = penalizacionAlAzar(n, semilla);
    const arranque = ordenarParadas(puntos, matriz, vuelta);
    const conSentido = ordenarParadas(puntos, matriz, vuelta, true, { penalizacion: pen, arranque });
    assert.ok(
      distanciaOrden(conSentido, costo, pen) <= distanciaOrden(arranque, costo, pen) + 1e-6,
      `semilla ${semilla}: salió peor que el arranque`,
    );
  }
});

// -------------------------------------------------- cada zona una sola vez
// Criterio del dueño (terreno 2026-10-29): terminar una zona antes de pasar a la
// siguiente, y no volver a pisarla.
const { zonasPorCercania, matrizPorZonas, zonasRepetidas } = await import("@/lib/encomiendas/local/generar-ruta/zonas");

/** Un día con barrios: grupos de casas juntas, repartidos por la ciudad. */
function diaConBarrios(barrios, casas, semilla) {
  const r = azar(semilla);
  const puntos = [{ lat: -18.471152, lng: -70.289929 }];
  for (let b = 0; b < barrios; b++) {
    const centro = { lat: -18.44 - r() * 0.07, lng: -70.26 - r() * 0.08 };
    for (let c = 0; c < casas; c++) puntos.push({ lat: centro.lat + (r() - 0.5) * 0.004, lng: centro.lng + (r() - 0.5) * 0.004 });
  }
  return puntos;
}

test("zonas: las casas de un mismo barrio quedan juntas y barrios lejanos, separados", () => {
  const puntos = diaConBarrios(2, 4, 3);
  const matriz = puntos.map((a) => puntos.map((b) => distanciaMetros(a, b) * 1.3));
  const zona = zonasPorCercania(matriz);
  assert.equal(zona[0], -1, "la base no tiene zona");
  assert.equal(new Set(zona.slice(1, 5)).size, 1, "el primer barrio quedó partido");
  assert.equal(new Set(zona.slice(5, 9)).size, 1, "el segundo barrio quedó partido");
});

test("zonas: con el costo de cambiar de zona, la ruta no pisa ninguna zona dos veces", () => {
  for (const semilla of [11, 12, 13, 14, 15]) {
    const puntos = diaConBarrios(8, 6, semilla);
    const matriz = matrizCalles(puntos, semilla);
    const zona = zonasPorCercania(matriz);
    const orden = ordenarParadas(puntos, matrizPorZonas(matriz, zona), (i) => matriz[i][0], true);
    assert.deepEqual([...orden].sort((a, b) => a - b), [...puntos.keys()], "no es una permutación");
    assert.equal(orden[0], 0);
    assert.equal(zonasRepetidas(orden, zona), 0, `semilla ${semilla}: volvió a una zona`);
  }
});
