// Spec 038 (tiempos): pruebas DORADAS del optimizador del orden. La 038 acelera
// ordenarParadas (tabla plana, Or-opt sin arreglos por jugada) y las jugadas con
// rumbo (bucles por índice) prometiendo el MISMO resultado: mismo orden, mismos
// sentidos y el mismo costo, bit a bit. Lo esperado se generó corriendo el código
// de ANTES de la 038 y quedó en fixtures/038-orden-dorado.json: si un cambio mueve
// una sola parada, o un costo en el último decimal, esto falla.
//
// Para volver a generarlo (solo con el código de antes de un cambio, nunca para
// «arreglar» una diferencia):
//   $env:ARES_DORADO_038="generar"; node --import ./pruebas/registrar.mjs --test pruebas/038-orden-dorado.test.mjs
//
// Los días son los del fixture de la spec 024 (puntos al azar, no direcciones de
// nadie), con calles estrechas y bultos inventados.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { conFinal, distanciaOrden } from "@/lib/rutas/orden-paradas/costo";
import { insercionMasBarata, vecinoMasCercano } from "@/lib/rutas/orden-paradas/construccion";
import { mejorarLocal } from "@/lib/rutas/orden-paradas/mejora";
import { mejorDeVariosArranques } from "@/lib/rutas/orden-paradas/perturbacion";
import { tableroDe } from "@/lib/rutas/orden-paradas/con-rumbo";
import { buscarConRumbo, ordenarConRumbo } from "@/lib/rutas/orden-paradas/con-rumbo-busqueda";
import { adelantarBultosConRumbo } from "@/lib/rutas/orden-paradas/descarga-con-rumbo";
import { penalizacionPorSentido } from "@/lib/encomiendas/local/generar-ruta/sentido";
import { METROS_POR_PARADA, TOLERANCIA_DESCARGA } from "@/lib/encomiendas/local/generar-ruta/bultos";
import { ordenPorEstrategia } from "@/lib/encomiendas/local/generar-ruta/estrategias";
import { matrizDeCosto } from "@/lib/encomiendas/local/generar-ruta/pesos";
import {
  azar,
  bultosAlAzar,
  DIA,
  diaConRed,
  estrategiasDelEscenario,
  MINUTO_DE_SALIDA,
  pedidosDelEscenario,
  recortar,
} from "./038-escenarios-ruta.mjs";

const GENERAR = process.env.ARES_DORADO_038 === "generar";
const RUTA = new URL("./fixtures/038-orden-dorado.json", import.meta.url);
const esperado = GENERAR ? {} : JSON.parse(readFileSync(RUTA, "utf8")).casos;
const obtenido = {};

/** Un número tal cual: JSON no guarda -0, Infinity ni NaN. */
function codificar(v) {
  if (typeof v === "number") return Object.is(v, -0) ? "-0" : Number.isFinite(v) ? v : String(v);
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v, codificar);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, codificar(x)]));
  return v;
}

/** Compara con lo generado antes de la 038 (o lo anota, generando). */
function dorado(nombre, valor) {
  const v = codificar(valor);
  if (GENERAR) {
    assert.ok(!(nombre in obtenido), `caso repetido: ${nombre}`);
    obtenido[nombre] = v;
    return;
  }
  obtenido[nombre] = true;
  assert.ok(nombre in esperado, `el fixture no tiene «${nombre}»`);
  assert.deepStrictEqual(v, esperado[nombre], nombre);
}

after(() => {
  if (!GENERAR) return;
  const lineas = Object.entries(obtenido).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const cabecera = [
    "Spec 038: lo que daba el optimizador ANTES de la 038, generado con 038-orden-dorado.test.mjs",
    "(ARES_DORADO_038=generar) sobre la copia del código de antes. Sin datos de nadie: puntos al azar",
    "del fixture de la spec 024 e ids inventados. No se regenera para arreglar una diferencia.",
  ];
  writeFileSync(RUTA, `{\n  "_lee_esto_primero": ${JSON.stringify(cabecera)},\n  "casos": {\n${lineas.join(",\n")}\n  }\n}\n`);
});

// ---------------------------------------------------------------------------
// Sin rumbo: ordenarParadas y sus piezas, sobre la matriz real de la spec 024
// ---------------------------------------------------------------------------

const COSTO = matrizDeCosto(DIA.metros, DIA.segundos);
const PUNTOS = DIA.puntos;
const vueltaDe = (m) => (i) => m[i][0];
/** Lo que mide un orden (el costo con su final), para fijarlo también bit a bit. */
const medir = (orden, m, vuelta, pen) => distanciaOrden(orden, conFinal((a, b) => m[a]?.[b] ?? Infinity, vuelta), pen);

