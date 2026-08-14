// Calidad del orden de paradas. No alcanza con que devuelva una permutación
// válida (eso lo cubre 2-rutas.test.mjs): lo que importa es cuánto se maneja de
// más, que es plata y horas del chofer.
//
// La vara de abajo es el ÓPTIMO REAL, calculado por fuerza bruta (todas las
// permutaciones) con una implementación independiente de la del código. Es la
// única forma honesta de decir "esto es lo mejor posible" en vez de "esto se ve
// bien".
import test from "node:test";
import assert from "node:assert/strict";
import { ordenarParadas, distanciaMetros } from "@/lib/rutas";

// Igual que en el código: hasta 14 puntos se resuelve exacto.
const MAX_EXACTO = 14;

function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Jornada repartida por Arica, con la empresa como punto 0. */
function jornada(n, semilla) {
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
      const puntos = jornada(n, s * 101);
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
      const puntos = jornada(n, s * 101);
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
  const puntos = jornada(MAX_EXACTO, 7);
  const t0 = performance.now();
  ordenarParadas(puntos);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `resolver ${MAX_EXACTO} puntos exacto tardó ${Math.round(ms)} ms`);
});

// --------------------------------------------------- jornadas más grandes
test("en jornadas grandes mejora bastante al vecino más cercano, y nunca lo empeora", () => {
  for (const n of [20, 31, 45]) {
    let suyo = 0;
    let nuestro = 0;
    for (let s = 1; s <= 10; s++) {
      const puntos = jornada(n, s * 101);
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
    const puntos = jornada(18, s * 101);
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

test("la misma jornada da SIEMPRE la misma ruta", () => {
  // Si no, el chofer regenera y le cambia el orden sin motivo, y deja de
  // confiar en la propuesta.
  for (const n of [9, 20, 31]) {
    const puntos = jornada(n, 4242);
    const matriz = n > 14 ? null : matrizCalles(puntos, 3);
    const primera = ordenarParadas(puntos, matriz);
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(ordenarParadas(puntos, matriz), primera, `n=${n} cambió entre corridas`);
    }
  }
});

test("una jornada completa se ordena sin trabar el teléfono", () => {
  // 61 puntos = 60 entregas + la base, que es la jornada real de Arica.
  const puntos = jornada(61, 99);
  const t0 = performance.now();
  const orden = ordenarParadas(puntos);
  const ms = performance.now() - t0;
  assert.equal(new Set(orden).size, 61);
  // Holgado a propósito: acá corre en un PC, en el teléfono es varias veces
  // más lento. Lo que se vigila es que no se dispare a segundos.
  assert.ok(ms < 2000, `ordenar 61 puntos tardó ${Math.round(ms)} ms`);
});

test("sigue tolerando matrices rotas sin devolver basura", () => {
  const puntos = jornada(20, 5);
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
