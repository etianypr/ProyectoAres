// «Borrar pedidos» (dueño, 2026-11-18: «no existe forma de borrar las OF con sus direcciones para poder
// hacer un nuevo escaneo»): borra los pedidos del día que nadie tocó, como «Deshacer esta carga» pero
// con todos los del día y sin el resumen de la carga. Los iniciados (con etiqueta, en la ruta o con
// resultado) quedan, y la cola de envío no se toca. OF y direcciones inventadas.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { leerCodigoEtiqueta } = await import("@/lib/encomiendas/lectura/codigo-barras");

const HOY = "2026-11-18";

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

async function cargar(...ofs) {
  const lineas = ofs.map((of, i) => ({ of, destino: `21 DE MAYO ${901 + i}` }));
  return (await almacen.crearDesdeGuia(lineas, HOY, { folio: null, origen: "guia_pegada" })).creados;
}

test("borra los no iniciados y deja los que tienen etiqueta o están en la ruta", async () => {
  const [a, , c, d] = await cargar("281300101", "281300202", "281300303", "281300404");
  // B tiene su etiqueta escaneada; C está en la ruta.
  await almacen.aplicarLecturaEtiqueta(HOY, { ...leerCodigoEtiqueta("92000022560000281300202001"), escaneo: true });
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [c.id], trazado: null, distanciaM: null, duracionS: null });
  const pedidos = await almacen.leerPedidos(HOY);
  const ruta = await almacen.leerRuta(HOY);
  assert.deepEqual(
    almacen.sinIniciar(pedidos, new Set(ruta?.orden ?? [])).map((p) => p.id).sort(),
    [a.id, d.id].sort(),
    "cuenta solo los que nadie tocó",
  );
  const r = await almacen.borrarSinIniciar(HOY);
  assert.deepEqual(r, { borrados: 2, quedan: 2 });
  assert.deepEqual((await almacen.leerPedidos(HOY)).map((p) => p.of).sort(), ["281300202", "281300303"]);
});

test("después de borrar, la misma guía se vuelve a cargar entera (no quedan «ya estaban»)", async () => {
  await cargar("281300101", "281300202");
  await almacen.borrarSinIniciar(HOY);
  const otra = await almacen.crearDesdeGuia(
    [{ of: "281300101", destino: "21 DE MAYO 901" }, { of: "281300202", destino: "21 DE MAYO 902" }],
    HOY,
    { folio: null, origen: "guia_pegada" },
  );
  assert.deepEqual([otra.creados.length, otra.yaEstaban], [2, 0]);
});

test("sin pedidos, no hace nada; y no toca la cola de envío", async () => {
  assert.deepEqual(await almacen.borrarSinIniciar(HOY), { borrados: 0, quedan: 0 });
  const antes = await idb.leerTodos(idb.STORES.cola);
  await cargar("281300101");
  await almacen.borrarSinIniciar(HOY);
  assert.deepEqual(await idb.leerTodos(idb.STORES.cola), antes);
});
