// La app se cerró con una entrega retenida «sin plazo» (el «Deshacer» estaba a la
// vista cuando ARES pasó al fondo, y Android la cerró ahí). Al abrir de nuevo no hay
// «Deshacer» posible: la entrega tiene que salir. Ensayo del día real, 2026-11-09.
//
// Archivo aparte a propósito: node:test corre cada archivo en su propio proceso, así
// que la primera leerCola de acá es la de una app recién abierta.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

const HOY = "2026-11-09";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

test("al abrir, la entrega retenida sin plazo sale; la de un aviso nuevo sigue retenida", async () => {
  const { creados } = await almacen.crearDesdeGuia(
    [
      { of: "300000001", destino: "CALLE UNO 100" },
      { of: "300000002", destino: "CALLE DOS 200" },
    ],
    HOY,
    { folio: null, origen: "guia_ia" },
  );
  await almacen.fijarCoordenadas(creados.map((p, i) => ({ id: p.id, lat: -18.47 - i / 1000, lng: -70.29 })));
  await almacen.guardarRuta({ fecha: HOY, pedidoIdsEnOrden: creados.map((p) => p.id), trazado: null, distanciaM: null, duracionS: null });
  // Lo que dejó la sesión anterior: entregada y retenida sin plazo (app al fondo).
  const huerfana = await almacen.marcarResultado({ fecha: HOY, pedidoId: creados[0].id, conductorId: CONDUCTOR }, "entregado", 8000);
  await almacen.retenerEvento(huerfana, "9999-12-31T00:00:00.000Z");

  // La app se abre: la primera lectura de la cola la suelta.
  assert.ok((await almacen.leerCola()).some((e) => e.id === huerfana), "la entrega huérfana sale");
  assert.equal((await idb.leerUno(idb.STORES.cola, huerfana)).retenidoHasta, undefined);

  // Una entrega nueva, con su «Deshacer» a la vista, sigue esperando su ventana.
  const nueva = await almacen.marcarResultado({ fecha: HOY, pedidoId: creados[1].id, conductorId: CONDUCTOR }, "entregado", 8000);
  assert.ok(!(await almacen.leerCola()).some((e) => e.id === nueva), "la nueva espera el Deshacer");
  await almacen.retenerEvento(nueva, "9999-12-31T00:00:00.000Z");
  assert.ok(!(await almacen.leerCola()).some((e) => e.id === nueva), "y retenida sin plazo con la app atrás, también");
});