/** Calles inventadas para los puntos: ~40 % estrechas (sentido.ts las cobra). */
function callesAlAzar(n, semilla) {
  const r = azar(semilla);
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return null;
    const estrecha = r() < 0.4;
    const eje = r() * 360;
    const extraM = r() < 0.5 ? 100 + r() * 1400 : null;
    return { clase: estrecha ? "calle" : "principal", eje, extraM };
  });
}

/** La descarga como la arma descargaDelGrupo (bultos.ts) para un grupo de k puntos. */
function descargaDe(k, semilla) {
  return {
    bultos: bultosAlAzar(k, semilla),
    matrizReal: recortar(DIA.metros, k),
    matrizBase: recortar(COSTO, k),
    vueltaReal: vueltaDe(DIA.metros),
    tolerancia: TOLERANCIA_DESCARGA,
    metrosPorParada: METROS_POR_PARADA,
  };
}

test("ordenarParadas, ruta cerrada: rápida con 80 y a fondo con todo con 40 (como ordenarGrupo)", () => {
  const vuelta = vueltaDe(COSTO);
  const rapida = ordenarParadas(PUNTOS, COSTO, vuelta, false);
  dorado("cerrada 80 rápida", { orden: rapida, costo: medir(rapida, COSTO, vuelta) });

  const sub = recortar(COSTO, 41);
  const aFondo = ordenarParadas(PUNTOS.slice(0, 41), sub, vuelta, true, {
    descarga: descargaDe(41, 3),
    arranquePorMetros: { matriz: recortar(DIA.metros, 41), vuelta: vueltaDe(DIA.metros) },
  });
  dorado("cerrada 40 a fondo con bultos y arranque por metros", { orden: aFondo, costo: medir(aFondo, sub, vuelta) });
});

test("ordenarParadas, ruta abierta sin vuelta: a fondo con 60 y rápida con 80", () => {
  const sub = recortar(COSTO, 61);
  const aFondo = ordenarParadas(PUNTOS.slice(0, 61), sub, undefined, true);
  dorado("abierta 60 a fondo", { orden: aFondo, costo: medir(aFondo, sub) });
  const rapida = ordenarParadas(PUNTOS, COSTO, undefined, false);
  dorado("abierta 80 rápida", { orden: rapida, costo: medir(rapida, COSTO) });
});

test("ordenarParadas en línea recta (sin matriz): abierta y cerrada", () => {
  const puntos = PUNTOS.slice(0, 51);
  const recta = puntos.map((a) => puntos.map((b) => distanciaMetros(a, b)));
  const abierta = ordenarParadas(puntos, null, undefined, false);
  dorado("línea recta 50 abierta rápida", { orden: abierta, costo: medir(abierta, recta) });
  const vuelta = (i) => distanciaMetros(puntos[i], puntos[0]);
  const cerrada = ordenarParadas(puntos, null, vuelta, true);
  dorado("línea recta 50 cerrada a fondo", { orden: cerrada, costo: medir(cerrada, recta, vuelta) });
});

test("ordenarParadas: día chico (exacto), con huecos en la matriz y con bultos", () => {
  const vuelta = vueltaDe(COSTO);
  const sub = recortar(COSTO, 13);
  dorado("exacto 12", ordenarParadas(PUNTOS.slice(0, 13), sub, vuelta, true));
  dorado("exacto 12 con bultos", ordenarParadas(PUNTOS.slice(0, 13), sub, vuelta, true, { descarga: descargaDe(13, 5) }));

  // Pares sin dato (null o fuera de la fila) y una vuelta imposible: Infinity.
  const r = azar(11);
  const huecos = recortar(COSTO, 31).map((fila, i) => fila.map((c, j) => (i !== j && r() < 0.06 ? null : c)));
  huecos[4].length = 20;
  const vueltaConHuecos = (i) => (i === 9 ? Infinity : COSTO[i][0]);
  const conHuecos = ordenarParadas(PUNTOS.slice(0, 31), huecos, vueltaConHuecos, true);
  dorado("30 con huecos a fondo", { orden: conHuecos, costo: medir(conHuecos, huecos, vueltaConHuecos) });
});

