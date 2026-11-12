// Spec 031: el motor de rutas propio, con la red REAL de Arica, contra la matriz
// REAL de OpenRouteService guardada (fixtures/matriz-tiempo-arica.json: 81 puntos
// al azar sobre calles, capturada el 2026-11-08). Sin red: nada se consulta.
//
// Es la puerta de la spec: si el motor no mide lo que mide ORS cuando se le quitan
// las reglas de giro (`libre`), no se puede confiar en lo que mida con ellas. Los
// umbrales salen de la medición del 2026-11-12 (mediana 0,0 % en metros; 87 % de
// los pares a ±5 % y 96 % a ±10 %), con algo de holgura.
//
// Es una foto con fecha: si cambia la red (npm run red) o ORS, esta prueba avisa.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armarRed, PRIVADA } from "@/lib/geo/red/grafo";
import { RED_ARICA } from "@/lib/geo/red/red-arica";
import { pegarALaRed } from "@/lib/geo/red/pegar";
import { matrizConRumbo } from "@/lib/geo/red/matriz-con-rumbo";

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
const red = armarRed(RED_ARICA);

test("la red de Arica se arma entera", () => {
  assert.match(RED_ARICA.fecha, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(red.nNodos > 9000 && red.nAristas > 12000, `${red.nNodos} nodos y ${red.nAristas} aristas`);
  assert.ok(red.prohibidos.size > 50, "sin las restricciones de giro");
  // Ninguna arista sin largo ni fuera de Arica (la más larga es una carretera que
  // cruza el recuadro sin un solo cruce: ~39 km).
  for (let k = 0; k < red.nAristas; k++) assert.ok(red.largo[k] > 0 && red.largo[k] < 60_000, `arista ${k}: ${red.largo[k]} m`);
  // Los caminos que cruzan el borde del recuadro traen sus nodos de más allá.
  for (let i = 0; i < red.nNodos; i++) assert.ok(red.lat[i] < -18.2 && red.lat[i] > -18.9 && red.lng[i] < -69.7 && red.lng[i] > -70.5, `nodo ${i}`);
});

test("sin reglas de giro, el motor mide lo que mide ORS", () => {
  const pegados = DIA.puntos.map((p) => pegarALaRed(red, p));
  assert.ok(pegados.every(Boolean), "un punto del fixture quedó sin calle");
  // Sirven los puntos pegados a su calle y fuera de calles privadas (ORS no entra en ellas).
  const sirve = pegados.map((p) => p.metros <= 3 && !(red.codigo[p.arista] & PRIVADA));
  assert.ok(sirve.filter(Boolean).length >= 70, "quedaron muy pocos puntos para comparar");

  const n = DIA.puntos.length;
  const m = matrizConRumbo(red, pegados.map((p) => ({ arista: p.arista, fraccion: p.fraccion, libre: true })), { libre: true });
  const metros = [];
  const segundos = [];
  let [mios, deOrs, misSegundos, segundosDeOrs] = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Los pares pegados (menos de 300 m) no dicen nada en porcentaje.
      if (i === j || !sirve[i] || !sirve[j] || DIA.metros[i][j] < 300) continue;
      const mio = m.metros[i * n + j];
      assert.ok(Number.isFinite(mio), `sin camino de ${i} a ${j}`);
      metros.push((mio - DIA.metros[i][j]) / DIA.metros[i][j]);
      segundos.push((m.segundos[i * n + j] - DIA.segundos[i][j]) / DIA.segundos[i][j]);
      mios += mio;
      deOrs += DIA.metros[i][j];
      misSegundos += m.segundos[i * n + j];
      segundosDeOrs += DIA.segundos[i][j];
    }
  }
  const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const dentro = (xs, margen) => xs.filter((x) => Math.abs(x) <= margen).length / xs.length;
  const pct = (x) => `${(x * 100).toFixed(1)} %`;

  assert.ok(metros.length > 5000, `${metros.length} pares`);
  assert.ok(Math.abs(mios / deOrs - 1) <= 0.02, `metros en total: ${pct(mios / deOrs - 1)}`);
  assert.ok(Math.abs(mediana(metros)) <= 0.01, `mediana de metros: ${pct(mediana(metros))}`);
  assert.ok(dentro(metros, 0.05) >= 0.84, `metros a ±5 %: ${pct(dentro(metros, 0.05))}`);
  assert.ok(dentro(metros, 0.1) >= 0.94, `metros a ±10 %: ${pct(dentro(metros, 0.1))}`);
  assert.ok(Math.abs(misSegundos / segundosDeOrs - 1) <= 0.03, `segundos en total: ${pct(misSegundos / segundosDeOrs - 1)}`);
  assert.ok(Math.abs(mediana(segundos)) <= 0.03, `mediana de segundos: ${pct(mediana(segundos))}`);
  assert.ok(dentro(segundos, 0.1) >= 0.82, `segundos a ±10 %: ${pct(dentro(segundos, 0.1))}`);
});

test("con las reglas de giro nunca se mide menos que sin ellas", () => {
  // Las reglas solo quitan caminos. Se compara parada por parada con el mejor de
  // sus estados, en 25 puntos del fixture (sin los de calles privadas, que el modo
  // libre no alcanza).
  const elegidos = DIA.puntos.map((p) => pegarALaRed(red, p)).filter((p) => p.metros <= 3 && !(red.codigo[p.arista] & PRIVADA)).slice(0, 25);
  const lugares = elegidos.map((p, i) => ({ arista: p.arista, fraccion: p.fraccion, libre: i === 0 }));
  const libre = matrizConRumbo(red, lugares.map((l) => ({ ...l, libre: true })), { libre: true });
  const conRumbo = matrizConRumbo(red, lugares);
  let masLargos = 0;
  for (let i = 0; i < lugares.length; i++) {
    for (let j = 0; j < lugares.length; j++) {
      if (i === j) continue;
      let mejor = Infinity;
      for (const a of conRumbo.estadosDe[i]) for (const b of conRumbo.estadosDe[j]) mejor = Math.min(mejor, conRumbo.segundos[a * conRumbo.n + b]);
      const sinReglas = libre.segundos[i * libre.n + j];
      assert.ok(mejor >= sinReglas - 1e-6, `de ${i} a ${j}: ${mejor} s con reglas y ${sinReglas} s sin ellas`);
      if (mejor > sinReglas + 1) masLargos++;
    }
  }
  assert.ok(masLargos > 0, "las reglas de giro no cambiaron ningún tramo");
});
