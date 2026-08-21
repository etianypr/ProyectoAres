// El reparto en terreno: las transiciones de una parada, el doble toque, la
// ventana para deshacer y el trabajo sin señal.
//
// Es la prueba que más plata protege del proyecto. Todo lo de acá corre contra
// el almacén y el enviador REALES, sobre IndexedDB de verdad, con un doble del
// cliente de Supabase y el reloj controlado:
//
//  · un evento que se pierde es una entrega que el chofer hizo y no le pagan;
//  · un evento que se duplica es una entrega que se le paga dos veces;
//  · un motivo equivocado le dice al jefe que reintente un pedido que el
//    receptor ya rechazó, o que dé por perdido uno que solo no estaba.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const {
  guardarPedido,
  leerPedidos,
  pedidosPendientes,
  guardarRuta,
  leerRuta,
  cerrarRuta,
  rutaTerminada,
  leerCola,
  marcarEntrega,
  marcarLlamada,
  deshacerEntrega,
  moverAlFinal,
  registrarDisponibilidad,
  registrarRechazo,
  paradaReintentable,
} = almacen;

const { enviarActividadPendiente, sincronizarJornada } = await import(
  "@/lib/encomiendas/local/enviar"
);

const idb = await import("@/lib/encomiendas/local/idb");
const { espia } = await import("./dobles/supabase-client.mjs");
const reloj = await import("./dobles/reloj.mjs");

const HOY = "2026-08-20";
const CHOFER = "11111111-1111-7111-8111-111111111111";

/** Cuánto retiene la app un evento para poder deshacerlo. Es el mismo valor que
 *  MS_DESHACER en use-jornada.ts; acá se repite porque ese archivo es un módulo
 *  de React y traerlo obligaría a montar el hook. */
const MS_DESHACER = 8_000;

const CLAVE = {
  [idb.STORES.pedidos]: (f) => f.id,
  [idb.STORES.rutas]: (f) => f.fecha,
  [idb.STORES.cola]: (f) => f.id,
  [idb.STORES.whatsapp]: (f) => f.pedidoId,
};

async function limpiar() {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    if (todo.length === 0) continue;
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, CLAVE[store](fila));
    });
  }
  espia.reset();
}

async function cargar(cantidad) {
  const ids = [];
  for (let i = 1; i <= cantidad; i++) {
    const p = await guardarPedido({
      nombre: `Cliente ${i}`,
      telefono: `+5691234000${i}`,
      direccion: `Calle ${i} 100, Arica`,
      lat: -18.47 - i / 1000,
      lng: -70.29,
      notas: null,
    });
    ids.push(p.id);
  }
  return ids;
}

async function rutaCon(ids, fecha = HOY) {
  return guardarRuta({
    fecha,
    pedidoIdsEnOrden: ids,
    geometria: null,
    distanciaM: null,
    duracionS: null,
  });
}

const marca = (pedidoId, fecha = HOY) => ({ fecha, pedidoId, choferId: CHOFER });
const pedido = async (id) => (await leerPedidos()).find((p) => p.id === id);
const paradaDe = async (id, fecha = HOY) =>
  (await leerRuta(fecha)).paradas.find((p) => p.pedidoId === id);

test.beforeEach(limpiar);

// ===========================================================================
// Las transiciones de una parada
// ===========================================================================

test("una parada nace pendiente, en llamada y en entrega", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);

  const p = await paradaDe(id);
  assert.equal(p.llamada, "pendiente");
  assert.equal(p.entrega, "pendiente");
  assert.equal(p.horaLlamada, null);
  assert.equal(p.horaEntrega, null);
});

test("llamar y entregar son dos dimensiones distintas", async () => {
  // Confirmar por teléfono no entrega nada, y entregar no requiere haber
  // llamado. Mezclarlas es lo que el principio II de la constitución prohibe.
  const [id] = await cargar(1);
  await rutaCon([id]);

  await marcarLlamada(marca(id), "contesto");
  let p = await paradaDe(id);
  assert.equal(p.llamada, "contesto");
  assert.equal(p.entrega, "pendiente", "llamar cerró la entrega");

  await marcarEntrega(marca(id), "entregado");
  p = await paradaDe(id);
  assert.equal(p.llamada, "contesto", "entregar borró el resultado de la llamada");
  assert.equal(p.entrega, "entregado");
});

