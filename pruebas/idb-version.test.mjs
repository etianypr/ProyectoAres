// IndexedDB v3 → v5: aparecen los stores `dias` (spec 007) y `fotos` (spec 003) y no
// se pierde nada.
//
// Un teléfono que actualiza la app a mitad del día: tiene pedidos, la ruta y
// eventos sin enviar en una base v3. Se arma esa base de verdad (fake-indexeddb)
// ANTES de que la app la abra y después se lee con el almacén real.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const HOY = "2026-10-24";

const pedido = (id, resultado) => ({
  id,
  fecha: HOY,
  nombre: `Cliente ${id}`,
  telefono: "+56912340000",
  direccion: `Calle ${id}`,
  lat: -18.47,
  lng: -70.29,
  notas: null,
  disponibilidad: "pendiente_respuesta",
  bloqueHorarioId: null,
  aviso: {
    estado: "no_enviado",
    codigo: null,
    mensajeId: null,
    enviadoEn: null,
    ultimoError: null,
    intentos: 0,
    horariosEnviados: false,
    respuestasAplicadas: [],
  },
  llamada: "pendiente",
  resultado,
  horaLlamada: null,
  horaResultado: resultado === "pendiente" ? null : `${HOY}T15:00:00.000Z`,
  cargadoEn: `${HOY}T12:00:00.000Z`,
});

async function crearBaseV3() {
  await new Promise((resolve, reject) => {
    const s = indexedDB.open("pucarani-encomiendas", 3);
    s.onupgradeneeded = () => {
      const base = s.result;
      base.createObjectStore("pedidos", { keyPath: "id" });
      base.createObjectStore("rutas", { keyPath: "fecha" });
      base.createObjectStore("cola", { keyPath: "id" });
    };
    s.onsuccess = () => {
      const base = s.result;
      const tx = base.transaction(["pedidos", "rutas", "cola"], "readwrite");
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
      tx.objectStore("cola").put({
        id: "E1",
        conductorId: "c1",
        fecha: HOY,
        tipo: "entrega",
        hora: `${HOY}T15:00:00.000Z`,
      });
      tx.oncomplete = () => {
        base.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    s.onerror = () => reject(s.error);
  });
}

await crearBaseV3();
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

test("la v5 conserva pedidos, ruta y cola, y agrega `dias` y `fotos` vacíos", async () => {
  assert.deepEqual((await almacen.leerPedidos(HOY)).map((p) => p.id).sort(), ["A", "B"]);
  assert.deepEqual((await almacen.leerRuta(HOY)).orden, ["A", "B"]);
  assert.deepEqual((await idb.leerTodos(idb.STORES.cola)).map((e) => e.id), ["E1"]);
  assert.deepEqual(await idb.leerTodos(idb.STORES.dias), []);
  assert.deepEqual(await idb.leerTodos(idb.STORES.fotos), []);
  const [a] = await almacen.leerPedidos(HOY);
  assert.deepEqual([a.of, a.referencia, a.fotoId], [null, null, null], "los pedidos de antes no tienen paquete");
});

test("STORES_DEL_DIA nombra los stores con datos de destinatarios", () => {
  assert.deepEqual([...idb.STORES_DEL_DIA].sort(), ["fotos", "pedidos", "rutas"]);
  assert.equal(idb.STORES_DEL_DIA.includes("cola"), false, "la cola no se borra con el día");
  assert.equal(idb.STORES_DEL_DIA.includes("dias"), false, "el resumen sobrevive al día");
});
