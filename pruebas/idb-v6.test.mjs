// IndexedDB v5 → v6 (dueño, 2026-11-09): aparece «propuestas» y no se pierde nada.
// Un teléfono con un día a medias en la v5 —la que tienen los teléfonos hoy— abre la
// v6. La base se arma de verdad (fake-indexeddb) ANTES de que la app la abra.
// Datos inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const HOY = "2026-11-09";

const pedido = (id, resultado) => ({
  id,
  fecha: HOY,
  nombre: `Cliente ${id}`,
  telefono: "+56912340000",
  direccion: `Calle ${id} 100`,
  lat: -18.47,
  lng: -70.29,
  notas: null,
  disponibilidad: "pendiente_respuesta",
  bloqueHorarioId: null,
  llamada: "pendiente",
  resultado,
  horaLlamada: null,
  horaResultado: resultado === "pendiente" ? null : `${HOY}T15:00:00.000Z`,
  cargadoEn: `${HOY}T12:00:00.000Z`,
  of: `90000000${id === "A" ? 1 : 2}`,
});

async function crearBaseV5() {
  await new Promise((resolve, reject) => {
    const s = indexedDB.open("dashund-encomiendas", 5);
    s.onupgradeneeded = () => {
      const base = s.result;
      base.createObjectStore("pedidos", { keyPath: "id" });
      base.createObjectStore("rutas", { keyPath: "fecha" });
      base.createObjectStore("cola", { keyPath: "id" });
      base.createObjectStore("dias", { keyPath: "fecha" });
      base.createObjectStore("fotos", { keyPath: "id" }).createIndex("por_fecha", "fecha");
    };
    s.onsuccess = () => {
      const base = s.result;
      const tx = base.transaction(["pedidos", "rutas", "cola", "dias", "fotos"], "readwrite");
      tx.objectStore("pedidos").put(pedido("A", "entregado"));
      tx.objectStore("pedidos").put(pedido("B", "pendiente"));
      tx.objectStore("rutas").put({
        fecha: HOY,
        orden: ["A", "B"],
        trazado: null,
        distanciaM: null,
        duracionS: null,
        inicio: `${HOY}T12:30:00.000Z`,
        cierre: null,
        advertencias: [],
        propuestasComparadas: 1,
      });
      tx.objectStore("cola").put({ id: "E1", conductorId: "c1", fecha: HOY, tipo: "entrega", hora: `${HOY}T15:00:00.000Z` });
      tx.objectStore("dias").put({ fecha: "2026-11-08", asignados: 3, entregadas: 2 });
      tx.objectStore("fotos").put({ id: "F1", pedidoId: "A", fecha: HOY, blob: new Blob(["x"]) });
      tx.oncomplete = () => {
        base.close(); // sin esto, la subida a v6 queda bloqueada
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    s.onerror = () => reject(s.error);
  });
}

await crearBaseV5();
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

test("la v6 conserva pedidos, ruta, cola, días y fotos, y agrega «propuestas» vacío", async () => {
  assert.deepEqual((await almacen.leerPedidos(HOY)).map((p) => [p.id, p.resultado]).sort(), [
    ["A", "entregado"],
    ["B", "pendiente"],
  ]);
  assert.deepEqual((await almacen.leerRuta(HOY)).orden, ["A", "B"]);
  assert.deepEqual((await idb.leerTodos(idb.STORES.cola)).map((e) => e.id), ["E1"]);
  assert.deepEqual((await idb.leerTodos(idb.STORES.dias)).map((d) => d.fecha), ["2026-11-08"]);
  assert.deepEqual(await idb.clavesFotosDe(HOY), ["F1"]);
  assert.deepEqual(await idb.leerTodos(idb.STORES.propuestas), []);
});
