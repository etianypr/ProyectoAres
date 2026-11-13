// Spec 033, G2 (ruta y carga): cancelar la búsqueda de la ruta sin cambiar lo que
// sale cuando no se cancela, quitar la foto del paquete, «−1 bulto» y «Volver a
// cargar». IndexedDB real (fake-indexeddb); sin red: el `fetch` global falla, así
// que no se gasta ninguna consulta. Calles reales, números y nombres inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { calcularRutaLocal } = await import("@/lib/encomiendas/local/generar-ruta");
const { optimizarSinCongelar } = await import("@/lib/rutas/orden-paradas/sin-congelar");
const { optimizarConHorarios } = await import("@/lib/rutas/orden-paradas/con-horarios");
const { olvidarMatriz } = await import("@/lib/geo/matriz");
const { leerCodigoEtiqueta } = await import("@/lib/encomiendas/lectura/codigo-barras");

const HOY = "2026-11-13";

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

// Sin red: cualquier consulta falla como sin señal. `alConsultar` deja ver cuándo pasa.
let alConsultar = () => {};
const fetchOriginal = globalThis.fetch;
test.before(() => {
  // Con clave, para que pida la matriz y el trazado (y fallen sin red).
  process.env.NEXT_PUBLIC_ORS_KEY = "ors.prueba";
  globalThis.fetch = async () => {
    alConsultar();
    throw new TypeError("sin red (prueba)");
  };
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});

const BASE = { lat: -18.4783, lng: -70.2979 };

/** Un día de `n` paradas inventadas alrededor de la central, todas con punto. */
async function diaConPuntos(n) {
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    await almacen.guardarPedido(
      {
        nombre: `Prueba ${i + 1}`,
        telefono: "",
        direccion: `Avenida Santa María ${1000 + i * 10}, Arica`,
        lat: BASE.lat - 0.002 - rnd() * 0.03,
        lng: BASE.lng + 0.002 + rnd() * 0.03,
        notas: null,
      },
      HOY,
    );
  }
}

// ------------------------------------------------- cancelar la búsqueda
test("optimizarSinCongelar: con una señal sin cancelar da el mismo orden; cancelada, AbortError", async () => {
  const n = 30;
  let s = 3;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const metros = new Float64Array(n * n);
  const pts = Array.from({ length: n }, () => [rnd() * 5000, rnd() * 5000]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) metros[i * n + j] = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  const ventanas = pts.map((_, i) => (i > 0 && i <= 8 ? { abre: 600 + (i % 3) * 120, cierra: 720 + (i % 3) * 120 } : null));
  const dia = { metros, n, ventanas, inicio: 540, kmh: 25, servicio: 4 };
  const arranque = Array.from({ length: n }, (_, i) => i);

  const control = new AbortController();
  const conSenal = await optimizarSinCongelar([arranque], dia, control.signal);
  assert.deepEqual(conSenal, optimizarConHorarios([arranque], dia), "la señal cambió el orden");

  const cancelada = new AbortController();
  cancelada.abort();
  await assert.rejects(() => optimizarSinCongelar([arranque], dia, cancelada.signal), { name: "AbortError" });
});

test("calcularRutaLocal: sin cancelar, la señal no cambia la propuesta", async () => {
  await diaConPuntos(14);
  olvidarMatriz();
  const sin = await calcularRutaLocal(HOY, { tipo: "gps", ...BASE });
  olvidarMatriz();
  const con = await calcularRutaLocal(HOY, { tipo: "gps", ...BASE }, undefined, new AbortController().signal);
  assert.ok(sin.paradas.length === 14);
  assert.deepEqual(
    con.paradas.map((p) => p.id),
    sin.paradas.map((p) => p.id),
  );
  assert.deepEqual(con.alternativas.map((a) => a.metrosEstimados), sin.alternativas.map((a) => a.metrosEstimados));
});

test("calcularRutaLocal: «Cancelar» a mitad corta con AbortError y no deja propuesta", async () => {
  await diaConPuntos(10);
  olvidarMatriz();
  const control = new AbortController();
  // Se cancela en la primera consulta (las teselas de las calles cercanas).
  alConsultar = () => control.abort();
  try {
    await assert.rejects(() => calcularRutaLocal(HOY, { tipo: "gps", ...BASE }, undefined, control.signal), {
      name: "AbortError",
    });
  } finally {
    alConsultar = () => {};
  }
  const yaCancelada = new AbortController();
  yaCancelada.abort();
  await assert.rejects(() => calcularRutaLocal(HOY, { tipo: "gps", ...BASE }, undefined, yaCancelada.signal), {
    name: "AbortError",
  });
  // Lo guardado no cambia: cancelar no arma ni guarda ninguna ruta.
  assert.equal(await almacen.leerRuta(HOY), null);
});

