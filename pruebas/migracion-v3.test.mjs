// IndexedDB v2 → v3 (spec 009): la parada se funde en el pedido.
//
// Es el caso real de un teléfono que actualiza la app a mitad del día: lo
// que ya marcó vivía en rutas.paradas y tiene que aparecer en cada pedido, sin
// perder nada. Se arma una base v2 de verdad (fake-indexeddb) ANTES de que la
// app la abra, y después se lee con el almacén real.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const reloj = await import("./dobles/reloj.mjs");

const HOY = "2026-08-20";
const AYER = "2026-08-19";
const restaurarReloj = reloj.congelar("2026-08-20T15:00:00.000Z");
test.after(restaurarReloj);

const pedidoV2 = (id, estado, cargadoEn) => ({
  id,
  nombre: `Cliente ${id}`,
  telefono: "+56912340000",
  direccion: `Calle ${id}`,
  lat: -18.47,
  lng: -70.29,
  notas: null,
  estado,
  disponibilidad: id === "E" ? "rechazado" : "pendiente_respuesta",
  bloqueHorarioId: null,
  cargadoEn,
});

const parada = (pedidoId, llamada, entrega, horaEntrega = null) => ({
  pedidoId,
  llamada,
  entrega,
  horaLlamada: llamada === "pendiente" ? null : "2026-08-20T13:00:00.000Z",
  horaEntrega,
});

const rutaV2 = (fecha, paradas, cerradaEn = null) => ({
  fecha,
  paradas,
  geometria: null,
  distanciaM: null,
  duracionS: null,
  generadaEn: `${fecha}T12:00:00.000Z`,
  cerradaEn,
  advertencias: [],
  propuestasComparadas: 1,
  versionDisponibilidad: null,
});

/** Una base v2 como la deja la app anterior: A se arrastró de ayer a hoy, B ya
 *  se entregó hoy, C sigue pendiente en la ruta, D se cargó ayer y nunca entró
 *  en una ruta, E se rechazó por WhatsApp. */