test("un receptor puede CONFIRMAR por WhatsApp y después no estar en la casa", async () => {
  // Es el ejemplo textual del documento principal, y la razón por la que las dos
  // dimensiones no se pueden colapsar en una.
  const [id] = await cargar(1);
  await rutaCon([id]);

  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1");
  await marcarEntrega(marca(id), "persona_no_encontrada");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "confirmado", "el resultado del reparto pisó lo que contestó");
  assert.equal((await paradaDe(id)).entrega, "persona_no_encontrada");
  // Y sigue pendiente: hay que volver.
  assert.equal(p.estado, "pendiente");
});

test("cada resultado deja la parada y el pedido donde corresponde", async () => {
  const casos = [
    { resultado: "entregado", pedido: "entregado", reintentable: false },
    { resultado: "persona_no_encontrada", pedido: "pendiente", reintentable: true },
    { resultado: "entrega_sin_respuesta", pedido: "pendiente", reintentable: true },
    { resultado: "rechazo", pedido: "rechazado", reintentable: false },
  ];

  for (const caso of casos) {
    await limpiar();
    const [id] = await cargar(1);
    await rutaCon([id]);
    await marcarEntrega(marca(id), caso.resultado);

    assert.equal((await paradaDe(id)).entrega, caso.resultado);
    assert.equal(
      (await pedido(id)).estado,
      caso.pedido,
      `${caso.resultado} dejó el pedido en el estado equivocado`,
    );
    assert.equal(paradaReintentable(caso.resultado), caso.reintentable);
  }
});

test("la hora de entrega se guarda al cerrar, y no antes", async () => {
  const t = reloj.congelar("2026-08-20T18:45:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    assert.equal((await paradaDe(id)).horaEntrega, null);

    await marcarEntrega(marca(id), "entregado");
    assert.equal((await paradaDe(id)).horaEntrega, "2026-08-20T18:45:00.000Z");
  } finally {
    t();
  }
});

test("mandar una parada al final no la cierra: solo cambia de lugar", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);

  await moverAlFinal({ fecha: HOY, pedidoId: a });

  const ruta = await leerRuta(HOY);
  assert.deepEqual(
    ruta.paradas.map((p) => p.pedidoId),
    [b, c, a],
  );
  assert.equal(ruta.paradas[2].entrega, "pendiente", "mover al final cerró la parada");
  assert.equal((await leerCola()).length, 0, "mover al final encoló un evento");
});

// ===========================================================================
// Doble toque
// ===========================================================================

test("dos toques seguidos con resultados DISTINTOS: manda el primero", async () => {
  // Pasa de verdad: el chofer toca "No estaba", se arrepiente y toca "Rechazó"
  // antes de que la pantalla se actualice. El segundo no puede cambiar nada — para
  // eso está deshacer, que además borra el evento.
  const [id] = await cargar(1);
  await rutaCon([id]);

  const primero = await marcarEntrega(marca(id), "persona_no_encontrada");
  const segundo = await marcarEntrega(marca(id), "rechazo");

  assert.ok(primero);
  assert.equal(segundo, null);
  assert.equal((await paradaDe(id)).entrega, "persona_no_encontrada");
  assert.equal((await pedido(id)).estado, "pendiente", "el segundo toque cerró el pedido");

  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].motivo, "persona_no_encontrada");
});

test("diez toques en paralelo sobre la misma parada: un solo evento", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);

  const ids = await Promise.all(
    Array.from({ length: 10 }, () => marcarEntrega(marca(id), "entregado")),
  );

  assert.equal(ids.filter(Boolean).length, 1, `entraron ${ids.filter(Boolean).length}`);
  assert.equal((await leerCola()).length, 1);
});

test("dos paradas distintas SÍ se pueden marcar en paralelo", async () => {
  // La guarda es por parada, no global: si no, marcar rápido dos entregas
  // seguidas perdería la segunda.
  const [a, b] = await cargar(2);
  await rutaCon([a, b]);

  const ids = await Promise.all([
    marcarEntrega(marca(a), "entregado"),
    marcarEntrega(marca(b), "entregado"),
  ]);

  assert.equal(ids.filter(Boolean).length, 2);
  assert.equal((await leerCola()).length, 2);
});

