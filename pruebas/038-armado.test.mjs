// Spec 038 (tiempos), el armado de la ruta: bajar las esperas de «Optimizar ruta» sin
// cambiar la ruta.
//
// Las pruebas DORADAS fijan lo que el código de antes de la 038 devolvía: los valores de
// `fixtures/038-armado-propuestas.json` salieron de correr este mismo archivo en la copia
// del código anterior (ARES_038_GENERAR=<fixture>), y acá se comparan campo por campo.
// Cubren la propuesta sin bloques, con un bloque vigente y con uno que ya cerró (con la
// red propia y con el respaldo de ORS), la propuesta que se repite al cambiar el cuarto
// de hora, la calle por donde se llega a una parada pegada a una carretera y el reintento
// de ubicar.
//
// Las demás fijan lo nuevo de la 038, y se saltan al generar el fixture: la partida como
// promesa (el GPS de «Mi ubicación» se espera junto con lo demás), los errores del GPS
// iguales que antes, el corte sin conexión al reintentar ubicar, la revisión de accesos en
// grupo continuo de 6 que no guarda lo que no pudo leer, y más teselas en memoria.
//
// Sin red de verdad: el `fetch` global es un doble (teselas de OpenFreeMap armadas acá,
// Nominatim con respuestas fijas, ORS caído). Los puntos son los del fixture de la matriz
// (al azar sobre calles de Arica): no son de nadie; las direcciones son inventadas.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { PbfWriter } from "pbf";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const generar = await import("@/lib/encomiendas/local/generar-ruta");
const { calcularRutaLocal } = generar;
const ubicarPedidos = await import("@/lib/encomiendas/local/generar-ruta/ubicar-pedidos");
const { olvidarMatriz } = await import("@/lib/geo/matriz");
const { apagarRed } = await import("@/lib/geo/red/grafo");
const teselasMod = await import("@/lib/geo/teselas");
const { teselasAlrededor, ZOOM } = teselasMod;
const { plusCodeDe } = await import("@/lib/geo/plus-code");
const reloj = await import("./dobles/reloj.mjs");

const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
const CENTRAL = { tipo: "gps", lat: DIA.puntos[0].lat, lng: DIA.puntos[0].lng };
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

// ------------------------------------------------------------------ el fixture dorado
/** Solo en la copia del código de antes: dónde escribir lo que da. */
const GENERAR = process.env.ARES_038_GENERAR ?? null;
const FIXTURE = new URL("./fixtures/038-armado-propuestas.json", import.meta.url);
const esperado = GENERAR ? {} : JSON.parse(readFileSync(FIXTURE, "utf8"));
const generado = {};
/** Lo nuevo de la 038 no existe en el código de antes: no corre al generar. */
const nuevo = GENERAR ? test.skip : test;

function dorado(nombre, valor) {
  const plano = JSON.parse(JSON.stringify(valor));
  if (GENERAR) {
    generado[nombre] = plano;
    return;
  }
  assert.ok(nombre in esperado, `falta «${nombre}» en el fixture`);
  assert.deepEqual(plano, esperado[nombre], nombre);
}

test.after(() => {
  if (GENERAR) writeFileSync(GENERAR, `${JSON.stringify(generado, null, 1)}\n`);
});

const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/** La propuesta sin lo que cambia de una corrida a otra: los ids (al azar) pasan a ser el
 *  nombre inventado del pedido, cada pedido queda en nombre y punto, y el trazado en su
 *  largo y su huella. */
function resumen(p, pedidos) {
  const nombre = new Map(pedidos.map((x) => [x.id, x.nombre]));
  const limpiar = (v) => {
    if (Array.isArray(v)) return v.map(limpiar);
    if (v && typeof v === "object") {
      if (typeof v.id === "string" && nombre.has(v.id) && "direccion" in v) return { nombre: v.nombre, lat: v.lat, lng: v.lng };
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiar(x)]));
    }
    return typeof v === "string" && nombre.has(v) ? `@${nombre.get(v)}` : v;
  };
  const { trazado, ...resto } = p;
  return { ...limpiar(resto), trazado: trazado ? { puntos: trazado.length, huella: sha(trazado) } : null };
}

