// Spec 038, ubicar más rápido sin cambiar lo que se ubica: la caché y la fila de Nominatim, la
// dedupe de Google, el corte sin conexión, el adelanto de OSM, la ventana de 3 de ubicarCarga y
// el olvido del día. Lo dorado del catálogo de calles está en 038-calles-dorado.test.mjs, y lo
// de punta a punta (mismo hash antes y después) en scripts/medir-direcciones.mjs.
//
// La fila de Nominatim es la real (1,2 s entre consultas): por eso esta prueba tarda.
// Calles reales del catálogo con números inventados; el `fetch` global se reemplaza (sin red).
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Los buscadores con el `fetch` global reemplazado
// ---------------------------------------------------------------------------
const { preguntarAGoogle, olvidarConsultasGoogle } = await import("@/lib/geo/geocoding/google");
const { preguntarANominatim, sugerirEnOsm, olvidarConsultasNominatim } = await import("@/lib/geo/geocoding/nominatim");
const { ubicarDireccion, consultaOsmDe, adelantarNominatim } = await import("@/lib/geo/geocoding");

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
/** Espera `ms`, o falla apenas se aborte la señal (como un fetch de verdad). */
const demorar = (ms, senal) =>
  new Promise((listo, falla) => {
    const reloj = setTimeout(listo, ms);
    senal?.addEventListener("abort", () => (clearTimeout(reloj), falla(new DOMException("Abortado", "AbortError"))), { once: true });
  });
const tramo = (nombre, id) => ({ osm_type: "way", osm_id: id, lat: "-18.47", lon: "-70.29", category: "highway", name: nombre, address: { road: nombre, city: "Arica" } });

/** Cada consulta que salió: proveedor, texto, cuándo empezó y su señal. */
let vistas = [];
/** Qué contesta (recibe la consulta vista); null = lo de siempre (nada de nada). */
let contestar = () => null;
const fetchOriginal = globalThis.fetch;
test.before(() => {
  globalThis.window = {}; // Google se pregunta desde el teléfono
  globalThis.fetch = async (entrada, opciones = {}) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    if (url.includes("googleapis")) return json({ status: "ZERO_RESULTS", results: [] });
    const proveedor = url === "/api/geocodificar" ? "google" : "osm";
    const q = proveedor === "google" ? JSON.parse(opciones.body).direccion : new URL(url).searchParams.get("q").replace(/, Arica, Chile$/, "");
    const vista = { proveedor, q, url, inicio: Date.now(), senal: opciones.signal };
    vistas.push(vista);
    return (await contestar(vista)) ?? (proveedor === "google" ? json({ sugerencias: [] }) : json([]));
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
  delete globalThis.window;
});
test.beforeEach(() => {
  vistas = [];
  contestar = () => null;
  olvidarConsultasGoogle();
  olvidarConsultasNominatim();
});
const deOsm = () => vistas.filter((v) => v.proveedor === "osm");
const deGoogle = () => vistas.filter((v) => v.proveedor === "google");

test("Nominatim: lo ya contestado no vuelve a la red ni espera la fila", async () => {
  contestar = (v) => (v.proveedor === "osm" ? json([tramo("Carlos Witting", 1)]) : null);
  const primera = await preguntarANominatim("Carlos Witting 501");
  const desde = Date.now();
  const segunda = await preguntarANominatim("Carlos Witting 501");
  assert.ok(Date.now() - desde < 300, "esperó el turno con la respuesta en la caché");
  assert.equal(deOsm().length, 1);
  assert.deepEqual(segunda, primera);
});

test("Nominatim: un error o una respuesta que no es lista no se recuerda (nunca null)", async () => {
  const respuestas = [new Response("boom", { status: 503 }), json({ error: "x" }), json([])];
  contestar = (v) => (v.proveedor === "osm" ? respuestas.shift() : null);
  assert.equal(await preguntarANominatim("Carlos Witting 502"), null);
  assert.equal(await preguntarANominatim("Carlos Witting 502"), null);
  assert.deepEqual(await preguntarANominatim("Carlos Witting 502"), []);
  assert.deepEqual(await preguntarANominatim("Carlos Witting 502"), [], "una lista vacía sí es respuesta");
  assert.equal(deOsm().length, 3);
});

test("Nominatim: la clave es la consulta entera y la misma consulta a la vez sale una vez", async () => {
  await Promise.all([preguntarANominatim("Carlos Witting 503"), preguntarANominatim("Carlos Witting 503")]);
  assert.equal(deOsm().length, 1, "dos a la vez salieron dos veces");
  // El campo pide con el recuadro y otro límite: es otra consulta y otra respuesta.
  await sugerirEnOsm("Carlos Witting 503");
  assert.equal(deOsm().length, 2);
  assert.notEqual(deOsm()[0].url, deOsm()[1].url);
});