test("marcar mientras se ubican direcciones no reabre lo ya cerrado", async () => {
  // fijarCoordenadas y marcarEntrega escriben las dos el pedido entero. Sin la
  // fila del almacén, la última en guardar pisaba a la otra y se perdía el
  // "entregado" (el paquete reaparecía mañana) o las coordenadas.
  const [id] = await cargar(1);
  await rutaCon([id]);

  await Promise.all([
    almacen.fijarCoordenadas([{ id, lat: -18.5, lng: -70.3 }]),
    marcarEntrega(marca(id), "rechazo"),
  ]);

  const p = await pedido(id);
  assert.equal(p.estado, "rechazado", "la geocodificación reabrió un pedido rechazado");
  assert.equal(p.lat, -18.5, "se perdieron las coordenadas recién encontradas");
});

// ===========================================================================
// La ventana para deshacer
// ===========================================================================

test("lo recién marcado NO sale al servidor durante la ventana", async () => {
  const t = reloj.congelar("2026-08-20T12:00:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    await marcarEntrega(marca(id), "entregado", MS_DESHACER);

    // La cola lo esconde: ni el envío ni el contador de "sin enviar" lo ven.
    assert.deepEqual(await leerCola(), []);
    assert.deepEqual(await enviarActividadPendiente(), { enviados: 0, pendientes: 0 });
    assert.equal(espia.llamadas.length, 0, "salió al servidor durante la ventana");

    // Vencida la ventana, sale.
    reloj.avanzar("9s");
    assert.equal((await leerCola()).length, 1);
    assert.deepEqual(await enviarActividadPendiente(), { enviados: 1, pendientes: 0 });
  } finally {
    t();
  }
});

test("deshacer dentro de la ventana reabre la parada y borra el evento", async () => {
  const t = reloj.congelar("2026-08-20T12:00:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    const eventoId = await marcarEntrega(marca(id), "rechazo", MS_DESHACER);

    reloj.avanzar("3s");
    assert.equal(await deshacerEntrega({ fecha: HOY, pedidoId: id }, eventoId), true);

    assert.equal((await paradaDe(id)).entrega, "pendiente");
    assert.equal((await pedido(id)).estado, "pendiente", "el pedido quedó rechazado igual");
    assert.equal((await leerCola()).length, 0);

    // Y vencida la ventana no aparece nada: el evento ya no existe.
    reloj.avanzar("10s");
    assert.deepEqual(await leerCola(), []);
  } finally {
    t();
  }
});

test("deshacer DESPUÉS de que el evento salió no hace nada", async () => {
  // Pasada la ventana, el evento ya está en el servidor. Borrarlo del teléfono
  // dejaría las dos partes contando cosas distintas.
  const t = reloj.congelar("2026-08-20T12:00:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    const eventoId = await marcarEntrega(marca(id), "entregado", MS_DESHACER);

    reloj.avanzar("9s");
    await enviarActividadPendiente();

    assert.equal(await deshacerEntrega({ fecha: HOY, pedidoId: id }, eventoId), false);
    assert.equal((await paradaDe(id)).entrega, "entregado", "se reabrió una entrega ya enviada");
  } finally {
    t();
  }
});

test("deshacer la última parada reabre la jornada", async () => {
  // Sin esto, el servidor valoraría un día al que todavía le falta una entrega.
  const t = reloj.congelar("2026-08-20T12:00:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    const eventoId = await marcarEntrega(marca(id), "entregado", MS_DESHACER);

    assert.equal(rutaTerminada(await leerRuta(HOY)), true);
    await cerrarRuta(HOY);
    assert.ok((await leerRuta(HOY)).cerradaEn);

    await deshacerEntrega({ fecha: HOY, pedidoId: id }, eventoId);
    assert.equal((await leerRuta(HOY)).cerradaEn, null, "la jornada quedó cerrada a medias");
  } finally {
    t();
  }
});

// ===========================================================================
// Sin señal
// ===========================================================================