/** Lo guardado en el teléfono: punto y ⚠ de cada pedido, por nombre. */
async function guardados(fecha) {
  const pedidos = await almacen.leerPedidos(fecha);
  return pedidos
    .map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng, problemas: (p.problemas ?? []).map((x) => x.tipo) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ------------------------------------------------------------------ el doble de la red
/** "sin_red": todo falla como sin señal. "con_red": teselas y Nominatim contestan; ORS no. */
let modo = "sin_red";
let consultas = [];
/** Nominatim: lo que contesta a cada consulta (sin ", Arica, Chile"). */
let osm = () => [];
/** Retiene la tesela x/y hasta que se suelte la promesa (para ver qué se pide mientras). */
let retener = () => null;
let enVuelo = 0;
let maxEnVuelo = 0;

const TILEJSON = "https://tiles.openfreemap.org/planet";
const PLANTILLA = "https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf";
const fetchOriginal = globalThis.fetch;

test.before(() => {
  process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";
  globalThis.fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    consultas.push(url);
    if (modo === "sin_red") throw new TypeError("sin red (prueba)");
    if (url === TILEJSON) return Response.json({ tiles: [PLANTILLA] });
    const m = /\/planet\/v1\/14\/(\d+)\/(\d+)\.pbf$/.exec(url);
    if (m) {
      enVuelo++;
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
      try {
        await retener(Number(m[1]), Number(m[2]));
        return new Response(teselaFalsa(Number(m[1]), Number(m[2])));
      } finally {
        enVuelo--;
      }
    }
    if (url.startsWith("https://nominatim.openstreetmap.org/")) {
      const q = (new URL(url).searchParams.get("q") ?? "").replace(/, Arica, Chile$/, "");
      // Como el fetch de verdad: abortar la señal corta la consulta colgada.
      const senal = init?.signal;
      const cuerpo = await new Promise((listo, falla) => {
        senal?.addEventListener("abort", () => falla(new DOMException("abortada", "AbortError")), { once: true });
        Promise.resolve(osm(q)).then(listo, falla);
      });
      return Response.json(cuerpo);
    }
    throw new TypeError("sin red (prueba)");
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});
test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
  modo = "sin_red";
  consultas = [];
  osm = () => [];
  retener = () => null;
  maxEnVuelo = 0;
  olvidarMatriz();
  ubicarPedidos.olvidarAccesos();
});

// ------------------------------------------------------------------ teselas de mentira
// Una tesela vectorial con el formato de OpenMapTiles (como en 2-rutas.test.mjs): cada
// capa lleva líneas { clase, nombre, puntos: [[lng, lat], …] }.
function teselaDePrueba(x, y, capas) {
  const n = 2 ** ZOOM;
  const px = (lng) => Math.round((((lng + 180) / 360) * n - x) * 4096);
  const py = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.round((((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - y) * 4096);
  };
  const zz = (v) => (v << 1) ^ (v >> 31);
  const pbf = new PbfWriter();
  for (const [nombre, lineas] of Object.entries(capas)) {
    const valores = [];
    const indice = (v) => (valores.includes(v) ? valores.indexOf(v) : valores.push(v) - 1);
    pbf.writeMessage(3, (_, p) => {
      p.writeVarintField(15, 2);
      p.writeStringField(1, nombre);
      for (const l of lineas) {
        p.writeMessage(2, (__, f) => {
          const tags = [0, indice(l.clase)];
          if (l.nombre) tags.push(1, indice(l.nombre));
          f.writePackedVarint(2, tags);
          f.writeVarintField(3, 2);
          let cx = 0;
          let cy = 0;
          const geo = [];
          l.puntos.forEach(([lng, lat], i) => {
            if (i === 0) geo.push((1 & 7) | (1 << 3));
            if (i === 1) geo.push((2 & 7) | ((l.puntos.length - 1) << 3));
            const [gx, gy] = [px(lng), py(lat)];
            geo.push(zz(gx - cx), zz(gy - cy));
            [cx, cy] = [gx, gy];
          });
          f.writePackedVarint(4, geo);
        });
      }
      for (const c of ["class", "name"]) p.writeStringField(3, c);
      for (const v of valores) p.writeMessage(4, (___, w) => w.writeStringField(1, v));
      p.writeVarintField(5, 4096);
    });
  }
  return pbf.finish();
}

/** Puntos con una troncal 5 m al oeste y una calle local 40 m al este: el acceso los
 *  corre a la local (acceso.ts). La tesela de cada uno trae sus dos líneas. */
const CON_TRONCAL = [];
function teselaFalsa(x, y) {
  const aca = CON_TRONCAL.filter((p) => {
    const [t] = teselasAlrededor(p, 0);
    return t.x === x && t.y === y;
  });
  if (aca.length === 0) return teselaDePrueba(x, y, {});
  const sinNombre = [];
  const conNombre = [];
  for (const p of aca) {
    const m = 1 / (111_320 * Math.cos((p.lat * Math.PI) / 180));
    const norteSur = (dx) => [[p.lng + dx * m, p.lat + 0.002], [p.lng + dx * m, p.lat - 0.002]];
    sinNombre.push({ clase: "trunk", puntos: norteSur(-5) }, { clase: "minor", puntos: norteSur(40) });
    conNombre.push({ clase: "trunk", nombre: "Avenida Capitán Ávalos", puntos: norteSur(-5) }, { clase: "minor", nombre: "Zapiga", puntos: norteSur(40) });
  }
  return teselaDePrueba(x, y, { transportation: sinNombre, transportation_name: conNombre });
}

/** El centro de la tesela x/y: a 150 m no toca otra. Para puntos lejos del día de prueba. */
function centroDe(x, y) {
  const n = 2 ** ZOOM;
  return {
    lng: ((x + 0.5) / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI,
  };
}
/** Una zona sin pedidos de las otras pruebas (teselas que nadie bajó todavía). */
const [LEJOS] = teselasAlrededor({ lat: -18.9, lng: -70.0 }, 0);

// ------------------------------------------------------------------ el día de prueba
/** Congela el reloj a una hora de hoy, en hora local (como en asistencia-rutas). */
function aLaHora(hora, minutos = 0) {
  const hoy = new Date();
  return reloj.congelar(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), hora, minutos, 0, 0).getTime());
}

