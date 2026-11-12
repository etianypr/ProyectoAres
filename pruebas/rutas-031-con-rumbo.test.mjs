// Spec 031: la búsqueda del orden CON RUMBO (dueño, 2026-11-12: la ruta se arma
// sabiendo hacia dónde queda apuntando el auto en cada parada).
//
// Lo que se prueba: que una ruta se mide bien, que el mejor sentido de cada parada
// para un orden y el óptimo de un día chico son los de fuerza bruta, que la
// búsqueda de los días grandes llega al óptimo en días que todavía se pueden
// resolver exacto, que nunca sale peor que sus arranques, que el mismo día da la
// misma ruta, y el caso que mostró el dueño: dos paradas en la misma cuadra se
// entregan en el sentido en que pasa el auto.
import test from "node:test";
import assert from "node:assert/strict";
import { costoDeLaRuta, exactoConRumbo, mejoresEstados, tableroDe } from "@/lib/rutas/orden-paradas/con-rumbo";
import { crearMesa } from "@/lib/rutas/orden-paradas/con-rumbo-jugadas";
import { ordenarConRumbo } from "@/lib/rutas/orden-paradas/con-rumbo-busqueda";
import { adelantarBultosConRumbo } from "@/lib/rutas/orden-paradas/descarga-con-rumbo";
import { matrizConRumbo } from "@/lib/geo/red/matriz-con-rumbo";
import { grilla } from "./red-de-juguete.mjs";

function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Un día al azar: la partida (un estado) y `paradas` paradas con uno o dos
 *  estados. Los costos salen de puntos en un plano, con un recargo distinto según
 *  el sentido con que se sale y se llega: no son simétricos. */
function diaAlAzar(paradas, semilla, fin = 0) {
  const r = azar(semilla);
  const lugares = fin > 0 ? paradas + 2 : paradas + 1;
  const estadosDe = [];
  const punto = [];
  let n = 0;
  for (let l = 0; l < lugares; l++) {
    const libre = l === 0 || l === fin;
    const cuantos = libre || r() < 0.2 ? 1 : 2;
    estadosDe.push(Array.from({ length: cuantos }, () => n++));
    const p = { x: r() * 5000, y: r() * 5000 };
    for (let k = 0; k < cuantos; k++) punto.push({ ...p, rumbo: r() * 2 * Math.PI, libre });
  }
  const costo = new Float64Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const dx = punto[b].x - punto[a].x;
      const dy = punto[b].y - punto[a].y;
      const d = Math.hypot(dx, dy);
      const hacia = Math.atan2(dy, dx);
      // Salir contra el rumbo de la parada, o llegar contra el de la otra, es dar una vuelta.
      const contra = (p) => (p.libre ? 0 : 400 * (1 - Math.cos(hacia - p.rumbo)));
      costo[a * n + b] = d + contra(punto[a]) + contra(punto[b]);
    }
  }
  return { n, costo, estadosDe, fin };
}

/** Todas las rutas posibles de un día chico: cada orden con cada sentido. */
function fuerzaBruta(dia) {
  const t = tableroDe(dia);
  let mejor = Infinity;
  const permutar = (resto, estados) => {
    if (resto.length === 0) {
      mejor = Math.min(mejor, costoDeLaRuta(t, estados));
      return;
    }
    resto.forEach((lugar, i) => {
      for (const e of dia.estadosDe[lugar]) permutar([...resto.slice(0, i), ...resto.slice(i + 1)], [...estados, e]);
    });
  };
  permutar(t.paradas, []);
  return mejor;
}

test("mejoresEstados: para un orden dado, el sentido de cada parada es el mejor posible", () => {
  for (const semilla of [1, 2, 3, 4, 5, 6]) {
    const dia = diaAlAzar(7, semilla, semilla % 2 ? 0 : -1);
    const t = tableroDe(dia);
    const orden = [...t.paradas].reverse();
    // Todas las combinaciones de sentidos para ese orden.
    let mejor = Infinity;
    const combinar = (k, estados) => {
      if (k === orden.length) {
        mejor = Math.min(mejor, costoDeLaRuta(t, estados));
        return;
      }
      for (const e of dia.estadosDe[orden[k]]) combinar(k + 1, [...estados, e]);
    };
    combinar(0, []);
    const r = mejoresEstados(t, orden);
    assert.ok(Math.abs(r.costo - mejor) < 1e-6, `semilla ${semilla}: ${r.costo} y no ${mejor}`);
    assert.ok(Math.abs(costoDeLaRuta(t, r.estados) - r.costo) < 1e-6, "el costo que dice no es el de sus estados");
    assert.deepEqual(r.estados.map((e) => t.lugarDe[e]), orden);
  }
});