test("fila de Nominatim: una sola abierta, y la siguiente después de que llega y de 1,2 s", async () => {
  let abiertas = 0;
  let maximo = 0;
  contestar = async (v) => {
    if (v.proveedor !== "osm") return null;
    maximo = Math.max(maximo, ++abiertas);
    await demorar(v.q.endsWith("504") ? 1600 : 10);
    abiertas--;
    return json([]);
  };
  await Promise.all(["504", "505", "506"].map((n) => preguntarANominatim(`Carlos Witting ${n}`)));
  const [a, b, c] = deOsm();
  assert.equal(maximo, 1, "dos consultas abiertas a la vez");
  assert.ok(b.inicio - a.inicio >= 1590, `no esperó que llegara la lenta (${b.inicio - a.inicio} ms)`);
  assert.ok(c.inicio - b.inicio >= 1190, `no respetó los 1,2 s (${c.inicio - b.inicio} ms)`);
});

test("fila de Nominatim: la que se aborta antes de su turno no lo gasta", async () => {
  await preguntarANominatim("Carlos Witting 507");
  const control = new AbortController();
  const abortada = preguntarANominatim("Carlos Witting 508", control.signal);
  const siguiente = preguntarANominatim("Carlos Witting 509");
  control.abort();
  assert.equal(await abortada, null);
  await siguiente;
  assert.deepEqual(deOsm().map((v) => v.q), ["Carlos Witting 507", "Carlos Witting 509"]);
  const espera = deOsm()[1].inicio - deOsm()[0].inicio;
  assert.ok(espera < 2000, `la abortada gastó un turno (${espera} ms)`);
});

test("fila de Nominatim: el campo y la carga antes que el adelanto, y lo adelantado que la carga pide pasa adelante", async () => {
  const abierta = preguntarANominatim("Carlos Witting 510");
  const bajas = ["511", "512"].map((n) => preguntarANominatim(`Carlos Witting ${n}`, undefined, "baja"));
  const alta = preguntarANominatim("Carlos Witting 513");
  const ascendida = preguntarANominatim("Carlos Witting 512");
  await Promise.all([abierta, ...bajas, alta, ascendida]);
  // 512 era del adelanto, pero la carga la pidió (y antes que 513): pasa adelante; 511 queda al final.
  assert.deepEqual(deOsm().map((v) => v.q.slice(-3)), ["510", "512", "513", "511"]);
});

test("Nominatim: si todos los que esperan se van se corta; si queda uno, sigue", async () => {
  contestar = async (v) =>
    v.proveedor === "osm" ? (await demorar(v.q.endsWith("515") ? 3000 : 200, v.senal), json([tramo("Carlos Witting", 2)])) : null;
  const seVa = new AbortController();
  const a = preguntarANominatim("Carlos Witting 514", seVa.signal);
  const b = preguntarANominatim("Carlos Witting 514");
  setTimeout(() => seVa.abort(), 50);
  assert.equal(await a, null);
  assert.equal((await b)?.length, 1, "el que se quedó no recibió la respuesta");
  assert.equal(deOsm().length, 1);

  // Su turno llega ~1 s después (1,2 s desde la anterior) y se va a mitad de la consulta.
  const sola = new AbortController();
  const c = preguntarANominatim("Carlos Witting 515", sola.signal);
  setTimeout(() => sola.abort(), 1800);
  assert.equal(await c, null);
  assert.equal(deOsm().length, 2);
  assert.equal(deOsm()[1].senal.aborted, true, "la consulta que nadie esperaba siguió abierta");
});

test("Google: la misma consulta a la vez sale una vez; si el primero se va, los demás la reciben y queda guardada", async () => {
  const puerta = { id: "google:x", direccion: "San Marcos 901", detalle: "Arica", lat: -18.47, lng: -70.3, soloCalle: false, confianza: "exacta", coincideNumero: true, fuente: "google" };
  contestar = async (v) => (v.proveedor === "google" ? (await demorar(100, v.senal), json({ sugerencias: [puerta] })) : null);
  const primero = new AbortController();
  const a = preguntarAGoogle("San Marcos 901", primero.signal);
  const b = preguntarAGoogle("SAN MARCOS 901");
  setTimeout(() => primero.abort(), 10);
  assert.equal(await a, null);
  assert.deepEqual(await b, [puerta]);
  assert.equal(deGoogle().length, 1);
  assert.equal(deGoogle()[0].senal.aborted, false, "la consulta llevaba la señal del primero");

  // Se guarda aunque el único que preguntó se haya ido.
  const solo = new AbortController();
  const c = preguntarAGoogle("San Marcos 902", solo.signal);
  solo.abort();
  assert.equal(await c, null);
  await demorar(150);
  await preguntarAGoogle("San Marcos 902");
  assert.equal(deGoogle().length, 2, "volvió a pagar lo que ya había contestado");
});