// ------------------------------------------------- quitar la foto
const foto = () => new Blob([new Uint8Array(4)], { type: "image/jpeg" });

test("«Quitar» la foto y guardar la descripción la borra del pedido y del teléfono", async () => {
  const p = await almacen.guardarPedido(
    { nombre: "Prueba", telefono: "", direccion: "Calle Sotomayor 100, Arica", lat: null, lng: null, notas: null },
    HOY,
  );
  const fotoId = await almacen.guardarFoto(p.id, foto());
  const ref = { tipo: "caja", tamano: "chico", color: "cafe", nota: null };
  await almacen.guardarDescripcionPaquete(p.id, { referencia: ref, fotoNueva: null, quitarFoto: true });
  const [despues] = await almacen.leerPedidos(HOY);
  assert.equal(despues.fotoId, null);
  assert.equal(await almacen.leerFoto(fotoId), null, "la foto sigue en el store");
  assert.deepEqual(despues.referencia, ref);
});

test("guardar la descripción sin tocar la foto la deja; con una nueva, la reemplaza", async () => {
  const p = await almacen.guardarPedido(
    { nombre: "Prueba", telefono: "", direccion: "Calle Sotomayor 100, Arica", lat: null, lng: null, notas: null },
    HOY,
  );
  const fotoId = await almacen.guardarFoto(p.id, foto());
  await almacen.guardarDescripcionPaquete(p.id, { referencia: null, fotoNueva: null, quitarFoto: false });
  assert.equal((await almacen.leerPedidos(HOY))[0].fotoId, fotoId);
  await almacen.guardarDescripcionPaquete(p.id, { referencia: null, fotoNueva: foto(), quitarFoto: true });
  const [despues] = await almacen.leerPedidos(HOY);
  assert.notEqual(despues.fotoId, null);
  assert.notEqual(despues.fotoId, fotoId);
  assert.equal(await almacen.leerFoto(fotoId), null);
});

// ------------------------------------------------- −1 bulto
async function guiaDeDos() {
  const { creados } = await almacen.crearDesdeGuia(
    [
      { of: "200000002", destino: "PASAJE INVENTADO 12" },
      { of: "200000003", destino: "PASAJE INVENTADO 14" },
    ],
    HOY,
    { folio: null, origen: "guia_pegada" },
  );
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: creados.map((p) => p.id), trazado: null, distanciaM: null, duracionS: null });
  return creados;
}

test("−1 bulto: la OF escrita de más vuelve a como estaba", async () => {
  await guiaDeDos();
  const aMano = { ...leerCodigoEtiqueta("200000002"), escaneo: true };
  const primera = await almacen.aplicarLecturaEtiqueta(HOY, aMano);
  const segunda = await almacen.aplicarLecturaEtiqueta(HOY, aMano);
  assert.deepEqual([segunda.pedido.bultosEscaneados, segunda.pedido.bultos], [[1, 2], 2]);
  assert.equal(almacen.sePuedeQuitarBulto(segunda), true);

  const deshecha = await almacen.quitarBulto(HOY, segunda);
  assert.deepEqual([deshecha.pedido.bultosEscaneados, deshecha.pedido.bultos], [[1], primera.pedido.bultos]);
  assert.equal(almacen.sePuedeQuitarBulto(deshecha), false, "solo el último");
  assert.deepEqual(deshecha.parada, { n: 1, total: 2 });
  const [guardado] = (await almacen.leerPedidos(HOY)).filter((p) => p.of === "200000002");
  assert.deepEqual([guardado.bultosEscaneados, guardado.bultos], [[1], null]);
  assert.equal(await almacen.quitarBulto(HOY, segunda), null, "dos veces no quita otro");
});