test("día chico: el óptimo exacto es el de fuerza bruta, cerrada, abierta o terminando en otro lado", () => {
  for (const [paradas, semilla, fin] of [[5, 11, 0], [6, 12, 0], [6, 13, -1], [5, 14, 6], [7, 15, 0]]) {
    const dia = diaAlAzar(paradas, semilla, fin);
    const exacto = exactoConRumbo(tableroDe(dia));
    const bruta = fuerzaBruta(dia);
    assert.ok(Math.abs(exacto.costo - bruta) < 1e-6, `${paradas} paradas, semilla ${semilla}: ${exacto.costo} y no ${bruta}`);
    assert.deepEqual([...exacto.orden].sort((a, b) => a - b), tableroDe(dia).paradas);
    // ordenarConRumbo usa el exacto en los días chicos.
    assert.ok(Math.abs(ordenarConRumbo(dia).costo - bruta) < 1e-6);
  }
});

test("las jugadas de los días grandes llegan al óptimo en días que todavía se resuelven exacto", () => {
  // La mesa de jugadas, sin el atajo del exacto: desde el orden en que vienen las
  // paradas, mejorar y sacudir como hace buscarConRumbo.
  let iguales = 0;
  const dias = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
  for (const semilla of dias) {
    const dia = diaAlAzar(11, semilla);
    const t = tableroDe(dia);
    const optimo = exactoConRumbo(t).costo;
    const mesa = crearMesa(t);
    mesa.poner(mejoresEstados(t, t.paradas).estados, true);
    mesa.mejorar();
    let mejor = mesa.costo();
    const guardada = Int32Array.from(mesa.r);
    const r = azar(semilla * 7);
    for (let i = 0; i < 400; i++) {
      const [p1, p2, p3] = [1 + Math.floor(r() * 3), 4 + Math.floor(r() * 3), 7 + Math.floor(r() * 3)];
      mesa.doblePuente(p1, p2, p3);
      mesa.mejorar();
      // Lo que la mesa dice que cuesta es lo que cuesta: las cuentas por tramos no se desvían.
      assert.ok(Math.abs(mesa.costo() - costoDeLaRuta(t, mesa.r)) < 1e-6, `semilla ${semilla}: la mesa perdió la cuenta`);
      if (mesa.costo() < mejor - 1e-9) {
        mejor = mesa.costo();
        guardada.set(mesa.r);
      } else mesa.poner(guardada, false);
    }
    assert.ok(mejor >= optimo - 1e-6, "mejor que el óptimo: imposible");
    assert.ok(mejor <= optimo * 1.01, `semilla ${semilla}: ${mejor} contra el óptimo ${optimo}`);
    if (mejor <= optimo + 1e-6) iguales++;
  }
  assert.ok(iguales >= 8, `solo ${iguales} de ${dias.length} días llegaron al óptimo`);
});

test("día grande: una ruta válida, nunca peor que sus arranques, y siempre la misma", () => {
  for (const [paradas, semilla] of [[30, 41], [45, 42], [60, 43]]) {
    const dia = diaAlAzar(paradas, semilla);
    const t = tableroDe(dia);
    const arranque = [...t.paradas].sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
    const r = ordenarConRumbo(dia, [arranque]);
    assert.deepEqual([...r.orden].sort((a, b) => a - b), t.paradas, "no pasa una vez por cada parada");
    assert.deepEqual(r.estados.map((e) => t.lugarDe[e]), r.orden);
    assert.ok(Math.abs(costoDeLaRuta(t, r.estados) - r.costo) < 1e-6, "el costo que dice no es el de su ruta");
    assert.ok(r.costo <= mejoresEstados(t, arranque).costo + 1e-6, "salió peor que su arranque");
    assert.ok(r.costo <= mejoresEstados(t, t.paradas).costo, "ni siquiera mejoró el orden en que venían");
    assert.deepEqual(ordenarConRumbo(dia, [arranque]), r, "el mismo día dio otra ruta");
  }
});