test("sin señal el estado cambia igual y el evento queda pendiente", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);
  espia.responder = () => ({ error: { message: "sin red" } });

  await marcarEntrega(marca(a), "entregado");
  await marcarEntrega(marca(b), "persona_no_encontrada");
  await marcarEntrega(marca(c), "rechazo");

  // El teléfono ya sabe todo: es lo que el chofer ve.
  assert.equal((await pedido(a)).estado, "entregado");
  assert.equal((await pedido(b)).estado, "pendiente");
  assert.equal((await pedido(c)).estado, "rechazado");

  await assert.rejects(() => enviarActividadPendiente(), /sin red/);
  assert.equal((await leerCola()).length, 3, "se perdió trabajo del chofer");
});

test("al volver la señal llega todo, una sola vez, con sus motivos", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);
  espia.responder = () => ({ error: { message: "sin red" } });

  await marcarEntrega(marca(a), "entregado");
  await marcarEntrega(marca(b), "entrega_sin_respuesta");
  await marcarEntrega(marca(c), "rechazo");
  await assert.rejects(() => enviarActividadPendiente());

  espia.reset();
  const r = await enviarActividadPendiente();
  assert.deepEqual(r, { enviados: 3, pendientes: 0 });

  const filas = espia.llamadas[0].filas;
  const porMotivo = Object.fromEntries(filas.map((f) => [f.motivo, f.tipo]));
  assert.equal(porMotivo["null"] ?? porMotivo[null], "entrega");
  assert.equal(porMotivo.sin_respuesta, "omision");
  assert.equal(porMotivo.rechazo, "omision");

  // Y reintentar no manda nada más.
  espia.reset();
  assert.deepEqual(await enviarActividadPendiente(), { enviados: 0, pendientes: 0 });
  assert.equal(espia.llamadas.length, 0);
});

test("reenviar el mismo lote no duplica el conteo", async () => {
  // El corte clásico: el servidor insertó pero la confirmación no llegó, así que
  // la cola quedó con los eventos. El id decidido en el teléfono más el
  // "no hacer nada si ya existe" del servidor es lo que lo hace inofensivo.
  const [a, b] = await cargar(2);
  await rutaCon([a, b]);
  await marcarEntrega(marca(a), "entregado");
  await marcarEntrega(marca(b), "rechazo");

  const primeros = (await leerCola()).map((e) => e.id);

  espia.responder = () => {
    throw new Error("se cortó después del insert");
  };
  await assert.rejects(() => enviarActividadPendiente());
  assert.deepEqual((await leerCola()).map((e) => e.id), primeros, "se vació sin confirmar");

  espia.reset();
  await enviarActividadPendiente();
  assert.deepEqual(espia.llamadas[0].opciones, { onConflict: "id", ignoreDuplicates: true });
  assert.deepEqual(espia.llamadas[0].filas.map((f) => f.id), primeros, "cambiaron los ids");
});

test("la jornada NO se cierra en el servidor mientras quede algo por enviar", async () => {
  // Cerrarla es lo que hace que el servidor cuente el día. Si llega antes que las
  // últimas entregas, el panel del jefe muestra una liquidación corta — y eso el
  // conductor lo lee como plata que le falta.
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega(marca(id), "entregado");
  await cerrarRuta(HOY);

  await sincronizarJornada(CHOFER, HOY);
  const jornadas = espia.llamadas.filter((l) => l.tabla === "encomienda_jornadas");
  assert.equal(jornadas.length, 1);
  assert.equal(jornadas[0].filas.cerrada_en != null, true);
  assert.deepEqual(jornadas[0].opciones, { onConflict: "chofer_id,fecha" });
});

test("sin ruta generada no se abre ninguna jornada en el servidor", async () => {
  await sincronizarJornada(CHOFER, HOY);
  assert.equal(espia.llamadas.length, 0);
});

// ===========================================================================
// El arrastre al día siguiente
// ===========================================================================