test("−1 bulto: un escaneo que subió el total se puede quitar; uno normal no", async () => {
  await guiaDeDos();
  const codigo = (n) => ({ ...leerCodigoEtiqueta(`9200002256000020000000300${n}`), escaneo: true });
  const normal = await almacen.aplicarLecturaEtiqueta(HOY, { ...codigo(1), bultosTotal: 2 });
  assert.equal(almacen.sePuedeQuitarBulto(normal), false, "el bulto 1 de 2 no es de más");
  const segundo = await almacen.aplicarLecturaEtiqueta(HOY, codigo(2));
  assert.equal(almacen.sePuedeQuitarBulto(segundo), false, "el bulto 2 de 2 tampoco");
  const deMas = await almacen.aplicarLecturaEtiqueta(HOY, codigo(3));
  assert.deepEqual([deMas.pedido.bultosEscaneados, deMas.pedido.bultos], [[1, 2, 3], 3]);
  assert.equal(almacen.sePuedeQuitarBulto(deMas), true);
  const deshecha = await almacen.quitarBulto(HOY, deMas);
  assert.deepEqual([deshecha.pedido.bultosEscaneados, deshecha.pedido.bultos], [[1, 2], 2]);
});

// ------------------------------------------------- volver a cargar
test("«Volver a cargar» borra la salida mientras no haya ninguna parada cerrada", async () => {
  const [a] = await guiaDeDos();
  await almacen.marcarInicioReparto(HOY);
  assert.ok((await almacen.leerRuta(HOY)).inicioReparto);
  assert.equal(await almacen.volverACargar(HOY), true);
  const ruta = await almacen.leerRuta(HOY);
  assert.equal(ruta.inicioReparto, null);
  assert.equal(ruta.orden.length, 2, "la ruta queda igual");
  assert.equal(await almacen.volverACargar(HOY), false, "sin salida no hay nada que volver");

  await almacen.marcarInicioReparto(HOY);
  const [pedido] = (await almacen.leerPedidos(HOY)).filter((p) => p.id === a.id);
  await idb.escribir([idb.STORES.pedidos], ({ guardar }) => guardar(idb.STORES.pedidos, { ...pedido, resultado: "entregado" }));
  assert.equal(await almacen.volverACargar(HOY), false, "con una parada cerrada ya se está repartiendo");
  assert.ok((await almacen.leerRuta(HOY)).inicioReparto);
  assert.equal((await almacen.leerCola()).length, 0, "no toca la cola");
});

// ------------------------------------------------- cancelar con la red propia (spec 031)
test("Con la red propia: sin cancelar, la misma propuesta y sin ORS; la búsqueda con rumbo se corta al cancelar", async () => {
  const { readFileSync } = await import("node:fs");
  const { correrSinCongelar } = await import("@/lib/rutas/orden-paradas/sin-congelar");
  const { prepararRedDelDia } = await import("@/lib/encomiendas/local/generar-ruta/red-del-dia");
  const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
  // Puntos del fixture (al azar sobre calles de Arica): no son de nadie.
  for (let i = 1; i <= 20; i++) {
    const p = DIA.puntos[i];
    await almacen.guardarPedido({ nombre: `Prueba ${i}`, telefono: "", direccion: `Calle inventada ${i}00, Arica`, lat: p.lat, lng: p.lng, notas: null }, HOY);
  }
  const consultas = [];
  alConsultar = () => consultas.push(1);
  const central = { tipo: "gps", lat: DIA.puntos[0].lat, lng: DIA.puntos[0].lng };
  try {
    olvidarMatriz();
    const sin = await calcularRutaLocal(HOY, central);
    olvidarMatriz();
    const con = await calcularRutaLocal(HOY, central, undefined, new AbortController().signal);
    assert.equal(sin.sinTrazado, false, "lo dibujó la red propia");
    assert.deepEqual(con.paradas.map((p) => p.id), sin.paradas.map((p) => p.id));
    assert.deepEqual(con.alternativas.map((a) => a.metrosEstimados), sin.alternativas.map((a) => a.metrosEstimados));
    assert.ok(sin.alternativas[0].metrosEstimados != null, "con rumbo");
  } finally {
    alConsultar = () => {};
  }

  // Ya cancelada, la red del día no se arma (y el armado no cae a ORS).
  const yaCancelada = new AbortController();
  yaCancelada.abort();
  await assert.rejects(() => prepararRedDelDia(DIA.puntos.slice(0, 6), false, yaCancelada.signal), { name: "AbortError" });
  // A mitad de una búsqueda larga: se corta en el próximo turno cedido.
  const control = new AbortController();
  function* sinFin() {
    for (;;) yield;
  }
  setTimeout(() => control.abort(), 10);
  await assert.rejects(() => correrSinCongelar(sinFin(), control.signal), { name: "AbortError" });
});
