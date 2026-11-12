// Spec 031, de punta a punta: el armado de la ruta con la red de calles propia.
//
// Lo que se prueba: que con la red propia «Armar la ruta» no le consulta nada a
// OpenRouteService (ni matriz ni trazado), que el trazado sale con la forma que usa
// la pantalla, que invertir la ruta tampoco consulta, y que el respaldo sigue ahí:
// con la red apagada en Diagnóstico, o con un punto lejos de toda calle, vuelve ORS.
//
// Los puntos son los del fixture (al azar sobre calles de Arica): no son de nadie.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcularRutaLocal, invertirOrden, retrazar } from "@/lib/encomiendas/local/generar-ruta";
import { guardarPedido } from "@/lib/encomiendas/local/almacen";
import { olvidarMatriz } from "@/lib/geo/matriz";
import { apagarRed } from "@/lib/geo/red/grafo";
import { origenDelUltimoTrazado, rutaPorCalles } from "@/lib/geo/ruta-por-calles";

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
const CENTRAL = DIA.puntos[0];
process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";

/** Reemplaza fetch: anota a quién se le consulta y contesta como ORS si `contesta`. */
function vigilarLaRed(t, contesta = false) {
  const consultas = [];
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    consultas.push(url);
    if (!contesta || !url.includes("openrouteservice")) throw new TypeError("sin red");
    const cuerpo = JSON.parse(init.body);
    if (url.includes("/v2/matrix")) {
      const fila = () => cuerpo.destinations.map(() => 1000);
      return Response.json({ distances: cuerpo.sources.map(fila), durations: cuerpo.sources.map(fila) });
    }
    const coords = cuerpo.coordinates;
    return Response.json({
      features: [
        {
          geometry: { coordinates: coords },
          properties: {
            way_points: coords.map((_, i) => i),
            segments: coords.slice(1).map(() => ({ distance: 1000, duration: 60 })),
            extras: { waytype: { values: [[0, coords.length - 1, 2]] } },
          },
        },
      ],
    });
  };
  return { consultas, aOrs: () => consultas.filter((u) => u.includes("openrouteservice")) };
}

async function cargarDia(fecha, cuantos) {
  for (let i = 1; i <= cuantos; i++) {
    const p = DIA.puntos[i];
    await guardarPedido({ nombre: `Parada ${i}`, telefono: null, direccion: `Calle inventada ${i}00, Arica`, lat: p.lat, lng: p.lng, notas: null }, fecha);
  }
}

test("con la red propia, armar la ruta no le consulta nada a OpenRouteService", async (t) => {
  const red = vigilarLaRed(t);
  olvidarMatriz();
  await cargarDia("2026-09-01", 16);
  const p = await calcularRutaLocal("2026-09-01", { tipo: "gps", ...CENTRAL });

  assert.deepEqual(red.aOrs(), [], "se consultó a OpenRouteService");
  assert.equal(origenDelUltimoTrazado(), "red");
  assert.equal(p.paradas.length, 16);
  assert.equal(p.sinTrazado, false);
  assert.ok(!p.advertencias.some((a) => /línea recta|Sin trazado/.test(a)), p.advertencias.join(" | "));

  // El trazado, con la forma que usa la pantalla: una línea [lng, lat] y, por
  // tramo, dónde empieza y termina en ella (el último vuelve a la central).
  assert.ok(p.trazado.length > 50, `${p.trazado.length} puntos`);
  for (const [lng, lat] of p.trazado) assert.ok(lat < -18.3 && lat > -18.7 && lng < -70.1 && lng > -70.45, `punto fuera de Arica: ${lat}, ${lng}`);
  assert.equal(p.tramos.length, 17);
  p.tramos.forEach((tramo, k) => {
    assert.equal(tramo.desde, k === 0 ? 0 : p.tramos[k - 1].hasta, `el tramo ${k} no sigue al anterior`);
    assert.ok(tramo.hasta >= tramo.desde && tramo.hasta < p.trazado.length);
  });
  assert.equal(p.tramos.at(-1).hasta, p.trazado.length - 1);
  const suma = p.tramos.reduce((s, tramo) => s + tramo.metros, 0);
  assert.ok(Math.abs(suma - p.distanciaM) <= p.tramos.length, `${suma} m en los tramos y ${p.distanciaM} m en total`);
  assert.ok(p.distanciaM > 5000 && p.duracionS > 300, `${p.distanciaM} m, ${p.duracionS} s`);

  // Invertir y volver a dibujar tampoco consulta: lo mide y lo dibuja la red.
  const invertida = await retrazar(invertirOrden(p));
  assert.deepEqual(red.aOrs(), []);
  assert.equal(invertida.sinTrazado, false);
  assert.deepEqual(invertida.paradas.map((x) => x.id), [...p.paradas].reverse().map((x) => x.id));
});

test("con la red apagada en Diagnóstico, el armado vuelve a OpenRouteService", async (t) => {
  const red = vigilarLaRed(t, true);
  olvidarMatriz();
  apagarRed(true);
  t.after(() => apagarRed(false));
  await cargarDia("2026-09-02", 5);
  const p = await calcularRutaLocal("2026-09-02", { tipo: "gps", ...CENTRAL });
  assert.ok(red.aOrs().some((u) => u.includes("/v2/matrix")), "no pidió la matriz a ORS");
  assert.ok(red.aOrs().some((u) => u.includes("/v2/directions")), "no pidió el trazado a ORS");
  assert.equal(origenDelUltimoTrazado(), "ors");
  assert.equal(p.paradas.length, 5);
});

test("rutaPorCalles: un punto lejos de toda calle del mapa propio lo dibuja OpenRouteService", async (t) => {
  const red = vigilarLaRed(t, true);
  // En el mar, a kilómetros de la costa.
  const lejos = { lat: -18.5, lng: -70.6 };
  const ruta = await rutaPorCalles([CENTRAL, lejos, CENTRAL]);
  assert.ok(ruta, "sin trazado");
  assert.equal(origenDelUltimoTrazado(), "ors");
  assert.equal(red.aOrs().length, 1);

  // Y con los puntos sobre calles, la red propia, sin consultar.
  const propia = await rutaPorCalles([CENTRAL, DIA.puntos[3], DIA.puntos[4], CENTRAL]);
  assert.equal(origenDelUltimoTrazado(), "red");
  assert.equal(red.aOrs().length, 1, "volvió a consultar a ORS");
  assert.equal(propia.tramos.length, 3);
});
