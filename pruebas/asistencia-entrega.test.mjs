// El reparto en terreno: las transiciones de una parada, el doble toque, la
// ventana para deshacer y el trabajo sin señal.
//
// Es la prueba que más plata protege del proyecto. Todo lo de acá corre contra
// el almacén y el enviador REALES, sobre IndexedDB de verdad, con un doble del
// cliente de Supabase y el reloj controlado:
//
//  · un evento que se pierde es una entrega que el chofer hizo y no le pagan;
//  · un evento que se duplica es una entrega que se le paga dos veces.
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
  cerrarDia,
  rutaTerminada,
  leerCola,
  marcarResultado,
  marcarLlamada,
  deshacerResultado,
  moverAlFinal,
  registrarDisponibilidad,
} = almacen;

const { enviarActividadPendiente, sincronizarDiaTrabajo } = await import(
  "@/lib/encomiendas/local/enviar"
);

const idb = await import("@/lib/encomiendas/local/idb");
const { espia } = await import("./dobles/supabase-client.mjs");
const reloj = await import("./dobles/reloj.mjs");

const HOY = "2026-08-20";
const CHOFER = "11111111-1111-7111-8111-111111111111";

/** Cuánto retiene la app un evento para poder deshacerlo. Es el mismo valor que
 *  MS_DESHACER en use-dia-trabajo.ts; acá se repite porque ese archivo es un módulo
 *  de React y traerlo obligaría a montar el hook. */
const MS_DESHACER = 8_000;

const CLAVE = {
  [idb.STORES.pedidos]: (f) => f.id,
  [idb.STORES.rutas]: (f) => f.fecha,
  [idb.STORES.cola]: (f) => f.id,
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
    }, HOY);
    ids.push(p.id);
  }
  return ids;
}

async function rutaCon(ids, fecha = HOY) {
  return guardarRuta({
    fecha,
    pedidoIdsEnOrden: ids,
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
}

const marca = (pedidoId, fecha = HOY) => ({ fecha, pedidoId, choferId: CHOFER });
const pedido = async (id) => (await leerPedidos(HOY)).find((p) => p.id === id);
// La visita (llamada, resultado, horas) vive en el pedido (spec 009).
const paradaDe = pedido;

test.beforeEach(limpiar);

// ===========================================================================
// Las transiciones de una parada
// ===========================================================================

test("una parada nace pendiente, en llamada y en entrega", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);

  const p = await paradaDe(id);
  assert.equal(p.llamada, "pendiente");
  assert.equal(p.resultado, "pendiente");
  assert.equal(p.horaLlamada, null);
  assert.equal(p.horaResultado, null);
});

test("llamar y entregar son dos dimensiones distintas", async () => {
  // Confirmar por teléfono no entrega nada, y entregar no requiere haber
  // llamado. Mezclarlas es lo que el principio II de la constitución prohibe.
  const [id] = await cargar(1);
  await rutaCon([id]);

  await marcarLlamada(marca(id), "contesto");
  let p = await paradaDe(id);
  assert.equal(p.llamada, "contesto");
  assert.equal(p.resultado, "pendiente", "llamar cerró la entrega");

  await marcarResultado(marca(id), "entregado");
  p = await paradaDe(id);
  assert.equal(p.llamada, "contesto", "entregar borró el resultado de la llamada");
  assert.equal(p.resultado, "entregado");
});

test("un receptor puede CONFIRMAR por WhatsApp y después no estar en la casa", async () => {
  // Es el ejemplo textual del documento principal, y la razón por la que las dos
  // dimensiones no se pueden colapsar en una.
  const [id] = await cargar(1);
  await rutaCon([id]);

  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CHOFER);
  await marcarResultado(marca(id), "no_entregado");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "confirmado", "el resultado del reparto pisó lo que contestó");
  assert.equal(p.resultado, "no_entregado");
});

test("cada resultado queda en el pedido y lo cierra por el día", async () => {
  for (const resultado of ["entregado", "no_entregado"]) {
    await limpiar();
    const [id] = await cargar(1);
    await rutaCon([id]);
    await marcarResultado(marca(id), resultado);

    assert.equal((await pedido(id)).resultado, resultado);
    assert.deepEqual(await pedidosPendientes(HOY), [], `${resultado} dejó el pedido en juego`);
  }
});

test("la hora de entrega se guarda al cerrar, y no antes", async () => {
  const t = reloj.congelar("2026-08-20T18:45:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    assert.equal((await paradaDe(id)).horaResultado, null);

    await marcarResultado(marca(id), "entregado");
    assert.equal((await paradaDe(id)).horaResultado, "2026-08-20T18:45:00.000Z");
  } finally {
    t();
  }
});

test("mandar una parada al final no la cierra: solo cambia de lugar", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);

  await moverAlFinal({ fecha: HOY, pedidoId: a });

  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, [b, c, a]);
  assert.equal((await pedido(a)).resultado, "pendiente", "mover al final cerró la parada");
  assert.equal((await leerCola()).length, 0, "mover al final encoló un evento");
});