/** El orden de los pedidos (leerPedidos: el último cargado primero) es el de la matriz, y
 *  con la hora de verdad dos pedidos del mismo milisegundo salen en cualquier orden. Acá
 *  cada uno lleva su id y su hora de carga, uno detrás de otro. */
let ultimoId = 0;
async function guardar(datos, fecha) {
  const n = ++ultimoId;
  const pedido = await almacen.guardarPedido(datos, fecha, `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`);
  const fijo = { ...pedido, cargadoEn: new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString() };
  await idb.escribir([idb.STORES.pedidos], ({ guardar: g }) => g(idb.STORES.pedidos, fijo));
  return fijo;
}

/** Pedidos en los puntos `desde…hasta` del fixture; `bloques` y `confirmados` por número. */
async function dia(fecha, desde, hasta, { bloques = {}, confirmados = [] } = {}) {
  const pedidos = [];
  for (let i = desde; i <= hasta; i++) {
    const p = DIA.puntos[i];
    const pedido = await guardar(
      { nombre: `Prueba ${i}`, telefono: null, direccion: `Calle inventada ${i}00, Arica`, lat: p.lat, lng: p.lng, notas: null },
      fecha,
    );
    if (bloques[i]) {
      await almacen.registrarDisponibilidad(pedido.id, { tipo: "horario_indicado", bloqueHorarioId: bloques[i] }, `wamid.${pedido.id}`, CONDUCTOR);
    }
    if (confirmados.includes(i)) {
      await almacen.registrarDisponibilidad(pedido.id, { tipo: "confirmado" }, `wamid.${pedido.id}`, CONDUCTOR);
    }
    pedidos.push(pedido);
  }
  return pedidos;
}

async function sinPunto(fecha, nombre, direccion) {
  return guardar({ nombre, telefono: null, direccion, lat: null, lng: null, notas: null }, fecha);
}

/** Una fila de Nominatim con número de casa (la puerta). */
const casaOsm = (calle, numero, punto, id) => ({
  osm_type: "node",
  osm_id: id,
  lat: String(punto.lat),
  lon: String(punto.lng),
  category: "place",
  address: { road: calle, house_number: numero, city: "Arica" },
});

// =============================================================== DORADAS (código de antes)

test("dorada: sin bloques, la propuesta es la de antes; otro cuarto de hora da la misma", async (t) => {
  t.after(reloj.descongelar);
  const pedidos = await dia("2026-12-01", 1, 24, { confirmados: [3, 9] });
  aLaHora(9, 30);
  const p1 = await calcularRutaLocal("2026-12-01", CENTRAL);
  dorado("sin-bloques-0930", resumen(p1, pedidos));
  aLaHora(9, 50);
  const p2 = await calcularRutaLocal("2026-12-01", CENTRAL);
  dorado("sin-bloques-0950", resumen(p2, pedidos));
  assert.deepEqual(resumen(p2, pedidos), resumen(p1, pedidos), "sin bloques, la hora no cambia nada");
});