test("el caso del dueño: dos paradas en la misma cuadra se entregan en el sentido en que pasa el auto", () => {
  // Grilla de 3 × 3 cruces. La central está en la calle de arriba (0—1); A y B, en
  // la cuadra 3—4: A cerca del cruce 3 y B cerca del 4. Sin rumbo, de A a B y de B
  // a A hay media cuadra. Con rumbo, entregar la de más adelante primero obliga a
  // dar la vuelta a la manzana para volver a la de atrás.
  const { red, arista } = grilla(3, 3);
  const lugares = [
    { arista: arista(0, 1), fraccion: 0.5, libre: true },
    { arista: arista(3, 4), fraccion: 0.25 },
    { arista: arista(3, 4), fraccion: 0.75 },
  ];
  const m = matrizConRumbo(red, lugares);
  const dia = { n: m.n, costo: m.metros, estadosDe: m.estadosDe, fin: 0 };
  const r = ordenarConRumbo(dia);
  const sentidos = r.estados.map((e) => m.sentidoDe[e]);
  assert.equal(sentidos[0], sentidos[1], "pasa por la cuadra en un sentido y vuelve en el otro");
  // Hacia el este (sentido 0) pasa primero por A; hacia el oeste, primero por B.
  assert.deepEqual(r.orden, sentidos[0] === 0 ? [1, 2] : [2, 1]);
  // Y es más corta que entregar primero la de más adelante.
  const t = tableroDe(dia);
  const alReves = costoDeLaRuta(t, [m.estadosDe[2][0], m.estadosDe[1][0]]);
  assert.ok(r.costo < alReves - 100, `${r.costo.toFixed(0)} m contra ${alReves.toFixed(0)} m`);
});

/** Lo que esperan en el auto los bultos de una ruta (metros manejados hasta cada parada, más las paradas). */
function espera(dia, ruta, bultos, metrosPorParada) {
  const estados = [dia.estadosDe[0][0], ...ruta.estados];
  let manejado = 0;
  let total = 0;
  for (let k = 1; k < estados.length; k++) {
    manejado += dia.costo[estados[k - 1] * dia.n + estados[k]];
    total += bultos[ruta.orden[k - 1]] * (manejado + (k - 1) * metrosPorParada);
  }
  return total;
}

test("los bultos se adelantan con rumbo sin pasarse de la tolerancia, y nunca esperan más", () => {
  for (const semilla of [51, 52, 53, 54]) {
    const dia = diaAlAzar(24, semilla);
    const t = tableroDe(dia);
    const r = azar(semilla * 3);
    const bultos = dia.estadosDe.map((_, lugar) => (lugar === 0 ? 0 : 1 + Math.floor(r() * r() * 5)));
    const ruta = ordenarConRumbo(dia);
    const d = { bultos, metros: dia.costo, tolerancia: 0.01, metrosPorParada: 1667 };
    const con = adelantarBultosConRumbo(t, ruta, d);
    assert.deepEqual([...con.orden].sort((a, b) => a - b), t.paradas);
    assert.ok(con.costo <= ruta.costo * 1.01 + 1e-6, `semilla ${semilla}: ${con.costo} contra ${ruta.costo}`);
    assert.ok(espera(dia, con, bultos, 1667) <= espera(dia, ruta, bultos, 1667) + 1e-6, `semilla ${semilla}: esperan más`);
    // Con tolerancia 0 no se maneja ni un metro más.
    const sin = adelantarBultosConRumbo(t, ruta, { ...d, tolerancia: 0 });
    assert.ok(sin.costo <= ruta.costo + 1e-6);
  }
});

test("a igual camino, la ruta empieza por donde hay más bultos", () => {
  // Un triángulo que mide lo mismo en los dos sentidos: la partida y dos paradas,
  // la segunda con cinco bultos. Sin rumbo que cobrar (un estado cada una).
  const dia = { n: 3, estadosDe: [[0], [1], [2]], fin: 0, costo: Float64Array.from([0, 1000, 1000, 1000, 0, 1000, 1000, 1000, 0]) };
  const t = tableroDe(dia);
  const ruta = mejoresEstados(t, [1, 2]);
  const con = adelantarBultosConRumbo(t, ruta, { bultos: [0, 1, 5], metros: dia.costo, tolerancia: 0.01, metrosPorParada: 1667 });
  assert.deepEqual(con.orden, [2, 1]);
});