test("ordenarParadas con penalización, como ordenarConSentido (sentido.ts)", () => {
  // Como allá: los puntos en el orden de la ruta que ya está, el arranque es ese
  // orden, sin buscar a fondo y con los bultos.
  const k = 61;
  const vuelta0 = vueltaDe(COSTO);
  const previo = ordenarParadas(PUNTOS.slice(0, k), recortar(COSTO, k), vuelta0, false);
  const puntos = previo.map((i) => PUNTOS[i]);
  const sub = previo.map((f) => previo.map((c) => COSTO[f][c]));
  const real = previo.map((f) => previo.map((c) => DIA.metros[f][c]));
  const vuelta = (i) => COSTO[previo[i]][0];
  const pen = penalizacionPorSentido(puntos, callesAlAzar(k, 21));
  assert.ok(pen, "hay calles estrechas");
  const orden = ordenarParadas(puntos, sub, vuelta, false, {
    penalizacion: pen,
    arranque: puntos.map((_, i) => i),
    descarga: {
      bultos: bultosAlAzar(k, 9),
      matrizReal: real,
      matrizBase: sub,
      vueltaReal: (i) => DIA.metros[previo[i]][0],
      tolerancia: TOLERANCIA_DESCARGA,
      metrosPorParada: METROS_POR_PARADA,
    },
  });
  dorado("penalización 60 como sentido.ts", { orden, costo: medir(orden, sub, vuelta, pen) });

  // A fondo y en un día chico (con penalización no va al exacto).
  for (const n of [31, 13]) {
    const p = penalizacionPorSentido(PUNTOS.slice(0, n), callesAlAzar(n, n));
    const s = recortar(COSTO, n);
    const o = ordenarParadas(PUNTOS.slice(0, n), s, vuelta0, true, { penalizacion: p });
    dorado(`penalización ${n - 1} a fondo`, { orden: o, costo: medir(o, s, vuelta0, p) });
  }
});

test("las piezas: construcción, mejora local y mejorDeVariosArranques con 40, 60 y 80", () => {
  for (const n of [41, 61, 81]) {
    const sub = recortar(COSTO, n);
    const vuelta = vueltaDe(COSTO);
    const costo = conFinal((a, b) => sub[a]?.[b] ?? Infinity, vuelta);
    const vecino = vecinoMasCercano(n, costo);
    const insercion = insercionMasBarata(n, costo);
    const forzado = vecinoMasCercano(n, costo, 5);
    dorado(`construcción ${n - 1}`, { vecino, insercion, forzado });
    dorado(`mejorarLocal ${n - 1}`, mejorarLocal(insercion, costo));
    const mejor = mejorDeVariosArranques([vecino, insercion, forzado], costo, true);
    dorado(`mejorDeVariosArranques ${n - 1} a fondo`, { orden: mejor, costo: distanciaOrden(mejor, costo) });
  }
  // Con penalización: las cuentas de la penalización por jugada (mejora.ts).
  const n = 61;
  const sub = recortar(COSTO, n);
  const costo = conFinal((a, b) => sub[a][b], vueltaDe(COSTO));
  const pen = penalizacionPorSentido(PUNTOS.slice(0, n), callesAlAzar(n, 77));
  const inicial = Array.from({ length: n }, (_, i) => i);
  dorado("mejorarLocal 60 con penalización", mejorarLocal(inicial, costo, pen));
  const mejor = mejorDeVariosArranques([inicial, vecinoMasCercano(n, costo)], costo, false, pen);
  dorado("mejorDeVariosArranques 60 con penalización", { orden: mejor, costo: distanciaOrden(mejor, costo, pen) });
});

// ---------------------------------------------------------------------------
// Con rumbo (spec 031): la búsqueda, el sentido de cada parada y los bultos
// ---------------------------------------------------------------------------

/** Una vez por archivo y dentro de las pruebas: un await suelto entre dos pruebas
 *  adelanta el `after` que escribe el fixture. */
function unaVez(calcular) {
  let valor = null;
  return () => (valor ??= calcular());
}
const dia80 = unaVez(() => diaConRed(80));
const ruta80 = unaVez(async () => {
  const { red, sinRumbo } = await dia80();
  return ordenarConRumbo(red.dia, [sinRumbo], true);
});
const dia60 = unaVez(() => diaConRed(60));

test("ordenarConRumbo, ruta cerrada: 80 a fondo, 80 rápida y 40 a fondo", async () => {
  const DIA_80 = await dia80();
  const ruta = await ruta80();
  dorado("con rumbo cerrada 80 a fondo", ruta);
  dorado("con rumbo cerrada 80 rápida", ordenarConRumbo(DIA_80.red.dia, [DIA_80.sinRumbo], false));
  const dia40 = await diaConRed(40);
  dorado("con rumbo cerrada 40 a fondo", ordenarConRumbo(dia40.red.dia, [dia40.sinRumbo], true));

  // La misma búsqueda por partes (buscarConRumbo, como la corre la pantalla).
  const pasos = buscarConRumbo(DIA_80.red.dia, [DIA_80.sinRumbo], true);
  let paso = pasos.next();
  let cedidas = 0;
  while (!paso.done) {
    cedidas++;
    paso = pasos.next();
  }
  assert.deepStrictEqual(codificar(paso.value), codificar(ruta), "por partes da lo mismo");
  dorado("con rumbo cerrada 80: veces que cede", cedidas);
});