test("lo no entregado reintentable se arrastra; el rechazo no", async () => {
  const [a, b, c, d] = await cargar(4);
  await rutaCon([a, b, c, d]);

  await marcarEntrega(marca(a), "entregado");
  await marcarEntrega(marca(b), "persona_no_encontrada");
  await marcarEntrega(marca(c), "entrega_sin_respuesta");
  await marcarEntrega(marca(d), "rechazo");

  const pendientes = (await pedidosPendientes()).map((p) => p.id).sort();
  assert.deepEqual(pendientes, [b, c].sort(), "el arrastre al día siguiente quedó mal");
});

test("regenerar la ruta conserva las paradas cerradas, en su orden", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);
  await marcarEntrega(marca(a), "entregado");
  await marcarEntrega(marca(b), "rechazo");

  // Se rehace con OTRO orden y con un pedido nuevo.
  const [d] = [(await cargar(1))[0]];
  await rutaCon([c, d]);

  const ruta = await leerRuta(HOY);
  assert.deepEqual(
    ruta.paradas.map((p) => p.pedidoId),
    [a, b, c, d],
    "lo cerrado tiene que quedar primero y en su orden original",
  );
  assert.equal(ruta.paradas[0].entrega, "entregado");
  assert.equal(ruta.paradas[1].entrega, "rechazo");
  assert.equal(ruta.paradas[2].entrega, "pendiente");
});

test("regenerar conserva la llamada de una parada que sigue pendiente", async () => {
  // Ya llamó: no tiene por qué volver a llamar solo porque rehizo la ruta.
  const [a, b] = await cargar(2);
  await rutaCon([a, b]);
  await marcarLlamada(marca(a), "no_contesto");

  await rutaCon([b, a]);

  const parada = await paradaDe(a);
  assert.equal(parada.llamada, "no_contesto");
  assert.ok(parada.horaLlamada);
});

test("regenerar REABRE la jornada: entraron paradas nuevas", async () => {
  const [a] = await cargar(1);
  await rutaCon([a]);
  await marcarEntrega(marca(a), "entregado");
  await cerrarRuta(HOY);
  assert.ok((await leerRuta(HOY)).cerradaEn);

  const [b] = await cargar(1);
  await rutaCon([b]);
  assert.equal((await leerRuta(HOY)).cerradaEn, null);
});

// ===========================================================================
// El día trabajado
// ===========================================================================

test("la primera acción del día se registra aunque no se entregue nada", async () => {
  // De eso depende el fijo diario: el chofer salió, llamó a todos y no logró
  // entregar nada. El día se trabajó.
  const [a, b] = await cargar(2);
  await rutaCon([a, b]);

  await marcarLlamada(marca(a), "no_contesto");
  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "llamada");

  // La segunda llamada no encola otra: cualquier evento del día prueba lo mismo.
  await marcarLlamada(marca(b), "no_contesto");
  assert.equal((await leerCola()).filter((e) => e.tipo === "llamada").length, 1);
});

test("una entrega ya prueba el día: no hace falta encolar una llamada", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega(marca(id), "entregado");

  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "entrega");
});

test("un rechazo también prueba el día trabajado", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega(marca(id), "rechazo");

  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "omision");
  assert.equal(cola[0].motivo, "rechazo");
});

// ===========================================================================
// El rechazo que llegó por WhatsApp, sin parada
// ===========================================================================

test("registrar un rechazo suelto lo cuenta y lo cierra, sin ruta", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");

  const eventoId = await registrarRechazo(marca(id));
  assert.ok(eventoId);
  assert.equal((await pedido(id)).estado, "rechazado");
  assert.deepEqual(await pedidosPendientes(), []);

  await enviarActividadPendiente();
  const fila = espia.llamadas[0].filas[0];
  assert.equal(fila.tipo, "omision");
  assert.equal(fila.motivo, "rechazo");
});

test("un rechazo suelto sin señal queda en la cola y sale después", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");
  espia.responder = () => ({ error: { message: "sin red" } });

  await registrarRechazo(marca(id));
  assert.equal((await pedido(id)).estado, "rechazado", "el cierre local no puede depender de la red");
  await assert.rejects(() => enviarActividadPendiente());
  assert.equal((await leerCola()).length, 1);

  espia.reset();
  assert.deepEqual(await enviarActividadPendiente(), { enviados: 1, pendientes: 0 });
});