test("dorada: con un bloque vigente, la propuesta es la de antes y el cuarto de hora la recalcula", async (t) => {
  t.after(reloj.descongelar);
  const pedidos = await dia("2026-12-02", 1, 24, { bloques: { 5: "12-14", 12: "12-14" }, confirmados: [3] });
  aLaHora(9, 30);
  const p1 = await calcularRutaLocal("2026-12-02", CENTRAL);
  dorado("bloque-vigente-0930", resumen(p1, pedidos));
  aLaHora(9, 50);
  const p2 = await calcularRutaLocal("2026-12-02", CENTRAL);
  dorado("bloque-vigente-0950", resumen(p2, pedidos));
  assert.notEqual(p2.paradas, p1.paradas, "con bloques, otro cuarto de hora se vuelve a calcular");
});

test("dorada: con un bloque que ya cerró, la propuesta es la de antes", async (t) => {
  t.after(reloj.descongelar);
  const pedidos = await dia("2026-12-03", 1, 24, { bloques: { 5: "08-10", 12: "10-12" }, confirmados: [3] });
  aLaHora(15, 0);
  const p = await calcularRutaLocal("2026-12-03", CENTRAL);
  dorado("bloque-cerrado-1500", resumen(p, pedidos));
  assert.ok(p.alternativas[0].bloquesIncumplidos > 0, "el bloque cerrado se avisa igual");
});

test("dorada: con la red apagada (respaldo de ORS, en línea recta), bloque cerrado y bloque vigente", async (t) => {
  t.after(reloj.descongelar);
  apagarRed(true);
  t.after(() => apagarRed(false));
  const cerrado = await dia("2026-12-04", 30, 41, { bloques: { 33: "08-10" }, confirmados: [35] });
  aLaHora(15, 0);
  dorado("ors-bloque-cerrado-1500", resumen(await calcularRutaLocal("2026-12-04", CENTRAL), cerrado));
  const vigente = await dia("2026-12-05", 30, 41, { bloques: { 33: "16-18", 38: "12-14" } });
  aLaHora(11, 0);
  dorado("ors-bloque-vigente-1100", resumen(await calcularRutaLocal("2026-12-05", CENTRAL), vigente));
});

// Las paradas pegadas a una troncal (las de CON_TRONCAL) se corren a su calle.
CON_TRONCAL.push(...[44, 47, 50, 53, 56, 59].map((i) => DIA.puntos[i]));

test("dorada: corregirAccesos corre los mismos puntos, con los mismos avisos", async () => {
  modo = "con_red";
  const fecha = "2026-12-06";
  await dia(fecha, 42, 52);
  const pedidos = await almacen.leerPedidos(fecha);
  const r = await ubicarPedidos.corregirAccesos(pedidos);
  dorado("accesos-directo", {
    ubicados: r.ubicados.map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng })),
    advertencias: r.advertencias,
    guardados: await guardados(fecha),
  });
  assert.ok(r.advertencias.length >= 3, r.advertencias.join(" | "));
});

test("dorada: el armado con accesos y un pedido recién ubicado da la propuesta de antes", async () => {
  modo = "con_red";
  const fecha = "2026-12-07";
  await dia(fecha, 53, 58);
  // Un Plus Code junto a la troncal del punto 59: se ubica al armar y después se le revisa el acceso.
  await sinPunto(fecha, "Prueba 59", plusCodeDe(DIA.puntos[59]));
  await sinPunto(fecha, "Prueba 60", "Avenida Santa María 9991, Arica");
  const p = await calcularRutaLocal(fecha, CENTRAL);
  const pedidos = await almacen.leerPedidos(fecha);
  dorado("armado-con-accesos", { propuesta: resumen(p, pedidos), guardados: await guardados(fecha) });
  assert.ok(p.paradas.some((x) => x.nombre === "Prueba 59"), "el recién ubicado entra");
});