// ===========================================================================
// Doble toque
// ===========================================================================

test("dos toques seguidos con resultados DISTINTOS: manda el primero", async () => {
  // Pasa de verdad: el chofer toca "No entregado", se arrepiente y toca
  // "Pedido finalizado" antes de que la pantalla se actualice. El segundo no puede cambiar nada — para
  // eso está deshacer, que además borra el evento.
  const [id] = await cargar(1);
  await rutaCon([id]);

  const primero = await marcarResultado(marca(id), "no_entregado");
  const segundo = await marcarResultado(marca(id), "entregado");

  assert.ok(primero);
  assert.equal(segundo, null);
  assert.equal((await paradaDe(id)).resultado, "no_entregado", "el segundo toque cambió el resultado");

  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "omision");
});

test("diez toques en paralelo sobre la misma parada: un solo evento", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);

  const ids = await Promise.all(
    Array.from({ length: 10 }, () => marcarResultado(marca(id), "entregado")),
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
    marcarResultado(marca(a), "entregado"),
    marcarResultado(marca(b), "entregado"),
  ]);

  assert.equal(ids.filter(Boolean).length, 2);
  assert.equal((await leerCola()).length, 2);
});

test("marcar mientras se ubican direcciones no reabre lo ya cerrado", async () => {
  // fijarCoordenadas y marcarResultado escriben las dos el pedido entero. Sin la
  // fila del almacén, la última en guardar pisaba a la otra y se perdía el
  // "entregado" (el paquete reaparecía mañana) o las coordenadas.
  const [id] = await cargar(1);
  await rutaCon([id]);

  await Promise.all([
    almacen.fijarCoordenadas([{ id, lat: -18.5, lng: -70.3 }]),
    marcarResultado(marca(id), "no_entregado"),
  ]);

  const p = await pedido(id);
  assert.equal(p.resultado, "no_entregado", "la geocodificación reabrió un pedido tachado");
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
    await marcarResultado(marca(id), "entregado", MS_DESHACER);

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
    const eventoId = await marcarResultado(marca(id), "no_entregado", MS_DESHACER);

    reloj.avanzar("3s");
    assert.equal(await deshacerResultado({ fecha: HOY, pedidoId: id }, eventoId), true);

    assert.equal((await paradaDe(id)).resultado, "pendiente", "el pedido quedó tachado igual");
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
    const eventoId = await marcarResultado(marca(id), "entregado", MS_DESHACER);

    reloj.avanzar("9s");
    await enviarActividadPendiente();

    assert.equal(await deshacerResultado({ fecha: HOY, pedidoId: id }, eventoId), false);
    assert.equal((await paradaDe(id)).resultado, "entregado", "se reabrió una entrega ya enviada");
  } finally {
    t();
  }
});

test("deshacer la última parada reabre el día", async () => {
  // Sin esto, el servidor valoraría un día al que todavía le falta una entrega.
  const t = reloj.congelar("2026-08-20T12:00:00.000Z");
  try {
    const [id] = await cargar(1);
    await rutaCon([id]);
    const eventoId = await marcarResultado(marca(id), "entregado", MS_DESHACER);

    assert.equal(rutaTerminada(await leerRuta(HOY), await leerPedidos(HOY)), true);
    await cerrarDia(HOY);
    assert.ok((await leerRuta(HOY)).cierre);

    await deshacerResultado({ fecha: HOY, pedidoId: id }, eventoId);
    assert.equal((await leerRuta(HOY)).cierre, null, "el día quedó cerrado a medias");
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

  await marcarResultado(marca(a), "entregado");
  await marcarResultado(marca(b), "no_entregado");
  await marcarResultado(marca(c), "no_entregado");

  // El teléfono ya sabe todo: es lo que el chofer ve.
  assert.equal((await pedido(a)).resultado, "entregado");
  assert.equal((await pedido(b)).resultado, "no_entregado");
  assert.equal((await pedido(c)).resultado, "no_entregado");

  await assert.rejects(() => enviarActividadPendiente(), /sin red/);
  assert.equal((await leerCola()).length, 3, "se perdió trabajo del chofer");
});

test("al volver la señal llega todo, una sola vez", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);
  espia.responder = () => ({ error: { message: "sin red" } });

  await marcarResultado(marca(a), "entregado");
  await marcarResultado(marca(b), "no_entregado");
  await marcarResultado(marca(c), "no_entregado");
  await assert.rejects(() => enviarActividadPendiente());

  espia.reset();
  const r = await enviarActividadPendiente();
  assert.deepEqual(r, { enviados: 3, pendientes: 0 });

  const filas = espia.llamadas[0].filas;
  assert.deepEqual(filas.map((f) => f.tipo).sort(), ["entrega", "omision", "omision"]);
  assert.ok(filas.every((f) => !("motivo" in f)), "salió un motivo");

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
  await marcarResultado(marca(a), "entregado");
  await marcarResultado(marca(b), "no_entregado");

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

test("el día NO se cierra en el servidor mientras quede algo por enviar", async () => {
  // Cerrarla es lo que hace que el servidor cuente el día. Si llega antes que las
  // últimas entregas, el panel del jefe muestra una liquidación corta — y eso el
  // conductor lo lee como plata que le falta.
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarResultado(marca(id), "entregado");
  await cerrarDia(HOY);

  await sincronizarDiaTrabajo(CHOFER, HOY);
  const diasTrabajo = espia.llamadas.filter((l) => l.tabla === "encomienda_jornadas");
  assert.equal(diasTrabajo.length, 1);
  assert.equal(diasTrabajo[0].filas.cerrada_en != null, true);
  assert.deepEqual(diasTrabajo[0].opciones, { onConflict: "chofer_id,fecha" });
});

test("sin ruta generada no se abre ninguna día en el servidor", async () => {
  await sincronizarDiaTrabajo(CHOFER, HOY);
  assert.equal(espia.llamadas.length, 0);
});

// ===========================================================================
// Sin arrastre al día siguiente (spec 009)
// ===========================================================================

test("nada se arrastra: lo no entregado se tacha, no pasa a la ruta de mañana", async () => {
  const [a, b, c, d] = await cargar(4);
  await rutaCon([a, b, c, d]);

  await marcarResultado(marca(a), "entregado");
  await marcarResultado(marca(b), "no_entregado");
  await marcarResultado(marca(c), "no_entregado");
  await marcarResultado(marca(d), "no_entregado");

  assert.deepEqual(await pedidosPendientes(HOY), []);
  assert.deepEqual(await pedidosPendientes("2026-08-21"), [], "un pedido de hoy pasó a mañana");
});

test("regenerar la ruta conserva lo cerrado, en su orden", async () => {
  const [a, b, c] = await cargar(3);
  await rutaCon([a, b, c]);
  await marcarResultado(marca(a), "entregado");
  await marcarResultado(marca(b), "no_entregado");

  // Se rehace con OTRO orden y con un pedido nuevo.
  const [d] = [(await cargar(1))[0]];
  await rutaCon([c, d]);

  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, [a, b, c, d], "lo cerrado tiene que quedar primero y en su orden original");
  assert.equal((await pedido(a)).resultado, "entregado");
  assert.equal((await pedido(b)).resultado, "no_entregado");
  assert.equal((await pedido(c)).resultado, "pendiente");
});

