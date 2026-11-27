// Spec 047: ARES guía. La cámara desde arriba que se acerca sola (_mapa/camara.ts),
// cuándo trazar de nuevo al salirse de la línea (geo/desvio.ts) y la línea desde el
// auto con la red propia (geo/red/desde-el-auto.ts). Puntos de juguete alrededor de
// un punto de Arica y calles reales con puntos inventados: no son de nadie.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distanciaMetros, rumboEntre } from "@/lib/geo/coordenada";
import { encuadreGirado, puntosDelEncuadre, ZOOM_MAXIMO_ENCUADRE, ZOOM_PISO_NAVEGACION } from "@/app/(conductor)/conductor/encomiendas/_mapa/camara";
import { hayQueRetrazar, MS_ENTRE_TRAZADOS, SIN_DESVIO } from "@/lib/geo/desvio";
import { rumboAlLlegar } from "@/lib/geo/hacia-parada";
import { armarRed } from "@/lib/geo/red/grafo";
import { RED_ARICA } from "@/lib/geo/red/red-arica";
import { entregaEn } from "@/lib/geo/red/entrada";
import { sentidoSegunRumbo, trazarDesdeElAuto } from "@/lib/geo/red/desde-el-auto";
import { desplazar } from "@/lib/encomiendas/local/gps-simulado";
import { contarVueltasEnU } from "@/lib/geo/trazado";
import { CUADRA, en, grilla } from "./red-de-juguete.mjs";

const BASE = { lat: -18.47, lng: -70.3 };
const M_LAT = 1 / 111_195;
const M_LNG = 1 / (111_195 * Math.cos((BASE.lat * Math.PI) / 180));
/** El punto `x` metros al este y `y` al norte de la base. */
const xy = (x, y) => ({ lat: BASE.lat + y * M_LAT, lng: BASE.lng + x * M_LNG });
const ll = (x, y) => [xy(x, y).lng, xy(x, y).lat];

// La pantalla del V2430 a 360 px: el carril arriba y la hoja cerrada con sus botones abajo.
const VISTA = { ancho: 360, alto: 800, arriba: 76, abajo: 212, lados: 48 };

/** Dónde queda el auto en lo visible, de 0 (arriba) a 1 (abajo), y a qué metros por pixel. */
function dondeQuedaElAuto(auto, { centro, zoom }, rumbo, vista = VISTA) {
  const mpp = (78_271.517 * Math.cos((auto.lat * Math.PI) / 180)) / 2 ** zoom;
  const x = (centro.lng - auto.lng) / M_LNG;
  const y = (centro.lat - auto.lat) / M_LAT;
  const r = (rumbo * Math.PI) / 180;
  const v = x * Math.sin(r) + y * Math.cos(r);
  const altoPx = vista.alto - vista.arriba - vista.abajo;
  return { desdeArriba: 0.5 + v / (altoPx * mpp), mpp };
}

test("puntosDelEncuadre: la línea por delante hasta 800 m, y la parada si queda antes", () => {
  const auto = xy(0, 0);
  const lejos = puntosDelEncuadre(auto, [ll(0, 0), ll(0, 1000), ll(0, 3000)], xy(0, 3000));
  assert.ok(Math.abs(distanciaMetros(auto, lejos.at(-1)) - 800) < 2, "corta a 800 m");
  const cerca = puntosDelEncuadre(auto, [ll(0, 0), ll(300, 0), ll(300, 200)], xy(300, 200));
  assert.ok(distanciaMetros(cerca.at(-1), xy(300, 200)) < 1, "llega a la parada");
  // Sin línea (fuera del tramo), la recta a la parada con el mismo tope.
  const recta = puntosDelEncuadre(auto, null, xy(0, 5000));
  assert.ok(Math.abs(distanciaMetros(auto, recta.at(-1)) - 800) < 2);
});

test("encuadreGirado: lejos ~800 m de calles (zoom 15-17) y se acerca solo hasta la cuadra", () => {
  const auto = xy(0, 0);
  let antes = 0;
  const zooms = [];
  for (const metros of [3000, 800, 500, 300, 150, 40]) {
    const puntos = puntosDelEncuadre(auto, [ll(0, 0), ll(0, metros)], xy(0, metros));
    const cam = encuadreGirado(puntos, 0, VISTA);
    assert.ok(cam.zoom >= ZOOM_PISO_NAVEGACION && cam.zoom <= ZOOM_MAXIMO_ENCUADRE, `zoom ${cam.zoom}`);
    assert.ok(cam.zoom >= antes - 1e-9, "al acercarse no se aleja");
    antes = cam.zoom;
    zooms.push(cam.zoom.toFixed(2));
    const { desdeArriba } = dondeQuedaElAuto(auto, cam, 0);
    assert.ok(desdeArriba >= 0.2 - 1e-6 && desdeArriba <= 0.8 + 1e-6, `auto al ${desdeArriba}`);
  }
  // Lejos se ven las calles (Liberty nombra las chicas desde el 15) y encima de la parada, la cuadra.
  assert.ok(Number(zooms[0]) > 15 && Number(zooms[0]) <= 15.6, `lejos: ${zooms[0]}`);
  console.log(`  zoom según lo que falta (3000 · 800 · 500 · 300 · 150 · 40 m): ${zooms.join(" · ")}`);
  assert.equal(Number(zooms.at(-1)), ZOOM_MAXIMO_ENCUADRE);
});