test("Google: recuerda 1000 consultas del día (antes 100)", async () => {
  for (let n = 1; n <= 150; n++) await preguntarAGoogle(`San Marcos ${n}`);
  await preguntarAGoogle("San Marcos 1");
  assert.equal(deGoogle().length, 150);
});

test("sin conexión: con Google y OSM sin respuesta no se le vuelve a preguntar a Google por el nombre oficial", async () => {
  contestar = () => {
    throw new TypeError("Failed to fetch");
  };
  const r = await ubicarDireccion("BRAULIO MUNOZ 1203");
  assert.equal(r.sinRespuesta, true);
  assert.deepEqual(deGoogle().map((v) => v.q), ["BRAULIO MUNOZ 1203"], "preguntó por el nombre oficial sin conexión");

  // OSM contestó «nada»: eso es una respuesta, y el nombre oficial se sigue probando.
  vistas = [];
  contestar = (v) => {
    if (v.proveedor === "google") throw new TypeError("Failed to fetch");
    return null;
  };
  await ubicarDireccion("BRAULIO MUNOZ 1204");
  assert.deepEqual(deGoogle().map((v) => v.q), ["BRAULIO MUNOZ 1204", "Braulio Muñoz 1204"]);
});

test("adelanto: consultaOsmDe es lo que ubicarDireccion le pregunta a OSM, y lo adelantado no se vuelve a esperar", async () => {
  const direcciones = ["TUCAPEL 2604 DEPTO 12", "LEBU 1880 CON YUNGAY", "LINDEROS PROVIDENCI CALLE 2 977", "AV. DIEGO PORTALES 2950, ARICA", "Terminal Rodoviario"];
  for (const d of direcciones) {
    vistas = [];
    await ubicarDireccion(d);
    assert.equal(deOsm()[0]?.q, await consultaOsmDe(d), d);
  }
  assert.equal(await consultaOsmDe("GMCP+MX"), null, "un Plus Code no le pregunta a nadie");
  assert.equal(await consultaOsmDe("   "), null);

  olvidarConsultasNominatim();
  await Promise.all(direcciones.slice(0, 2).map((d) => adelantarNominatim(d)));
  vistas = [];
  const desde = Date.now();
  await ubicarDireccion(direcciones[0]);
  assert.equal(deOsm().length, 0, "la carga volvió a preguntar lo adelantado");
  assert.ok(Date.now() - desde < 1000, "esperó la fila con OSM ya adelantado");
});

// ---------------------------------------------------------------------------
// La ventana de 3 de ubicarCarga
// ---------------------------------------------------------------------------
const almacen = await import("@/lib/encomiendas/local/almacen");
const { ubicarCarga, VENTANA } = await import("@/lib/encomiendas/local/ubicar-carga");
const DIA = "2026-11-17";
let siguienteOf = 900700;

async function crear(n) {
  const lineas = Array.from({ length: n }, (_, i) => ({ of: String(siguienteOf++), destino: `San Marcos ${700 + i}` }));
  return (await almacen.crearDesdeGuia(lineas, DIA, { folio: null, origen: "guia_pegada" })).creados;
}
const puntoEn = (lat) => {
  const p = { direccion: "San Marcos", detalle: "Arica", lat, lng: -70.3, soloCalle: false, confianza: "exacta", coincideNumero: true, fuente: "google" };
  return { tipo: "exacta", candidatos: [p], elegida: p, advertencia: null };
};
const sinRespuesta = { tipo: "no_encontrada", candidatos: [], elegida: null, advertencia: "x", sinRespuesta: true };