test("ordenarConRumbo terminando en otro lado (60 paradas y la central)", async () => {
  const dia = await diaConRed(60, true);
  const ruta = ordenarConRumbo(dia.red.dia, [dia.sinRumbo], true);
  dorado("con rumbo otro lado 60 a fondo", ruta);
  dorado("con rumbo otro lado 60: sin rumbo", dia.sinRumbo);
  const bultos = bultosAlAzar(dia.puntos.length, 41);
  dorado(
    "con rumbo otro lado 60: bultos de 1 a 4",
    adelantarBultosConRumbo(tableroDe(dia.red.dia), ruta, {
      bultos,
      metros: dia.red.conRumbo.metros,
      tolerancia: TOLERANCIA_DESCARGA,
      metrosPorParada: METROS_POR_PARADA,
    }),
  );
});

test("adelantarBultosConRumbo con bultos de 1 a 4 (y todos de a uno)", async () => {
  const DIA_80 = await dia80();
  const ruta = await ruta80();
  const t = tableroDe(DIA_80.red.dia);
  const d = { metros: DIA_80.red.conRumbo.metros, tolerancia: TOLERANCIA_DESCARGA, metrosPorParada: METROS_POR_PARADA };
  dorado("con rumbo cerrada 80: sin rumbo", DIA_80.sinRumbo);
  for (const semilla of [1, 2, 3]) {
    dorado(`bultos 1 a 4 (semilla ${semilla})`, adelantarBultosConRumbo(t, ruta, { ...d, bultos: bultosAlAzar(81, semilla) }));
  }
  dorado("bultos todos 1", adelantarBultosConRumbo(t, ruta, { ...d, bultos: Array(81).fill(1) }));
});

// ---------------------------------------------------------------------------
// Las estrategias del armado (estrategias.ts y horarios.ts) con la red propia
// ---------------------------------------------------------------------------

test("estrategias: 10 confirmados", async () => {
  dorado("estrategias 10 confirmados", await estrategiasDelEscenario(await dia60(), pedidosDelEscenario("10 confirmados", 60)));
});

test("estrategias: 5 con bloque (y bultos de 1 a 4)", async () => {
  const pedidos = pedidosDelEscenario("5 con bloque", 60, bultosAlAzar(61, 17));
  dorado("estrategias 5 con bloque", await estrategiasDelEscenario(await dia60(), pedidos));
});

test("estrategias: un «Pidió otra hora»", async () => {
  dorado("estrategias Pidió otra hora", await estrategiasDelEscenario(await dia60(), pedidosDelEscenario("Pidió otra hora", 60)));
});

test("estrategia «La más económica» sin la red (el respaldo de ORS), con bultos", async () => {
  const DIA_60 = await dia60();
  const pedidos = pedidosDelEscenario("10 confirmados", 60, bultosAlAzar(61, 23));
  const indice = new Map(pedidos.map((p, i) => [p.id, i + 1]));
  const descarga = { matriz: DIA_60.matriz, base: DIA_60.costo, tolerancia: TOLERANCIA_DESCARGA };
  const base = DIA_60.puntos[0];
  const corta = ordenPorEstrategia("corta", base, pedidos, indice, DIA_60.costo, MINUTO_DE_SALIDA, base, descarga);
  dorado("estrategia corta sin red 60", corta.map((p) => p.id));
});

// ---------------------------------------------------------------------------
// La tabla plana (spec 038): no copia números corridos de una tabla más chica
// ---------------------------------------------------------------------------

test("enTabla: una tabla que alcanza se usa tal cual; una más chica no se rearma", async (t) => {
  // Import dinámico: en el código de antes (donde se genera el fixture) no existe.
  const { enTabla } = await import("@/lib/rutas/orden-paradas/costo");
  if (!enTabla) return t.skip("el código de antes no tiene tabla plana");
  const sub = recortar(COSTO, 5);
  const chica = enTabla(5, conFinal((a, b) => sub[a][b], vueltaDe(COSTO)));
  assert.strictEqual(enTabla(4, chica), chica);
  assert.strictEqual(chica(2, 3), sub[2][3]);
  assert.strictEqual(chica(2, -1), COSTO[2][0]);
  assert.throws(() => enTabla(6, chica), RangeError);
  assert.throws(() => mejorarLocal([0, 1, 2, 3, 4, 5], chica), RangeError);
});

test("el fixture no tiene casos que ya no se prueban", { skip: GENERAR }, () => {
  assert.deepStrictEqual(Object.keys(esperado).filter((k) => !(k in obtenido)), []);
});
