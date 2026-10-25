// Spec 002 US2: el renombrado a "conductor" (migración 0006) no pierde lo que el
// teléfono dejó en la cola con el nombre de antes: sale una vez, con conductorId.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

test("un evento guardado con choferId se lee como conductorId", async () => {
  const viejo = { id: "0190-evento-viejo", choferId: "c-1", fecha: "2026-10-24", tipo: "entrega", hora: "2026-10-24T15:00:00.000Z" };
  const nuevo = { id: "0190-evento-nuevo", conductorId: "c-1", fecha: "2026-10-24", tipo: "llamada", hora: "2026-10-24T16:00:00.000Z" };
  await idb.escribir([idb.STORES.cola], ({ guardar }) => {
    guardar(idb.STORES.cola, viejo);
    guardar(idb.STORES.cola, nuevo);
  });
  const cola = await almacen.leerCola();
  assert.deepEqual(cola.map((e) => [e.id, e.conductorId]), [["0190-evento-viejo", "c-1"], ["0190-evento-nuevo", "c-1"]]);
  assert.equal("choferId" in cola[0], false);
});