test("ubicarCarga: de a 3 a la vez, procesadas en orden: lo mismo que de a una", async () => {
  const creados = await crear(8);
  // Las de atrás contestan antes: si se procesaran al llegar, los fallos seguidos serían otros.
  const respuestas = [puntoEn(-18.41), sinRespuesta, puntoEn(-18.42), sinRespuesta, sinRespuesta, puntoEn(-18.43), puntoEn(-18.44), puntoEn(-18.45)];
  const demoras = [60, 50, 40, 30, 20, 10, 5, 1];
  let enVuelo = 0;
  let maximo = 0;
  const preguntadas = [];
  const avances = [];
  const r = await ubicarCarga(creados, {
    alAvanzar: (hechos) => avances.push(hechos),
    ubicar: async (direccion) => {
      const k = creados.findIndex((p) => p.direccion === direccion);
      preguntadas.push(k);
      maximo = Math.max(maximo, ++enVuelo);
      await demorar(demoras[k]);
      enVuelo--;
      return respuestas[k];
    },
  });
  assert.equal(maximo, VENTANA);
  assert.deepEqual(avances, [0, 1, 2, 3, 4]);
  // Para en la 5.ª (la 4.ª y la 5.ª sin respuesta seguidas); la 6.ª y la 7.ª ya estaban en vuelo.
  assert.deepEqual(preguntadas, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(r.sinSenal, true);
  assert.equal(r.ubicados, 2);
  assert.deepEqual(r.sinUbicar, [1, 3, 4, 5, 6, 7].map((k) => creados[k].id));
  const guardados = new Map((await almacen.leerPedidos(DIA)).map((p) => [p.id, p.lat]));
  assert.deepEqual([0, 2, 5].map((k) => guardados.get(creados[k].id)), [-18.41, -18.42, null], "guardó una que llegó después de parar");
});

test("ubicarCarga: sin red al procesar, lo que la ventana ya preguntó no se guarda", async () => {
  const creados = await crear(5);
  let veces = 0;
  let consultas = 0;
  const r = await ubicarCarga(creados, {
    enLinea: () => ++veces <= 2,
    ubicar: async () => (consultas++, puntoEn(-18.46)),
  });
  assert.equal(consultas, 4, "la 3.ª y la 4.ª ya estaban preguntadas");
  assert.equal(r.sinSenal, true);
  assert.equal(r.ubicados, 2);
  assert.deepEqual(r.sinUbicar, creados.slice(2).map((p) => p.id));
  const ids = new Set(creados.map((p) => p.id));
  assert.equal((await almacen.leerPedidos(DIA)).filter((p) => ids.has(p.id) && p.lat != null).length, 2);
});

test("ubicarCarga: «Dejar de ubicar» corta las 3 que están en vuelo", async () => {
  const creados = await crear(6);
  const control = new AbortController();
  const senales = [];
  const r = await ubicarCarga(creados, {
    senal: control.signal,
    ubicar: (_d, senal) => {
      senales.push(senal);
      if (senales.length === VENTANA) setTimeout(() => control.abort(), 5);
      return new Promise(() => {}); // colgadas, como sin señal
    },
  });
  assert.equal(r.cortado, true);
  assert.equal(senales.length, VENTANA);
  assert.ok(senales.every((s) => s.aborted), "quedó una consulta abierta");
  assert.equal(r.sinUbicar.length, 6);
});

// ---------------------------------------------------------------------------
// Olvidar las memorias del día
// ---------------------------------------------------------------------------
const { salirDelModoPrueba } = await import("@/lib/encomiendas/local/modo-prueba");

/** Pregunta lo mismo a Google y a OSM; devuelve cuántas consultas salieron a la red. */
async function preguntarAmbos() {
  const antes = vistas.length;
  await Promise.all([preguntarAGoogle("Quinsachata 1749"), preguntarANominatim("Quinsachata 1749")]);
  return vistas.length - antes;
}

test("cerrar el día, cerrar sesión y salir del modo prueba olvidan lo que contestaron Google y OSM", async () => {
  assert.equal(await preguntarAmbos(), 2);
  assert.equal(await preguntarAmbos(), 0, "lo ya contestado se vuelve a pagar");

  const [p] = await crear(1);
  await almacen.guardarRuta({ fecha: DIA, pedidoIdsEnOrden: [p.id], trazado: null, distanciaM: null, duracionS: null });
  await almacen.cerrarYBorrarDia(DIA);
  assert.equal(await preguntarAmbos(), 2, "sobrevivió al cierre del día");

  await almacen.borrarDatosDestinatarios();
  assert.equal(await preguntarAmbos(), 2, "sobrevivió al cierre de sesión");

  await salirDelModoPrueba();
  assert.equal(await preguntarAmbos(), 2, "sobrevivió a salir del modo prueba");
});

test("lo que estaba en vuelo al olvidar no queda guardado", async () => {
  contestar = async () => (await demorar(300), null);
  const enCurso = [preguntarAGoogle("Quinsachata 1750"), preguntarANominatim("Quinsachata 1750")];
  await demorar(50);
  olvidarConsultasGoogle();
  olvidarConsultasNominatim();
  await Promise.all(enCurso);
  vistas = [];
  await Promise.all([preguntarAGoogle("Quinsachata 1750"), preguntarANominatim("Quinsachata 1750")]);
  assert.equal(vistas.length, 2);
});
