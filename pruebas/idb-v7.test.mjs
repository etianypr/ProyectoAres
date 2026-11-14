// IndexedDB v6 → v7 (dueño, 2026-11-13): aparece «borradoresGuia» y no se pierde nada.
// Un teléfono con un día a medias en la v6 —la que tienen los teléfonos hoy— abre la
// v7. La base se arma de verdad (fake-indexeddb) ANTES de que la app la abra.
// Datos inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const HOY = "2026-11-13";

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

async function crearBaseV6() {
  await new Promise((resolve, reject) => {
    const s = indexedDB.open("dashund-encomiendas", 6);
    s.onupgradeneeded = () => {
      const base = s.result;
      base.createObjectStore("pedidos", { keyPath: "id" });
      base.createObjectStore("rutas", { keyPath: "fecha" });
      base.createObjectStore("cola", { keyPath: "id" });
      base.createObjectStore("dias", { keyPath: "fecha" });
      base.createObjectStore("fotos", { keyPath: "id" }).createIndex("por_fecha", "fecha");
      base.createObjectStore("propuestas", { keyPath: "fecha" });
    };
    s.onsuccess = () => {
      const base = s.result;
      const tx = base.transaction(["pedidos", "rutas", "cola", "dias", "fotos", "propuestas"], "readwrite");
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
      tx.objectStore("propuestas").put({ fecha: HOY, firma: "f", datos: null, guardadaEn: `${HOY}T12:00:00.000Z` });
      tx.oncomplete = () => {
        base.close(); // sin esto, la subida a v7 queda bloqueada
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    s.onerror = () => reject(s.error);
  });
}

await crearBaseV6();
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

test("la v7 conserva pedidos, ruta, cola, días, fotos y propuestas, y agrega «borradoresGuia» vacío", async () => {
  assert.deepEqual((await almacen.leerPedidos(HOY)).map((p) => [p.id, p.resultado]).sort(), [
    ["A", "entregado"],
    ["B", "pendiente"],
  ]);
  assert.deepEqual((await almacen.leerRuta(HOY)).orden, ["A", "B"]);
  assert.deepEqual((await idb.leerTodos(idb.STORES.cola)).map((e) => e.id), ["E1"]);
  assert.deepEqual((await idb.leerTodos(idb.STORES.dias)).map((d) => d.fecha), ["2026-11-08"]);
  assert.deepEqual(await idb.clavesFotosDe(HOY), ["F1"]);
  assert.deepEqual((await idb.leerTodos(idb.STORES.propuestas)).map((p) => p.fecha), [HOY]);
  assert.deepEqual(await idb.leerTodos(idb.STORES.borradoresGuia), []);
});

const borrador = (fecha) => ({
  fecha,
  paso: "revisar",
  lineas: [{ of: "123456789", destino: "Avenida Santa María 2150", dudosa: false }],
  avisos: [],
  folio: "F1",
  total: 1,
  texto: "",
  fuente: "ia",
});

test("borradorGuia: se guarda, se lee y se borra; uno por día", async () => {
  await almacen.guardarBorradorGuia(borrador(HOY));
  await almacen.guardarBorradorGuia({ ...borrador(HOY), paso: "pegar" });
  assert.equal((await almacen.leerBorradorGuia(HOY)).paso, "pegar");
  assert.equal((await idb.leerTodos(idb.STORES.borradoresGuia)).length, 1);
  await almacen.borrarBorradorGuia(HOY);
  assert.equal(await almacen.leerBorradorGuia(HOY), null);
});

test("cerrar el día borra la guía sin crear de esa fecha", async () => {
  await almacen.guardarBorradorGuia(borrador(HOY));
  await almacen.cerrarYBorrarDia(HOY);
  assert.equal(await almacen.leerBorradorGuia(HOY), null);
});

test("borrarSueltos: una guía sin crear de un día anterior, sin pedidos, se va; la de hoy no", async () => {
  await almacen.guardarBorradorGuia(borrador("2026-11-10"));
  await almacen.guardarBorradorGuia(borrador("2026-11-14"));
  await almacen.borrarSueltos("2026-11-14");
  assert.deepEqual((await idb.leerTodos(idb.STORES.borradoresGuia)).map((b) => b.fecha), ["2026-11-14"]);
});