test("dorada: reintentarUbicar ubica, deja en duda y avisa igual que antes", async () => {
  modo = "con_red";
  const fecha = "2026-12-08";
  await dia(fecha, 61, 62);
  const lejos = { lat: DIA.puntos[70].lat, lng: DIA.puntos[70].lng };
  osm = (q) => {
    if (q.includes("2150")) return [casaOsm("Avenida Santa María", "2150", DIA.puntos[63], 1)];
    if (q.includes("3110")) return [casaOsm("Avenida Santa María", "3110", DIA.puntos[64], 2), casaOsm("Avenida Santa María", "3110", lejos, 3)];
    return [];
  };
  await sinPunto(fecha, "Prueba R1", plusCodeDe(DIA.puntos[65]));
  await sinPunto(fecha, "Prueba R2", "Avenida Santa María 2150, Arica");
  await sinPunto(fecha, "Prueba R3", "Avenida Santa María 3110, Arica");
  await sinPunto(fecha, "Prueba R4", "Avenida Santa María 9993, Arica");
  await sinPunto(fecha, "Prueba R5", plusCodeDe(DIA.puntos[66]));
  await sinPunto(fecha, "Prueba R6", plusCodeDe(DIA.puntos[67]));
  const pendientes = await almacen.leerPedidos(fecha);
  const r = await ubicarPedidos.reintentarUbicar(pendientes);
  dorado("reintentar", {
    pendientes: r.pendientes.map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng })),
    advertencias: r.advertencias,
    guardados: await guardados(fecha),
  });
  assert.ok(r.advertencias.some((a) => /sin intentar ubicar/.test(a)), "más de 5: quedan para la próxima");
});

// =============================================================== LO NUEVO DE LA 038

nuevo("huella sin el cuarto de hora: sin bloques, otro cuarto de hora sale del caché", async (t) => {
  t.after(reloj.descongelar);
  await dia("2026-12-15", 1, 12);
  aLaHora(9, 30);
  const p1 = await calcularRutaLocal("2026-12-15", CENTRAL);
  aLaHora(9, 50);
  const p2 = await calcularRutaLocal("2026-12-15", CENTRAL);
  assert.equal(p2.paradas, p1.paradas, "no salió del caché");
  // Un bloque, aunque ya haya cerrado, sigue pidiendo el cuarto de hora: cambia el aviso.
  await dia("2026-12-16", 1, 12, { bloques: { 4: "08-10" } });
  aLaHora(10, 30);
  const p3 = await calcularRutaLocal("2026-12-16", CENTRAL);
  aLaHora(10, 50);
  assert.notEqual((await calcularRutaLocal("2026-12-16", CENTRAL)).paradas, p3.paradas);
});

nuevo("la partida como promesa: la misma propuesta, y el GPS se espera después de leer, ubicar y revisar accesos", async () => {
  modo = "con_red";
  // Teselas que nadie bajó todavía, para ver cuándo se piden.
  const fila = LEJOS.y + 6;
  const puntos = Array.from({ length: 5 }, (_, k) => centroDe(LEJOS.x + k, fila));
  const casa = centroDe(LEJOS.x + 5, fila);
  CON_TRONCAL.push(puntos[1], puntos[3], casa);
  // Un número que ninguna otra prueba preguntó: Nominatim recuerda lo del día.
  osm = (q) => (q.includes("2152") ? [casaOsm("Avenida Santa María", "2152", casa, 9)] : []);
  const cargar = async (fecha) => {
    for (const [k, p] of puntos.entries()) {
      await guardar({ nombre: `Prueba P${k}`, telefono: null, direccion: `Calle inventada ${k + 1}00, Arica`, ...p, notas: null }, fecha);
    }
    await sinPunto(fecha, "Prueba P5", "Avenida Santa María 2152, Arica");
  };
  await cargar("2026-12-09");
  await cargar("2026-12-19");

  // Spec 038: el GPS no llega hasta que ya se reintentó ubicar y se pidieron las teselas.
  let soltar;
  const gps = new Promise((listo) => (soltar = listo));
  const p = calcularRutaLocal("2026-12-09", gps.then(() => CENTRAL));
  const listo = () => consultas.some((u) => u.endsWith(".pbf")) && consultas.some((u) => u.includes("nominatim"));
  for (const desde = Date.now(); Date.now() - desde < 5000 && !listo(); ) await new Promise((r) => setTimeout(r, 5));
  assert.ok(listo(), "esperó el GPS antes de ubicar y revisar los accesos");
  soltar();
  const conPromesa = await p;
  const conPartida = await calcularRutaLocal("2026-12-19", CENTRAL);
  const sinFecha = async (propuesta, fecha) => ({ ...resumen(propuesta, await almacen.leerPedidos(fecha)), fecha: null });
  assert.deepEqual(await sinFecha(conPromesa, "2026-12-09"), await sinFecha(conPartida, "2026-12-19"));
  assert.ok(conPromesa.advertencias.some((a) => /Prueba P1.*Zapiga/.test(a)), conPromesa.advertencias.join(" | "));
  assert.ok(conPromesa.advertencias.some((a) => /Prueba P5.*Zapiga/.test(a)), "el recién ubicado también se revisa");
});