test("encuadreGirado: girado al rumbo da el mismo zoom, y el camino queda arriba del auto", () => {
  const auto = xy(0, 0);
  const alNorte = encuadreGirado(puntosDelEncuadre(auto, [ll(0, 0), ll(0, 900)], null), 0, VISTA);
  const alEste = encuadreGirado(puntosDelEncuadre(auto, [ll(0, 0), ll(900, 0)], null), 90, VISTA);
  assert.ok(Math.abs(alNorte.zoom - alEste.zoom) < 1e-6);
  // Mirando al este, el centro queda al este del auto (el camino, arriba en la pantalla).
  assert.ok(alEste.centro.lng > auto.lng && Math.abs(alEste.centro.lat - auto.lat) < 50 * M_LAT);
});

test("encuadreGirado: un camino que no cabe deja el zoom en el piso y el auto a la vista", () => {
  const auto = xy(0, 0);
  // Un zigzag que se abre 1 km a cada lado.
  const puntos = puntosDelEncuadre(auto, [ll(0, 0), ll(-1000, 100), ll(1000, 200)], null);
  const cam = encuadreGirado(puntos, 0, VISTA);
  assert.equal(cam.zoom, ZOOM_PISO_NAVEGACION);
  const { desdeArriba } = dondeQuedaElAuto(auto, cam, 0);
  assert.ok(desdeArriba >= 0.2 && desdeArriba <= 0.8 + 1e-6);
});

test("hayQueRetrazar: dos lecturas lejos de la línea, una vez cada 5 s, de cero en otra parada", () => {
  let e = SIN_DESVIO;
  const leer = (metros, ahora, extra = {}) => {
    const r = hayQueRetrazar(e, { clave: "A", metrosALaLinea: metros, ahora, ...extra });
    e = r.estado;
    return r.retrazar;
  };
  assert.equal(leer(10, 0), false, "sobre la línea");
  assert.equal(leer(60, 1000), false, "una sola lectura lejos puede ser el GPS");
  assert.equal(leer(null, 2000), true, "dos seguidas: se traza");
  assert.equal(leer(70, 3000), false);
  assert.equal(leer(70, 4000), false, "antes de 5 s no se vuelve a trazar");
  assert.equal(leer(70, 2000 + MS_ENTRE_TRAZADOS), true);
  // Volver a la línea borra la cuenta.
  assert.equal(leer(80, 20_000), false);
  assert.equal(leer(5, 21_000), false);
  assert.equal(leer(80, 22_000), false);
  // Imprecisa: no cuenta.
  assert.equal(leer(80, 23_000, { precisionM: 120 }), false);
  assert.equal(leer(80, 24_000), true);
  // Sin línea (otra parada, ruta reordenada): con la primera lectura.
  assert.equal(hayQueRetrazar(e, { clave: "B", metrosALaLinea: null, sinLinea: true, ahora: 25_000 }).retrazar, true);
  assert.equal(hayQueRetrazar(e, { clave: null, metrosALaLinea: null, sinLinea: true, ahora: 25_000 }).retrazar, false);
});

test("rumboAlLlegar: el rumbo de los últimos metros de la línea", () => {
  assert.ok(Math.abs(rumboAlLlegar([ll(0, 0), ll(200, 0), ll(200, 100)]) - 0) < 1);
  assert.ok(Math.abs(rumboAlLlegar([ll(0, 0), ll(200, 0)]) - 90) < 1);
  assert.equal(rumboAlLlegar([ll(0, 0)]), null);
});

test("desplazar (GPS simulado): 120 m hacia el rumbo", () => {
  const p = desplazar(BASE, 90, 120);
  assert.ok(Math.abs(distanciaMetros(BASE, p) - 120) < 1);
  assert.ok(Math.abs(rumboEntre(BASE, p) - 90) < 1);
});

// La grilla de juguete: 3 filas × 5 columnas de cuadras residenciales (sin U).
//   0 — 1 — 2 — 3 — 4
//   5 — 6 — 7 — 8 — 9
//  10 —11 —12 —13 —14
const medioDe = (a, b) => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });

