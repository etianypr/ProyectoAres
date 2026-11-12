// Spec 030 (dueño, 2026-11-12): el orden de la ruta ya no cobra por cambiar de barrio
// («cada zona una sola vez») ni por sectores; manda el costo solo. Los sectores del
// plano municipal quedan como dato (geo/sectores-arica.ts) para decir a cuál va cada
// bulto al escanear.
//
// Lo que se prueba: el sector de un punto, que el armado no usa zonas ni sectores, y
// que con la matriz real de un día simulado el orden sin la regla de barrios no
// cuesta más que con ella.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { sectorDe, SECTORES_ARICA } from "@/lib/geo/sectores-arica";
import { matrizDeCosto, pesosDeManejar } from "@/lib/encomiendas/local/generar-ruta/pesos";
import { matrizPorZonas, zonasPorCercania } from "@/lib/encomiendas/local/generar-ruta/zonas";

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));

test("sectorDe: lugares públicos conocidos caen en su sector, y siempre hay sector", () => {
  // El Morro y la plaza de la catedral.
  assert.equal(sectorDe({ lat: -18.4803, lng: -70.3239 }), "Centro");
  assert.equal(sectorDe({ lat: -18.4783, lng: -70.3207 }), "Centro");
  // El terminal de buses, al norte del río San José.
  assert.equal(sectorDe({ lat: -18.4728, lng: -70.299 }), "San José");
  // En el mar frente a Chinchorro: fuera de todos, toma el del borde más cercano.
  assert.equal(sectorDe({ lat: -18.456, lng: -70.31 }), "Borde Costero");
  // Los puntos del día simulado: todos con un sector de la lista.
  for (const p of DIA.puntos) assert.ok(SECTORES_ARICA.includes(sectorDe(p)));
});

test("el armado de la ruta no cobra por cambiar de barrio ni de sector", () => {
  const armado = readFileSync(new URL("../src/lib/encomiendas/local/generar-ruta/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(armado, /from "\.\/zonas"/, "el armado volvió a usar las zonas de barrio");
  assert.doesNotMatch(armado, /sectores-arica|from "\.\/sectores"/, "el armado usa los sectores");
});

test("con la matriz real de un día de 80 paradas: sin la regla de barrios la ruta no cuesta más", () => {
  // Como ordenarGrupo (estrategias.ts): el costo, y el mejor orden por metros como
  // un arranque más. Con zonas, lo que se hacía antes.
  const { puntos, metros, segundos } = DIA;
  const costo = matrizDeCosto(metros, segundos);
  const zonas = zonasPorCercania(metros);
  const ordenar = (c, m) => ordenarParadas(puntos, c, (i) => c[i][0], true, { arranquePorMetros: { matriz: m, vuelta: (i) => metros[i][0] } });
  const medir = (orden) => {
    let m = 0;
    let s = 0;
    orden.forEach((a, k) => {
      const b = orden[k + 1] ?? 0;
      m += metros[a][b];
      s += segundos[a][b];
    });
    return { m, pesos: pesosDeManejar(m, s) };
  };
  const sin = medir(ordenar(costo, metros));
  const con = medir(ordenar(matrizPorZonas(costo, zonas), matrizPorZonas(metros, zonas)));
  assert.ok(sin.pesos <= con.pesos, `sin zonas cuesta ${Math.round(sin.pesos)} y con zonas ${Math.round(con.pesos)}`);
  assert.ok(sin.m <= con.m, `sin zonas ${sin.m} m y con zonas ${con.m} m`);
});
