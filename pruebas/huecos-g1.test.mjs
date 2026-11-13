// Spec 033, G1 (guía y ⚠): cortar el ubicado, parar sin señal, la IA solo con lo
// de la carga, y deshacer la carga.
// IndexedDB real (fake-indexeddb); buscadores e IA en dobles o con el `fetch`
// global reemplazado: no se gasta ninguna consulta. Direcciones inventadas.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { ubicarCarga, hastaAbortar } = await import("@/lib/encomiendas/local/ubicar-carga");
const { cargarLineasGuia } = await import("@/lib/encomiendas/local/cargar-lineas");
const { corregirSinUbicar } = await import("@/lib/encomiendas/local/corregir-direcciones");
const { ubicarDireccion } = await import("@/lib/geo/geocoding");

const HOY = "2026-11-12";

const CLAVE = {
  [idb.STORES.pedidos]: (f) => f.id,
  [idb.STORES.rutas]: (f) => f.fecha,
  [idb.STORES.cola]: (f) => f.id,
};
test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, (CLAVE[store] ?? ((x) => x.id ?? x.fecha ?? x.pedidoId))(fila));
    });
  }
});

const PUNTO = { direccion: "Avenida Inventada 100", detalle: "Arica", lat: -18.47, lng: -70.3, soloCalle: false, confianza: "exacta", coincideNumero: true, fuente: "google" };
const ubicada = { tipo: "exacta", candidatos: [PUNTO], elegida: PUNTO, advertencia: null };
const sinRespuesta = { tipo: "no_encontrada", candidatos: [], elegida: null, advertencia: "x", sinRespuesta: true };
const noExiste = { tipo: "no_encontrada", candidatos: [], elegida: null, advertencia: "x", sinRespuesta: false };

async function crear(n) {
  const lineas = Array.from({ length: n }, (_, i) => ({ of: String(900100 + i), destino: `Pasaje Inventado ${i + 1}` }));
  return (await almacen.crearDesdeGuia(lineas, HOY, { folio: null, origen: "guia_pegada" })).creados;
}

// ------------------------------------------------------------ ubicar la carga
test("ubicarCarga: dos seguidas sin respuesta paran solas y el resto queda sin ubicar", async () => {
  const creados = await crear(5);
  let consultas = 0;
  const r = await ubicarCarga(creados, {
    ubicar: async () => {
      consultas++;
      return consultas === 1 ? ubicada : sinRespuesta;
    },
  });
  assert.equal(consultas, 3, "siguió preguntando sin señal");
  assert.equal(r.sinSenal, true);
  assert.equal(r.ubicados, 1);
  assert.deepEqual(r.sinUbicar, creados.slice(1).map((p) => p.id));
  const guardados = await almacen.leerPedidos(HOY);
  assert.equal(guardados.filter((p) => p.lat != null).length, 1);
});

test("ubicarCarga: una que no existe no cuenta como falta de señal", async () => {
  const creados = await crear(3);
  const r = await ubicarCarga(creados, { ubicar: async () => noExiste });
  assert.equal(r.sinSenal, false);
  assert.equal(r.sinUbicar.length, 3);
});

test("ubicarCarga: sin red no pregunta nada", async () => {
  const creados = await crear(3);
  let consultas = 0;
  const r = await ubicarCarga(creados, { enLinea: () => false, ubicar: async () => (consultas++, ubicada) });
  assert.equal(consultas, 0);
  assert.equal(r.sinSenal, true);
  assert.equal(r.sinUbicar.length, 3);
});

test("ubicarCarga: «Dejar de ubicar» corta sin esperar la consulta en curso", async () => {
  const creados = await crear(4);
  const control = new AbortController();
  let consultas = 0;
  const r = await ubicarCarga(creados, {
    senal: control.signal,
    ubicar: async () => {
      consultas++;
      if (consultas === 2) {
        setTimeout(() => control.abort(), 5);
        return new Promise(() => {}); // colgada, como sin señal
      }
      return ubicada;
    },
  });
  assert.equal(r.cortado, true);
  assert.equal(r.ubicados, 1);
  assert.equal(r.sinUbicar.length, 3, "los pedidos quedan creados, sin ubicar");
  assert.equal((await almacen.leerPedidos(HOY)).length, 4);
});