test("regenerar conserva la llamada de un pedido que sigue pendiente", async () => {
  // Ya llamó: no tiene por qué volver a llamar solo porque rehizo la ruta.
  const [a, b] = await cargar(2);
  await rutaCon([a, b]);
  await marcarLlamada(marca(a), "no_contesto");

  await rutaCon([b, a]);

  const parada = await paradaDe(a);
  assert.equal(parada.llamada, "no_contesto");
  assert.ok(parada.horaLlamada);
});

test("regenerar REABRE el día: entraron paradas nuevas", async () => {
  const [a] = await cargar(1);
  await rutaCon([a]);
  await marcarResultado(marca(a), "entregado");
  await cerrarDia(HOY);
  assert.ok((await leerRuta(HOY)).cierre);

  const [b] = await cargar(1);
  await rutaCon([b]);
  assert.equal((await leerRuta(HOY)).cierre, null);
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
  await marcarResultado(marca(id), "entregado");

  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "entrega");
});

test("un no entregado también prueba el día trabajado", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarResultado(marca(id), "no_entregado");

  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "omision");
});

// ===========================================================================
// "Mañana" por WhatsApp: no entregado sin visita (specs 010 y 012)
// ===========================================================================

test("'Mañana' cierra el pedido como no entregado y lo cuenta, con la ruta en curso", async () => {
  const [a, b] = await cargar(2);
  await rutaCon([a, b]);

  assert.equal(await registrarDisponibilidad(a, { tipo: "manana" }, "wamid.M1", CHOFER), true);

  const p = await pedido(a);
  assert.equal(p.disponibilidad, "manana");
  assert.equal(p.resultado, "no_entregado");
  assert.ok(p.horaResultado);
  assert.deepEqual((await pedidosPendientes(HOY)).map((x) => x.id), [b]);

  await enviarActividadPendiente();
  const fila = espia.llamadas[0].filas[0];
  assert.equal(fila.tipo, "omision");
});

test("'Mañana' sin señal queda en la cola y sale después", async () => {
  const [id] = await cargar(1);
  espia.responder = () => ({ error: { message: "sin red" } });

  await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.M1", CHOFER);
  assert.equal((await pedido(id)).resultado, "no_entregado", "el cierre local no puede depender de la red");
  await assert.rejects(() => enviarActividadPendiente());
  assert.equal((await leerCola()).length, 1);

  espia.reset();
  assert.deepEqual(await enviarActividadPendiente(), { enviados: 1, pendientes: 0 });
});

test("'Mañana' sobre un pedido ya entregado no cambia nada ni encola", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarResultado(marca(id), "entregado");

  assert.equal(await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.M1", CHOFER), false);
  assert.equal((await pedido(id)).resultado, "entregado");
  assert.equal((await leerCola()).filter((e) => e.tipo === "omision").length, 0);
});