test("trazarDesdeElAuto: sale hacia donde va el auto, sin U en calle angosta, y llega a la parada", () => {
  const { red } = grilla(3, 5);
  const auto = medioDe(en(0, 1), en(0, 2)); // a mitad de la cuadra 1 — 2
  const parada = medioDe(en(2, 0), en(2, 1)); // abajo a la izquierda
  // Hacia el oeste: derecho por su calle.
  const alOeste = trazarDesdeElAuto(red, auto, 270, parada);
  assert.ok(alOeste);
  assert.ok(Math.abs(rumboEntre(auto, { lng: alOeste.linea[1][0], lat: alOeste.linea[1][1] }) - 270) < 5, "sale al oeste");
  // Hacia el este (de espaldas a la parada): no da la vuelta en la cuadra, sigue al este.
  const alEste = trazarDesdeElAuto(red, auto, 90, parada);
  assert.ok(alEste);
  assert.ok(Math.abs(rumboEntre(auto, { lng: alEste.linea[1][0], lat: alEste.linea[1][1] }) - 90) < 5, "sale al este");
  assert.ok(alEste.metros > alOeste.metros, "dar la vuelta a la manzana cuesta más");
  assert.equal(contarVueltasEnU(alEste.linea), 0);
  // Las dos terminan en la parada.
  for (const c of [alOeste, alEste]) assert.ok(distanciaMetros({ lng: c.linea.at(-1)[0], lat: c.linea.at(-1)[1] }, parada) < 5);
  // Sin rumbo, la más corta.
  assert.ok(Math.abs(trazarDesdeElAuto(red, auto, null, parada).metros - alOeste.metros) < 1);
});

test("trazarDesdeElAuto: llega en el sentido en que llegaba la línea del día", () => {
  const { red } = grilla(3, 5);
  const auto = medioDe(en(1, 2), en(1, 3));
  const parada = medioDe(en(0, 1), en(0, 2)); // en la fila de arriba
  const rumbos = [90, 270].map((llegando) => {
    const c = trazarDesdeElAuto(red, auto, null, parada, llegando);
    return rumboEntre({ lng: c.linea.at(-2)[0], lat: c.linea.at(-2)[1] }, { lng: c.linea.at(-1)[0], lat: c.linea.at(-1)[1] });
  });
  assert.ok(Math.abs(rumbos[0] - 90) < 5, `llega al este: ${rumbos[0]}`);
  assert.ok(Math.abs(rumbos[1] - 270) < 5, `llega al oeste: ${rumbos[1]}`);
});

test("trazarDesdeElAuto: lejos de toda calle no traza", () => {
  const { red } = grilla(3, 5);
  assert.equal(trazarDesdeElAuto(red, { lat: en(0, 0).lat + 10 * CUADRA, lng: en(0, 0).lng }, null, en(2, 4)), null);
  assert.equal(sentidoSegunRumbo(red, 0, 0.5, 0), null, "una calle este-oeste no va al norte");
});

test("trazarDesdeElAuto sobre la red de Arica: llega a donde se entrega, rápido y sin consultas", () => {
  const red = armarRed(RED_ARICA);
  const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("no debe consultar a nadie");
  };
  try {
    const pares = [
      [1, 5],
      [3, 9],
      [7, 2],
      [12, 4],
    ].filter(([a, b]) => DIA.puntos[a] && DIA.puntos[b]);
    assert.ok(pares.length >= 3);
    const ms = [];
    for (const [a, b] of pares) {
      const auto = DIA.puntos[a];
      const parada = DIA.puntos[b];
      const entrega = entregaEn(red, parada);
      assert.ok(entrega);
      const inicio = performance.now();
      const sinRumbo = trazarDesdeElAuto(red, auto, null, parada);
      ms.push(performance.now() - inicio);
      assert.ok(sinRumbo, `${a} → ${b}`);
      assert.ok(sinRumbo.metros >= distanciaMetros(auto, parada) * 0.7, "por calles no es menos que la recta");
      // Con rumbo: la línea parte hacia donde va el auto (o la calle no va para allá).
      const salida = { lng: sinRumbo.linea[1][0], lat: sinRumbo.linea[1][1] };
      const rumbo = rumboEntre({ lng: sinRumbo.linea[0][0], lat: sinRumbo.linea[0][1] }, salida);
      const conRumbo = trazarDesdeElAuto(red, auto, rumbo, parada);
      assert.ok(conRumbo && conRumbo.metros <= sinRumbo.metros * 1.5 + 50);
    }
    // Primera búsqueda arma la memoria de la red; después, pocos ms por trazado.
    console.log(`  trazarDesdeElAuto en Arica: ${ms.map((m) => m.toFixed(1)).join(" · ")} ms`);
    assert.ok(Math.max(...ms.slice(1)) < 250, `ms: ${ms.join(", ")}`);
  } finally {
    globalThis.fetch = original;
  }
});