nuevo("los errores del GPS se ven igual que antes, aunque el armado falle primero", async () => {
  const errorGps = () => Promise.reject(new Error("No se pudo obtener la ubicación. Revisa el permiso de ubicación del navegador."));
  // Sin pedidos: antes el GPS fallaba primero y se veía su error, no «No hay pedidos».
  await assert.rejects(() => calcularRutaLocal("2026-12-10", errorGps()), /No se pudo obtener la ubicación/);
  // Con el GPS bien y sin pedidos, el error de siempre.
  await assert.rejects(() => calcularRutaLocal("2026-12-10", Promise.resolve(CENTRAL)), /No hay pedidos pendientes/);
  // Con pedidos y el GPS fallando, el del GPS.
  await dia("2026-12-10", 1, 4);
  await assert.rejects(() => calcularRutaLocal("2026-12-10", errorGps()), /No se pudo obtener la ubicación/);
  // Cancelado antes de que el GPS falle: AbortError y ningún rechazo sin atender.
  const sueltos = [];
  const anotar = (e) => sueltos.push(e);
  process.on("unhandledRejection", anotar);
  try {
    const control = new AbortController();
    control.abort();
    let fallar;
    const gps = new Promise((_, falla) => (fallar = falla));
    await assert.rejects(() => calcularRutaLocal("2026-12-10", gps, undefined, control.signal), { name: "AbortError" });
    fallar(new Error("No se pudo obtener la ubicación."));
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off("unhandledRejection", anotar);
  }
  assert.deepEqual(sueltos, []);
});

nuevo("reintentarUbicar sin conexión para tras 2 sin respuesta seguidas (como ubicarCarga)", async () => {
  const fecha = "2026-12-11";
  for (let k = 1; k <= 5; k++) await sinPunto(fecha, `Prueba S${k}`, `Avenida Santa María ${9000 + k}, Arica`);
  const pendientes = await almacen.leerPedidos(fecha);
  const r = await ubicarPedidos.reintentarUbicar(pendientes);
  const preguntadas = new Set(consultas.filter((u) => u.includes("nominatim")).map((u) => new URL(u).searchParams.get("q")));
  assert.equal(preguntadas.size, 2, `se preguntaron ${preguntadas.size} direcciones`);
  assert.ok(r.advertencias.some((a) => /Quedaron 3 pedido\(s\) sin intentar ubicar/.test(a)), r.advertencias.join(" | "));
  assert.deepEqual(r.pendientes.map((p) => p.lat), [null, null, null, null, null]);
});

nuevo("reintentarUbicar con la señal: cancelada no pregunta, y a mitad corta al tiro", async () => {
  const fecha = "2026-12-12";
  for (let k = 1; k <= 3; k++) await sinPunto(fecha, `Prueba C${k}`, `Avenida Santa María ${8000 + k}, Arica`);
  await dia(fecha, 1, 2);
  const yaCancelada = new AbortController();
  yaCancelada.abort();
  await ubicarPedidos.reintentarUbicar(await almacen.leerPedidos(fecha), yaCancelada.signal);
  assert.equal(consultas.filter((u) => u.includes("nominatim")).length, 0);

  // Un Nominatim colgado: «Cancelar» no espera los 10 s del tope.
  modo = "con_red";
  osm = () => new Promise(() => {});
  const control = new AbortController();
  const desde = Date.now();
  setTimeout(() => control.abort(), 50);
  await assert.rejects(() => calcularRutaLocal(fecha, CENTRAL, undefined, control.signal), { name: "AbortError" });
  assert.ok(Date.now() - desde < 3000, `tardó ${Date.now() - desde} ms en cortar`);
});