test("hastaAbortar: devuelve null al abortar y el valor si llega antes", async () => {
  const c = new AbortController();
  assert.equal(await hastaAbortar(Promise.resolve(3), c.signal), 3);
  const colgada = hastaAbortar(new Promise(() => {}), c.signal);
  c.abort();
  assert.equal(await colgada, null);
});

test("ubicarDireccion: sin ningún buscador que conteste dice sinRespuesta", async () => {
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    const r = await ubicarDireccion("Pasaje Inventado 12");
    assert.equal(r.tipo, "no_encontrada");
    assert.equal(r.sinRespuesta, true);
  } finally {
    globalThis.fetch = fetchAntes;
  }
});

// ------------------------------------------------------------ la IA
test("cargarLineasGuia: la IA solo ve los de ESTA carga, y sin señal no se le pregunta", async () => {
  await almacen.guardarPedido({ nombre: "Otro", telefono: "+56911111111", direccion: "Calle Vieja 1", lat: null, lng: null, notas: null }, HOY);
  const vistas = [];
  const r = await cargarLineasGuia([{ of: "900500", destino: "Pasaje Nuevo 5" }], HOY, {
    folio: null,
    origen: "guia_pegada",
    lecturaIA: true,
    ubicar: async () => noExiste,
    corregir: async (d) => (vistas.push(d), { tipo: "sin_arreglo", motivo: "m" }),
  });
  assert.deepEqual(vistas, ["Pasaje Nuevo 5"], "le preguntó por pedidos de otra carga");
  assert.equal(r.ia, "hecha");
  assert.equal(r.sinArreglo, 1);

  let preguntas = 0;
  const r2 = await cargarLineasGuia([{ of: "900600", destino: "Pasaje Nuevo 6" }, { of: "900601", destino: "Pasaje Nuevo 7" }], HOY, {
    folio: null,
    origen: "guia_pegada",
    lecturaIA: true,
    ubicar: async () => sinRespuesta,
    corregir: async () => (preguntas++, { tipo: "sin_arreglo", motivo: "m" }),
  });
  assert.equal(r2.sinSenal, true);
  assert.equal(r2.ia, "sinSenal");
  assert.equal(preguntas, 0);
});

test("corregirSinUbicar: los errores son «sin señal», no «sin arreglo», y paran a las 2", async () => {
  await crear(4);
  let preguntas = 0;
  const r = await corregirSinUbicar(HOY, { corregir: async () => (preguntas++, { tipo: "error", mensaje: "sin red" }) });
  assert.equal(preguntas, 2);
  assert.equal(r.sinSenal, 4);
  assert.equal(r.sinArreglo, 0);
});

test("corregirSinUbicar: no vuelve a pagar por las que ya tienen propuesta", async () => {
  const [a, b] = await crear(2);
  const vistas = [];
  await corregirSinUbicar(HOY, { excluir: [a.id], corregir: async (d) => (vistas.push(d), { tipo: "sin_arreglo", motivo: "m" }) });
  assert.deepEqual(vistas, [b.direccion]);
});

// ------------------------------------------------------------ deshacer
test("deshacerCarga: borra lo creado sin tocar y deja lo que ya está en la ruta o escaneado", async () => {
  const [a, b, c] = await crear(3);
  const otro = await almacen.guardarPedido({ nombre: "Otro", telefono: "+56911111111", direccion: "Calle Vieja 1", lat: null, lng: null, notas: null }, HOY);
  await almacen.fijarCoordenadas([{ id: b.id, lat: -18.47, lng: -70.3 }]);
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [b.id], trazado: null, distanciaM: null, duracionS: null });
  await almacen.aplicarLecturaEtiqueta(HOY, { of: c.of, bulto: 1, escaneo: true });
  const r = await almacen.deshacerCarga([a.id, b.id, c.id], HOY);
  assert.deepEqual(r, { borrados: 1, quedan: 2 });
  const ids = (await almacen.leerPedidos(HOY)).map((p) => p.id).sort();
  assert.deepEqual(ids, [b.id, c.id, otro.id].sort());
  assert.equal((await almacen.leerCola()).length, 0, "tocó la cola");
});