async function crearBaseV2() {
  await new Promise((resolve, reject) => {
    const solicitud = indexedDB.open("pucarani-encomiendas", 2);
    solicitud.onupgradeneeded = () => {
      const base = solicitud.result;
      base.createObjectStore("pedidos", { keyPath: "id" }).createIndex("por_estado", "estado");
      base.createObjectStore("rutas", { keyPath: "fecha" });
      base.createObjectStore("cola", { keyPath: "id" });
      base.createObjectStore("whatsapp", { keyPath: "pedidoId" });
    };
    solicitud.onsuccess = () => {
      const base = solicitud.result;
      const tx = base.transaction(["pedidos", "rutas", "whatsapp"], "readwrite");
      tx.objectStore("whatsapp").put({
        pedidoId: "B",
        correlationId: "corr-B",
        mensajeId: "wamid.B",
        estado: "respondido",
        enviadoEn: "2026-08-20T12:30:00.000Z",
        ultimoError: null,
        intentos: 1,
        horariosEnviados: false,
        respuestasAplicadas: ["wamid.RB"],
      });
      const pedidos = tx.objectStore("pedidos");
      pedidos.put(pedidoV2("A", "pendiente", "2026-08-19T13:00:00.000Z"));
      pedidos.put(pedidoV2("B", "entregado", "2026-08-20T12:00:00.000Z"));
      pedidos.put(pedidoV2("C", "pendiente", "2026-08-20T12:00:00.000Z"));
      pedidos.put(pedidoV2("D", "pendiente", "2026-08-19T20:00:00.000Z"));
      pedidos.put(pedidoV2("E", "rechazado", "2026-08-20T12:00:00.000Z"));
      const rutas = tx.objectStore("rutas");
      rutas.put(rutaV2(AYER, [parada("A", "no_contesto", "persona_no_encontrada", "2026-08-19T16:00:00.000Z")], "2026-08-19T22:00:00.000Z"));
      rutas.put(
        rutaV2(HOY, [
          parada("B", "contesto", "entregado", "2026-08-20T14:00:00.000Z"),
          parada("A", "pendiente", "pendiente"),
          parada("C", "pendiente", "pendiente"),
        ]),
      );
      tx.oncomplete = () => {
        base.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    solicitud.onerror = () => reject(solicitud.error);
  });
}

await crearBaseV2();
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

test("abrir con la app nueva funde cada parada en su pedido", async () => {
  const hoy = new Map((await almacen.leerPedidos(HOY)).map((p) => [p.id, p]));

  // B: entregado hoy, con su llamada y su hora.
  assert.equal(hoy.get("B").resultado, "entregado");
  assert.equal(hoy.get("B").llamada, "contesto");
  assert.equal(hoy.get("B").horaResultado, "2026-08-20T14:00:00.000Z");
  // A: manda la parada del día más reciente (hoy, pendiente), no la de ayer.
  assert.equal(hoy.get("A").resultado, "pendiente");
  assert.equal(hoy.get("A").llamada, "pendiente");
  // C: pendiente en la ruta de hoy.
  assert.equal(hoy.get("C").resultado, "pendiente");
  // D: pendiente y sin ruta: es trabajo del día en curso.
  assert.equal(hoy.get("D").fecha, HOY);
  // El aviso de B pasó del store "whatsapp" al pedido; los demás, vacío.
  assert.equal(hoy.get("B").aviso.codigo, "corr-B");
  assert.deepEqual(hoy.get("B").aviso.respuestasAplicadas, ["wamid.RB"]);
  assert.equal(hoy.get("C").aviso.estado, "pendiente");
  // E: el rechazo por WhatsApp cerró el pedido sin parada: no entregado.
  assert.equal(hoy.get("E").resultado, "no_entregado");

  for (const p of hoy.values()) assert.equal("estado" in p, false, `${p.id} conserva estado`);
});

test("las rutas guardan solo el orden de visita", async () => {
  const hoy = await almacen.leerRuta(HOY);
  assert.deepEqual(hoy.orden, ["B", "A", "C"]);
  // Los campos de la v2 toman los nombres del glosario.
  assert.equal(hoy.inicio, "2026-08-20T12:00:00.000Z");
  assert.equal(hoy.cierre, null);
  assert.equal(hoy.trazado, null);
  for (const viejo of ["geometria", "generadaEn", "cerradaEn"]) assert.equal(viejo in hoy, false, viejo);
  assert.equal((await almacen.leerRuta(AYER)).cierre, "2026-08-19T22:00:00.000Z");
  assert.equal("paradas" in hoy, false);
  assert.deepEqual((await almacen.leerRuta(AYER)).orden, ["A"]);
});

test("el día en curso sigue igual en pantalla: misma cuenta y mismo cierre pendiente", async () => {
  const [ruta, pedidos] = await Promise.all([almacen.leerRuta(HOY), almacen.leerPedidos(HOY)]);
  const dia = almacen.resumirDia(ruta, pedidos);
  assert.deepEqual(
    { paradas: dia.paradas, entregadas: dia.entregadas, noEntregadas: dia.noEntregadas },
    // E (rechazado por WhatsApp, fuera de la ruta) también vuelve a Starken: cuenta
    // como no entregado del día (spec 007).
    { paradas: 3, entregadas: 1, noEntregadas: 1 },
  );
  assert.equal(almacen.rutaTerminada(ruta, pedidos), false);
});

test("se borran el índice por estado y el store de avisos aparte", async () => {
  const base = await new Promise((resolve, reject) => {
    const s = indexedDB.open("pucarani-encomiendas");
    s.onsuccess = () => resolve(s.result);
    s.onerror = () => reject(s.error);
  });
  try {
    // Las versiones siguientes llegan en la misma apertura: v2 → v3 → v4 (007) → v5 (003).
    assert.equal(base.version, 5);
    assert.equal(base.objectStoreNames.contains("dias"), true, "falta el store de días");
    assert.equal(base.objectStoreNames.contains("fotos"), true, "falta el store de fotos");
    const tx = base.transaction("pedidos", "readonly");
    assert.equal(tx.objectStore("pedidos").indexNames.contains("por_estado"), false);
    assert.equal(base.objectStoreNames.contains("whatsapp"), false, "quedó el store de avisos aparte");
  } finally {
    base.close();
  }
  // Y el almacén sigue escribiendo normalmente después de migrar.
  const nuevo = await almacen.guardarPedido(
    { nombre: "F", telefono: "+56912340001", direccion: "Calle F", lat: -18.47, lng: -70.29, notas: null },
    HOY,
  );
  assert.equal((await idb.leerUno(idb.STORES.pedidos, nuevo.id)).resultado, "pendiente");
});

test("todo lo cerrado sin entregar de antes se lee como no entregado (spec 012)", async () => {
  const { alDia } = await import("@/lib/encomiendas/local/almacen/migrar");
  const viejo = { ...pedidoV2("Z", undefined, "2026-08-20T12:00:00.000Z"), fecha: HOY };
  for (const antes of ["persona_no_encontrada", "entrega_sin_respuesta", "rechazo", "omitido"]) {
    assert.equal(alDia({ ...viejo, resultado: antes }).resultado, "no_entregado", antes);
  }
  assert.equal(alDia({ ...viejo, resultado: "entregado" }).resultado, "entregado");
  assert.equal(alDia(viejo).resultado, "pendiente");
});

test("migrarV2: la última parada manda y un estado cerrado gana sobre ella", async () => {
  const { migrarV2 } = await import("@/lib/encomiendas/local/almacen/migrar");
  const { pedidos, rutas } = migrarV2(
    [
      pedidoV2("X", "rechazado", "2026-08-18T12:00:00.000Z"),
      pedidoV2("Y", "pendiente", "2026-08-18T12:00:00.000Z"),
    ],
    [
      rutaV2("2026-08-18", [parada("X", "contesto", "persona_no_encontrada"), parada("Y", "pendiente", "pendiente")]),
      rutaV2("2026-08-19", [parada("Y", "no_contesto", "entrega_sin_respuesta")]),
    ],
    [],
    HOY,
  );
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  assert.equal(porId.get("X").resultado, "no_entregado", "el rechazo posterior por WhatsApp se perdió");
  assert.equal(porId.get("Y").resultado, "no_entregado", "«No hay respuesta» no pasó a no entregado");
  assert.equal(porId.get("Y").fecha, "2026-08-19");
  assert.deepEqual(rutas.map((r) => r.orden), [["X", "Y"], ["Y"]]);
});
