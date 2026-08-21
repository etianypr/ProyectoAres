// Invariantes del dominio local que agregó la asistencia de ruta y entrega:
// disponibilidad del receptor, rechazo terminal y los cuatro resultados de
// entrega. Corre contra los módulos REALES (almacen.ts, config.ts,
// local/whatsapp.ts) sobre IndexedDB de verdad vía fake-indexeddb.
//
// Lo que se protege acá no es cosmético:
//
//  · Una respuesta de WhatsApp que se aplica dos veces, o que llega tarde y pisa
//    otra, deja al chofer llamando a quien ya contestó o dando por confirmado a
//    quien dijo que no.
//  · Un rechazo que no queda terminal vuelve a la ruta al día siguiente, y eso
//    es exactamente lo que la constitución prohibe (principio II, FR-012).
//  · Un resultado de entrega sin su motivo deja al jefe sin poder distinguir un
//    rechazo de un "no estaba en la casa".
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const {
  guardarPedido,
  leerPedidos,
  pedidosPendientes,
  contarPendientes,
  guardarRuta,
  leerRuta,
  leerCola,
  marcarEntrega,
  registrarDisponibilidad,
  registrarRechazo,
  registrarEnvioWhatsapp,
  registrarEstadoMensaje,
  registrarFalloWhatsapp,
  reiniciarDisponibilidad,
  rechazadosSinRegistrar,
  leerCoordinaciones,
  motivoDeEntrega,
  paradaReintentable,
} = almacen;

const config = await import("@/lib/encomiendas/config");
const {
  BLOQUES_HORARIOS,
  bloquePorId,
  minutosDesde,
  payloadBoton,
  leerPayloadBoton,
  disponibilidadDeRespuesta,
  esReintentable,
  disponibilidadCerrada,
} = config;

const wsp = await import("@/lib/encomiendas/local/whatsapp");
const {
  validarRespuesta,
  aRespuestaDisponibilidad,
  pideListaDeHorarios,
  aplicarRespuestas,
  pedidosSinAviso,
} = wsp;

const idb = await import("@/lib/encomiendas/local/idb");

const HOY = "2026-08-20";
const CHOFER = "11111111-1111-7111-8111-111111111111";

// La clave de cada store es distinta (id, fecha, pedidoId), así que se resuelve
// por store en vez de adivinar con "fila.id ?? fila.fecha" — que es lo que
// rompería en silencio al agregar el cuarto store.
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
}

const P = (n) => ({
  nombre: `Destinatario ${n}`,
  telefono: `+5691234000${n}`,
  direccion: `Calle ${n} 100, Arica`,
  lat: -18.47 - n / 1000,
  lng: -70.29 - n / 1000,
  notas: null,
});

async function cargar(cantidad) {
  const ids = [];
  for (let i = 1; i <= cantidad; i++) ids.push((await guardarPedido(P(i))).id);
  return ids;
}

/** Ruta del día con esos pedidos, en ese orden. */
async function rutaCon(ids) {
  return guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: ids,
    geometria: null,
    distanciaM: null,
    duracionS: null,
  });
}

const pedido = async (id) => (await leerPedidos()).find((p) => p.id === id);

test.beforeEach(limpiar);

// ---------------------------------------------------------------------------
// Los bloques horarios que promete el producto
// ---------------------------------------------------------------------------

test("son los seis bloques de dos horas de 08:00 a 20:00 (FR-009)", () => {
  assert.equal(BLOQUES_HORARIOS.length, 6);
  assert.deepEqual(
    BLOQUES_HORARIOS.map((b) => b.etiqueta),
    [
      "08:00 - 10:00",
      "10:00 - 12:00",
      "12:00 - 14:00",
      "14:00 - 16:00",
      "16:00 - 18:00",
      "18:00 - 20:00",
    ],
  );
  // Sin huecos ni solapes: el fin de cada uno es el inicio del siguiente.
  for (let i = 1; i < BLOQUES_HORARIOS.length; i++) {
    assert.equal(BLOQUES_HORARIOS[i].desde, BLOQUES_HORARIOS[i - 1].hasta);
  }
});

test("los ids de bloque son únicos: son la clave con la que vuelve la respuesta", () => {
  const ids = BLOQUES_HORARIOS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("un bloque que ya no existe no revienta el ordenamiento, devuelve null", () => {
  assert.equal(minutosDesde("18-20"), 18 * 60);
  assert.equal(minutosDesde("03-05"), null, "un bloque retirado no puede dar un número");
  assert.equal(minutosDesde(null), null);
  assert.equal(bloquePorId("no-existe"), null);
});

// ---------------------------------------------------------------------------
// El payload del botón: el contrato con Meta
// ---------------------------------------------------------------------------

test("el payload del botón va y vuelve sin perder nada", () => {
  for (const accion of ["CONFIRMAR", "RECHAZAR", "HORARIO"]) {
    const p = payloadBoton(accion, "corr-abc123");
    assert.deepEqual(leerPayloadBoton(p), {
      accion,
      correlationId: "corr-abc123",
      bloqueHorarioId: null,
    });
  }

  const conBloque = payloadBoton("HORARIO", "corr-xyz", "18-20");
  assert.equal(conBloque, "HORARIO_18-20:corr-xyz");
  assert.deepEqual(leerPayloadBoton(conBloque), {
    accion: "HORARIO",
    correlationId: "corr-xyz",
    bloqueHorarioId: "18-20",
  });
});

test("el payload cabe en los 128 caracteres que permite Meta", () => {
  // El prefijo más largo posible con los bloques de hoy.
  const masLargo = payloadBoton("HORARIO", "a".repeat(36), "18-20");
  assert.ok(masLargo.length <= 128, `el payload mide ${masLargo.length}`);
});

test("un payload que no se reconoce devuelve null en vez de lanzar", () => {
  // Texto libre del receptor, evento de otro tipo, plantilla vieja: nada de esto
  // puede tumbar el webhook, porque un webhook que falla hace que Meta reintente
  // el mismo evento para siempre.
  for (const basura of [
    undefined,
    null,
    42,
    "",
    ":",
    ":corr-1",
    "CONFIRMAR",
    "CONFIRMAR:",
    "CONFIRMAR:   ",
    "OTRACOSA:corr-1",
    "confirmar:corr-1", // minúsculas: no es el contrato
    { accion: "CONFIRMAR" },
  ]) {
    assert.equal(leerPayloadBoton(basura), null, `no rechazó ${JSON.stringify(basura)}`);
  }
});

test("un bloque retirado se degrada a 'quiere indicar horario', no se inventa", () => {
  // El jefe desactivó el bloque después de mandar el aviso. Guardar ese id
  // dejaría al pedido ordenado por una ventana que no existe en ninguna parte.
  const leido = leerPayloadBoton("HORARIO_03-05:corr-1");
  assert.deepEqual(leido, { accion: "HORARIO", correlationId: "corr-1", bloqueHorarioId: null });
  assert.equal(disponibilidadDeRespuesta(leido), "pendiente_respuesta");
});

test("tocar 'indicar horario' NO confirma nada todavía", () => {
  // Es el paso intermedio del flujo de dos mensajes (Decisión 8): abre la
  // ventana de 24 h para poder mandar la lista, pero el receptor no eligió nada.
  assert.equal(
    disponibilidadDeRespuesta({ accion: "HORARIO", correlationId: "c", bloqueHorarioId: null }),
    "pendiente_respuesta",
  );
  assert.equal(
    disponibilidadDeRespuesta({ accion: "HORARIO", correlationId: "c", bloqueHorarioId: "10-12" }),
    "horario_indicado",
  );
  assert.equal(
    disponibilidadDeRespuesta({ accion: "CONFIRMAR", correlationId: "c", bloqueHorarioId: null }),
    "confirmado",
  );
  assert.equal(
    disponibilidadDeRespuesta({ accion: "RECHAZAR", correlationId: "c", bloqueHorarioId: null }),
    "rechazado",
  );
});

// ---------------------------------------------------------------------------
// Un pedido nuevo empieza sin respuesta
// ---------------------------------------------------------------------------

test("un pedido nuevo nace pendiente de respuesta y sin bloque", async () => {
  const [id] = await cargar(1);
  const p = await pedido(id);
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  assert.equal(p.bloqueHorarioId, null);
  assert.equal(p.estado, "pendiente");
});

test("un pedido guardado por la versión ANTERIOR se lee sin undefined", async () => {
  // Es el caso real de un teléfono que ya venía usando la app: la fila está en
  // IndexedDB tal como se escribió, sin los campos nuevos. Se escribe a mano
  // porque es justamente lo que guardarPedido ya no produce.
  const viejo = {
    id: "00000000-0000-7000-8000-00000000dead",
    nombre: "De la versión 1",
    telefono: "+56912340009",
    direccion: "Calle Vieja 1",
    lat: -18.47,
    lng: -70.29,
    notas: null,
    estado: "pendiente",
    cargadoEn: "2026-08-01T10:00:00.000Z",
  };
  await idb.escribir([idb.STORES.pedidos], ({ guardar }) =>
    guardar(idb.STORES.pedidos, viejo),
  );

  const p = await pedido(viejo.id);
  assert.equal(p.disponibilidad, "pendiente_respuesta", "un pedido v1 quedó con disponibilidad undefined");
  assert.equal(p.bloqueHorarioId, null);
});

test("una ruta guardada por la versión ANTERIOR se lee sin undefined", async () => {
  const vieja = {
    fecha: HOY,
    paradas: [],
    geometria: null,
    distanciaM: null,
    duracionS: null,
    generadaEn: "2026-08-01T10:00:00.000Z",
    cerradaEn: null,
  };
  await idb.escribir([idb.STORES.rutas], ({ guardar }) => guardar(idb.STORES.rutas, vieja));

  const r = await leerRuta(HOY);
  assert.deepEqual(r.advertencias, []);
  assert.equal(r.propuestasComparadas, 1);
  assert.equal(r.versionDisponibilidad, null);
});

// ---------------------------------------------------------------------------
// Disponibilidad: las cuatro respuestas
// ---------------------------------------------------------------------------

test("confirmar deja el pedido confirmado y visible como tal", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"), true);
  assert.equal((await pedido(id)).disponibilidad, "confirmado");
});

test("elegir un bloque lo asocia al pedido", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "18-20" }, "wamid.R1");
  const p = await pedido(id);
  assert.equal(p.disponibilidad, "horario_indicado");
  assert.equal(p.bloqueHorarioId, "18-20");
});

test("cambiar de respuesta LIMPIA el bloque anterior", async () => {
  // Si no se limpiara, la ruta seguiría ordenando por una ventana horaria que el
  // receptor ya descartó.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "08-10" }, "wamid.R1");
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R2");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "confirmado");
  assert.equal(p.bloqueHorarioId, null, "quedó un bloque horario de una respuesta anterior");
});

test("una respuesta posterior reemplaza la anterior", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1");
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "12-14" }, "wamid.R2");
  assert.equal((await pedido(id)).disponibilidad, "horario_indicado");
});

// ---------------------------------------------------------------------------
// Idempotencia: la misma respuesta puede llegar dos veces
// ---------------------------------------------------------------------------

test("la MISMA respuesta aplicada dos veces cambia el pedido una sola vez", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"), true);
  assert.equal(
    await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"),
    false,
    "la segunda aplicación del mismo mensaje se contó como un cambio",
  );

  const [c] = await leerCoordinaciones();
  assert.deepEqual(c.respuestasAplicadas, ["wamid.R1"], "el id del mensaje se anotó dos veces");
});

test("tres aplicaciones EN PARALELO del mismo mensaje: solo una entra", async () => {
  // Es el caso real: la pantalla sincroniza, vuelve la app del fondo y el
  // reintento periódico dispara, los tres bajan el mismo lote. Sin la fila del
  // almacén, los tres leerían "no aplicada" y los tres pasarían.
  const [id] = await cargar(1);
  const r = await Promise.all([
    registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"),
    registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"),
    registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"),
  ]);
  assert.equal(r.filter(Boolean).length, 1, `entraron ${r.filter(Boolean).length} veces`);

  const [c] = await leerCoordinaciones();
  assert.deepEqual(c.respuestasAplicadas, ["wamid.R1"]);
});

test("una respuesta de origen LOCAL no necesita id de mensaje", async () => {
  // La marca de "no respondió" la pone el propio teléfono al aproximarse: no
  // viene de afuera, así que no hay nada que deduplicar.
  const [id] = await cargar(1);
  assert.equal(
    await registrarDisponibilidad(id, { tipo: "disponibilidad_sin_respuesta" }),
    true,
  );
  assert.equal((await pedido(id)).disponibilidad, "disponibilidad_sin_respuesta");
});

test("una respuesta para un pedido borrado se descarta sin lanzar", async () => {
  assert.equal(
    await registrarDisponibilidad("00000000-0000-7000-8000-000000000404", { tipo: "confirmado" }, "wamid.R9"),
    false,
  );
});

// ---------------------------------------------------------------------------
// Regla 2: un rechazo no se reabre solo
// ---------------------------------------------------------------------------

test("un 'sí' que llega DESPUÉS de un rechazo no lo reabre", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");
  assert.equal(
    await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R2"),
    false,
    "una respuesta posterior reabrió un rechazo",
  );
  assert.equal((await pedido(id)).disponibilidad, "rechazado");
});

test("un bloque horario elegido DESPUÉS de un rechazo tampoco lo reabre", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "10-12" }, "wamid.R2");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "rechazado");
  assert.equal(p.bloqueHorarioId, null);
});

test("una respuesta frenada por una regla se anota igual, para no bajarla eternamente", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R2");

  const [c] = await leerCoordinaciones();
  assert.deepEqual(
    c.respuestasAplicadas.sort(),
    ["wamid.R1", "wamid.R2"],
    "la respuesta descartada no quedó anotada y volvería a bajar para siempre",
  );
});

test("repetir el MISMO rechazo es idempotente", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1"), true);
  assert.equal(await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1"), false);
});

// ---------------------------------------------------------------------------
// Regla 3: "no respondió" no pisa una respuesta de verdad
// ---------------------------------------------------------------------------

test("marcar 'no respondió' NO pisa un 'sí' que ya había llegado", async () => {
  // Al revés, el chofer llamaría a alguien que ya contestó — y perdería el
  // tiempo que esta app existe para ahorrar.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1");
  assert.equal(await registrarDisponibilidad(id, { tipo: "disponibilidad_sin_respuesta" }), false);
  assert.equal((await pedido(id)).disponibilidad, "confirmado");
});

test("'no respondió' tampoco pisa un bloque horario ya elegido", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "16-18" }, "wamid.R1");
  await registrarDisponibilidad(id, { tipo: "disponibilidad_sin_respuesta" });

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "horario_indicado");
  assert.equal(p.bloqueHorarioId, "16-18");
});

test("'no respondió' SÍ se aplica cuando de verdad no había respuesta", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "disponibilidad_sin_respuesta" }), true);
  assert.equal((await pedido(id)).disponibilidad, "disponibilidad_sin_respuesta");
});

// ---------------------------------------------------------------------------
// Los cuatro resultados de entrega y su motivo
// ---------------------------------------------------------------------------

test("cada resultado viaja con el motivo que el jefe necesita", () => {
  assert.equal(motivoDeEntrega("entregado"), null);
  assert.equal(motivoDeEntrega("persona_no_encontrada"), "persona_no_encontrada");
  assert.equal(motivoDeEntrega("entrega_sin_respuesta"), "sin_respuesta");
  assert.equal(motivoDeEntrega("rechazo"), "rechazo");
  // El heredado: nadie preguntó el motivo en su momento y no se inventa.
  assert.equal(motivoDeEntrega("omitido"), null);
  assert.equal(motivoDeEntrega("pendiente"), null);
});

test("solo el rechazo no es reintentable (FR-012)", () => {
  assert.equal(paradaReintentable("persona_no_encontrada"), true);
  assert.equal(paradaReintentable("entrega_sin_respuesta"), true);
  assert.equal(paradaReintentable("rechazo"), false);
  assert.equal(paradaReintentable("entregado"), false, "una entrega no se reintenta");
  assert.equal(paradaReintentable("pendiente"), false);
  assert.equal(paradaReintentable("omitido"), true, "la omisión heredada siempre fue reintentable");

  assert.equal(esReintentable("rechazo"), false);
  assert.equal(esReintentable("persona_no_encontrada"), true);
  assert.equal(esReintentable("sin_respuesta"), true);
});

test("la disponibilidad cerrada es la que ya no espera nada", () => {
  assert.equal(disponibilidadCerrada("rechazado"), true);
  assert.equal(disponibilidadCerrada("disponibilidad_sin_respuesta"), true);
  assert.equal(disponibilidadCerrada("pendiente_respuesta"), false);
  assert.equal(disponibilidadCerrada("confirmado"), false);
  assert.equal(disponibilidadCerrada("horario_indicado"), false);
});

test("entregar cierra el pedido y encola una entrega SIN motivo", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");

  assert.equal((await pedido(id)).estado, "entregado");
  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "entrega");
  assert.equal(cola[0].motivo, undefined, "una entrega salió con motivo");
});

test("persona no encontrada deja el pedido PENDIENTE y encola su motivo", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "persona_no_encontrada");

  assert.equal((await pedido(id)).estado, "pendiente", "se perdió un pedido reintentable");
  const [ev] = await leerCola();
  assert.equal(ev.tipo, "omision");
  assert.equal(ev.motivo, "persona_no_encontrada");
  assert.equal((await leerRuta(HOY)).paradas[0].entrega, "persona_no_encontrada");
});

test("sin respuesta deja el pedido PENDIENTE y encola su motivo", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entrega_sin_respuesta");

  assert.equal((await pedido(id)).estado, "pendiente");
  const [ev] = await leerCola();
  assert.equal(ev.tipo, "omision");
  assert.equal(ev.motivo, "sin_respuesta");
});

test("el rechazo CIERRA el pedido: no vuelve a una ruta futura (FR-012)", async () => {
  const [id, otro] = await cargar(2);
  await rutaCon([id, otro]);
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "rechazo");

  assert.equal((await pedido(id)).estado, "rechazado");

  const pendientes = await pedidosPendientes();
  assert.deepEqual(
    pendientes.map((p) => p.id),
    [otro],
    "un pedido rechazado sigue apareciendo como pendiente y volvería mañana",
  );
  // Y el contador por índice tiene que estar de acuerdo con la lista.
  assert.equal(await contarPendientes(), 1);

  const [ev] = await leerCola();
  assert.equal(ev.tipo, "omision");
  assert.equal(ev.motivo, "rechazo");
});

test("el heredado 'omitido' sigue funcionando y no inventa un motivo", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "omitido");

  const [ev] = await leerCola();
  assert.equal(ev.tipo, "omision");
  assert.equal(ev.motivo, undefined);
  assert.equal((await pedido(id)).estado, "pendiente");
});

test("marcar dos veces la misma parada no duplica el evento, con cualquier resultado", async () => {
  const [a, b, c, d] = await cargar(4);
  await rutaCon([a, b, c, d]);

  const casos = [
    [a, "entregado"],
    [b, "persona_no_encontrada"],
    [c, "entrega_sin_respuesta"],
    [d, "rechazo"],
  ];
  for (const [id, resultado] of casos) {
    const primero = await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, resultado);
    const segundo = await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, resultado);
    assert.ok(primero, `${resultado}: el primer toque no devolvió evento`);
    assert.equal(segundo, null, `${resultado}: el segundo toque volvió a cerrar la parada`);
  }
  assert.equal((await leerCola()).length, 4, "se encolaron eventos de más");
});

test("cuatro toques EN PARALELO sobre la misma parada encolan un solo evento", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  const marca = { fecha: HOY, pedidoId: id, choferId: CHOFER };

  const ids = await Promise.all([
    marcarEntrega(marca, "rechazo"),
    marcarEntrega(marca, "rechazo"),
    marcarEntrega(marca, "rechazo"),
    marcarEntrega(marca, "rechazo"),
  ]);
  assert.equal(ids.filter(Boolean).length, 1);
  assert.equal((await leerCola()).length, 1);
});

// ---------------------------------------------------------------------------
// Rechazo llegado por WhatsApp, sin parada en la ruta
// ---------------------------------------------------------------------------

test("un rechazo por WhatsApp no cierra el pedido solo: lo cierra quien lo registra", async () => {
  // El resultado del reparto es un hecho de terreno. Que el servidor lo cierre
  // por su cuenta rompería el principio II: los conteos del jefe salen de
  // resultados registrados, no de lo que dedujo una integración.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "rechazado");
  assert.equal(p.estado, "pendiente", "la respuesta de WhatsApp cerró el pedido por su cuenta");
  assert.equal((await leerCola()).length, 0, "la respuesta de WhatsApp encoló un evento de entrega");
});

test("registrarRechazo cierra el pedido y lo cuenta, sin necesitar una ruta", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");

  const eventoId = await registrarRechazo({ fecha: HOY, pedidoId: id, choferId: CHOFER });
  assert.ok(eventoId);
  assert.equal((await pedido(id)).estado, "rechazado");

  const [ev] = await leerCola();
  assert.equal(ev.id, eventoId);
  assert.equal(ev.tipo, "omision");
  assert.equal(ev.motivo, "rechazo");
});

test("registrarRechazo es idempotente", async () => {
  const [id] = await cargar(1);
  assert.ok(await registrarRechazo({ fecha: HOY, pedidoId: id, choferId: CHOFER }));
  assert.equal(await registrarRechazo({ fecha: HOY, pedidoId: id, choferId: CHOFER }), null);
  assert.equal((await leerCola()).length, 1);
});

test("registrarRechazo en paralelo encola un solo evento", async () => {
  const [id] = await cargar(1);
  const marca = { fecha: HOY, pedidoId: id, choferId: CHOFER };
  const ids = await Promise.all([
    registrarRechazo(marca),
    registrarRechazo(marca),
    registrarRechazo(marca),
  ]);
  assert.equal(ids.filter(Boolean).length, 1);
  assert.equal((await leerCola()).length, 1);
});

test("los rechazados sin registrar son los que el chofer tiene que cerrar", async () => {
  const [a, b, c] = await cargar(3);
  await registrarDisponibilidad(a, { tipo: "rechazado" }, "wamid.RA");
  await registrarDisponibilidad(b, { tipo: "confirmado" }, "wamid.RB");
  await registrarDisponibilidad(c, { tipo: "rechazado" }, "wamid.RC");

  assert.deepEqual((await rechazadosSinRegistrar()).map((p) => p.id).sort(), [a, c].sort());

  await registrarRechazo({ fecha: HOY, pedidoId: a, choferId: CHOFER });
  assert.deepEqual((await rechazadosSinRegistrar()).map((p) => p.id), [c]);
});

// ---------------------------------------------------------------------------
// Corregir un teléfono mal escrito
// ---------------------------------------------------------------------------

test("editar un pedido conserva lo que el receptor ya contestó", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "14-16" }, "wamid.R1");

  await guardarPedido({ ...P(1), notas: "portón azul" }, id);

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "horario_indicado");
  assert.equal(p.bloqueHorarioId, "14-16");
  assert.equal(p.notas, "portón azul");
});

test("reiniciar la disponibilidad reabre un rechazo: el número estaba mal", async () => {
  // Es la única puerta que reabre un rechazo, y existe porque esa respuesta era
  // de otra persona: no puede quedar pegada al pedido.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.R1");
  await registrarRechazo({ fecha: HOY, pedidoId: id, choferId: CHOFER });
  assert.equal((await pedido(id)).estado, "rechazado");

  await reiniciarDisponibilidad(id);

  const p = await pedido(id);
  assert.equal(p.estado, "pendiente", "el pedido no volvió a la ruta");
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  assert.equal(p.bloqueHorarioId, null);
  assert.equal((await leerCoordinaciones()).length, 0, "quedó la coordinación del número viejo");

  // Y ahora el mismo mensaje puede volver a aplicarse: es otro destinatario.
  assert.equal(await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1"), true);
});

test("corregir un teléfono mal escrito descarta la respuesta del anterior", async () => {
  // Es el flujo completo del caso que motivó reiniciarDisponibilidad, tal como lo
  // dispara el formulario: el chofer se da cuenta de que el número estaba mal, lo
  // corrige, y esa respuesta —que era de un desconocido— no puede quedar pegada
  // al pedido ni dejarlo cerrado.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "rechazado" }, "wamid.DELOTRO");
  await registrarRechazo({ fecha: HOY, pedidoId: id, choferId: CHOFER });
  assert.equal((await pedido(id)).estado, "rechazado");

  // Lo que hace el formulario al detectar que el número cambió.
  await reiniciarDisponibilidad(id);
  await guardarPedido({ ...P(1), telefono: "+56999999999" }, id);

  const p = await pedido(id);
  assert.equal(p.telefono, "+56999999999");
  assert.equal(p.estado, "pendiente", "el pedido quedó cerrado por una respuesta ajena");
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  assert.deepEqual((await pedidosPendientes()).map((x) => x.id), [id]);
});

test("corregir SOLO la dirección conserva lo que el receptor contestó", async () => {
  // La contracara: no hay que descartar una respuesta válida porque el chofer
  // arregló una calle mal escrita.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1");

  await guardarPedido({ ...P(1), direccion: "Calle Corregida 200, Arica" }, id);

  const p = await pedido(id);
  assert.equal(p.direccion, "Calle Corregida 200, Arica");
  assert.equal(p.disponibilidad, "confirmado");
});

test("reiniciar la disponibilidad NO reabre una entrega ya hecha", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarEntrega({ fecha: HOY, pedidoId: id, choferId: CHOFER }, "entregado");

  await reiniciarDisponibilidad(id);
  assert.equal((await pedido(id)).estado, "entregado", "se reabrió un pedido ya entregado y contado");
});

// ---------------------------------------------------------------------------
// Estado del MENSAJE — que no se confunda con el de la entrega
// ---------------------------------------------------------------------------

test("un mensaje fallido deja el pedido pendiente de contacto, no rechazado", async () => {
  // Es una regla explícita del contrato: 'failed' describe el mensaje, no lo que
  // el receptor quiere. Marcarlo como rechazo perdería una entrega posible.
  const [id] = await cargar(1);
  await registrarEnvioWhatsapp({ pedidoId: id, correlationId: "corr-1", mensajeId: "wamid.T1" });
  await registrarEstadoMensaje(id, "fallido", "Receiver is incapable of receiving this message");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  const [c] = await leerCoordinaciones();
  assert.equal(c.estado, "fallido");
  assert.match(c.ultimoError, /incapable/);
});

test("un 'enviado' que llega tarde no hace retroceder al estado", async () => {
  // Meta no garantiza el orden de los webhooks.
  const [id] = await cargar(1);
  await registrarEnvioWhatsapp({ pedidoId: id, correlationId: "corr-1", mensajeId: "wamid.T1" });
  await registrarEstadoMensaje(id, "leido");
  await registrarEstadoMensaje(id, "enviado");

  assert.equal((await leerCoordinaciones())[0].estado, "leido");
});

test("el envío guarda la correlación y cuenta el intento", async () => {
  const [id] = await cargar(1);
  await registrarEnvioWhatsapp({ pedidoId: id, correlationId: "corr-1", mensajeId: "wamid.T1" });

  const [c] = await leerCoordinaciones();
  assert.equal(c.pedidoId, id);
  assert.equal(c.correlationId, "corr-1");
  assert.equal(c.mensajeId, "wamid.T1");
  assert.equal(c.estado, "enviado");
  assert.equal(c.intentos, 1);
  assert.ok(c.enviadoEn);
});

// ---------------------------------------------------------------------------
// A quién hay que avisarle
// ---------------------------------------------------------------------------

test("un pedido con aviso ya mandado no recibe otro", async () => {
  const [a, b] = await cargar(2);
  await registrarEnvioWhatsapp({ pedidoId: a, correlationId: "corr-a", mensajeId: "wamid.TA" });

  assert.deepEqual(await pedidosSinAviso([a, b]), [b], "se iba a avisar dos veces al mismo receptor");
});

test("un aviso fallido se reintenta, pero no para siempre", async () => {
  const [id] = await cargar(1);

  for (let i = 1; i <= wsp.MAX_INTENTOS_AVISO; i++) {
    assert.deepEqual(await pedidosSinAviso([id]), [id], `intento ${i}: dejó de reintentar antes de tiempo`);
    await registrarFalloWhatsapp(id, "sin señal");
  }
  assert.deepEqual(await pedidosSinAviso([id]), [], "siguió insistiendo con un número que falla siempre");

  const [c] = await leerCoordinaciones();
  assert.equal(c.intentos, wsp.MAX_INTENTOS_AVISO);
  assert.equal(c.estado, "fallido");
});

// ---------------------------------------------------------------------------
// Validación de lo que baja del servidor
// ---------------------------------------------------------------------------

test("una respuesta bien formada se valida y se traduce", () => {
  const r = validarRespuesta({
    pedidoId: "abc",
    mensajeId: "wamid.R1",
    accion: "CONFIRMAR",
    bloqueHorarioId: null,
    recibidoEn: "2026-08-20T12:00:00.000Z",
  });
  assert.deepEqual(r, {
    pedidoId: "abc",
    mensajeId: "wamid.R1",
    accion: "CONFIRMAR",
    bloqueHorarioId: null,
    recibidoEn: "2026-08-20T12:00:00.000Z",
  });
  assert.deepEqual(aRespuestaDisponibilidad(r), { tipo: "confirmado" });
  assert.equal(pideListaDeHorarios(r), false);
});

test("lo que no se entiende no entra a IndexedDB", () => {
  for (const basura of [
    null,
    undefined,
    "texto",
    42,
    {},
    { pedidoId: "abc" },
    { pedidoId: "abc", mensajeId: "w1" },
    { pedidoId: "abc", mensajeId: "w1", accion: "OTRA" },
    { pedidoId: "", mensajeId: "w1", accion: "CONFIRMAR" },
    { pedidoId: "abc", mensajeId: "  ", accion: "CONFIRMAR" },
  ]) {
    assert.equal(validarRespuesta(basura), null, `no rechazó ${JSON.stringify(basura)}`);
  }
});

test("un bloque desconocido que baja del servidor se descarta, no se guarda", () => {
  const r = validarRespuesta({
    pedidoId: "abc",
    mensajeId: "wamid.R1",
    accion: "HORARIO",
    bloqueHorarioId: "03-05",
    recibidoEn: "2026-08-20T12:00:00.000Z",
  });
  assert.equal(r.bloqueHorarioId, null);
  // Y sin bloque, "HORARIO" no es una disponibilidad: hay que mandarle la lista.
  assert.equal(aRespuestaDisponibilidad(r), null);
  assert.equal(pideListaDeHorarios(r), true);
});

test("una fecha inválida no propaga NaN al pedido", () => {
  const r = validarRespuesta({
    pedidoId: "abc",
    mensajeId: "wamid.R1",
    accion: "RECHAZAR",
    recibidoEn: "no es una fecha",
  });
  assert.ok(!Number.isNaN(Date.parse(r.recibidoEn)));
});

// ---------------------------------------------------------------------------
// Aplicar un lote entero
// ---------------------------------------------------------------------------

test("un lote mixto se aplica, y solo se confirma lo que quedó resuelto", async () => {
  const [a, b, c] = await cargar(3);

  const lote = [
    { pedidoId: a, mensajeId: "wamid.RA", accion: "CONFIRMAR", recibidoEn: "2026-08-20T12:00:00.000Z" },
    { pedidoId: b, mensajeId: "wamid.RB", accion: "HORARIO", bloqueHorarioId: "18-20", recibidoEn: "2026-08-20T12:01:00.000Z" },
    { pedidoId: c, mensajeId: "wamid.RC", accion: "HORARIO", bloqueHorarioId: null, recibidoEn: "2026-08-20T12:02:00.000Z" },
    // Basura en el medio: no puede frenar las demás ni confirmarse.
    { pedidoId: "", mensajeId: "wamid.RX", accion: "CONFIRMAR" },
  ];

  const r = await aplicarRespuestas(lote);

  assert.equal(r.aplicadas, 2, "no se aplicaron las dos respuestas con disponibilidad");
  assert.equal(r.descartadas, 1, "el 'quiere indicar horario' debía quedar atendido sin cambiar el pedido");
  assert.deepEqual(r.confirmar.sort(), ["wamid.RA", "wamid.RB", "wamid.RC"]);
  assert.ok(!r.confirmar.includes("wamid.RX"), "se confirmó una fila que no se entendió");
  assert.deepEqual(r.pedirHorarios, [c]);

  assert.equal((await pedido(a)).disponibilidad, "confirmado");
  assert.equal((await pedido(b)).bloqueHorarioId, "18-20");
  assert.equal((await pedido(c)).disponibilidad, "pendiente_respuesta");
});

test("volver a aplicar el mismo lote no cambia nada y sigue confirmándose", async () => {
  const [id] = await cargar(1);
  const lote = [
    { pedidoId: id, mensajeId: "wamid.R1", accion: "CONFIRMAR", recibidoEn: "2026-08-20T12:00:00.000Z" },
  ];

  const primera = await aplicarRespuestas(lote);
  const segunda = await aplicarRespuestas(lote);

  assert.equal(primera.aplicadas, 1);
  assert.equal(segunda.aplicadas, 0);
  assert.equal(segunda.descartadas, 1);
  // Se sigue confirmando: si no, el servidor la mandaría en cada consulta.
  assert.deepEqual(segunda.confirmar, ["wamid.R1"]);
});

test("un lote vacío no hace nada", async () => {
  assert.deepEqual(await aplicarRespuestas([]), {
    aplicadas: 0,
    descartadas: 0,
    confirmar: [],
    pedirHorarios: [],
  });
});

// ---------------------------------------------------------------------------
// La migración 0003 cumple lo que el producto promete
// ---------------------------------------------------------------------------
//
// Esto lee el SQL como texto, y sí, es una prueba rara. Existe porque la
// verificación de verdad —pruebas/base.mjs y pruebas/esquema.mjs— necesita
// credenciales de Supabase, así que no corre en `npm test` ni en CI. Y lo que
// está en juego no es un detalle de esquema: es la única excepción que esta
// feature pidió al principio de no custodiar datos de destinatarios.
//
// Sin esto, alguien puede agregarle una columna `telefono` a la tabla de
// correlaciones y que ni el typecheck, ni el lint, ni el build, ni las pruebas
// digan nada; se enteraría el día de la auditoría. Estas comprobaciones son
// groseras a propósito: no validan SQL, validan que las promesas del documento
// principal sigan escritas en la migración.

const sqlMigracion = await import("node:fs").then((fs) =>
  fs.readFileSync("supabase/migrations/0003_asistencia_ruta.sql", "utf8"),
);

test("la correlación de WhatsApp no declara ninguna columna de datos personales", () => {
  // Se mira solo el create table, no los comentarios de cabecera: ahí las
  // palabras aparecen justamente para explicar que NO se guardan.
  const desde = sqlMigracion.indexOf("create table if not exists encomienda_whatsapp_correlaciones");
  assert.ok(desde > 0, "no encontré el create table de las correlaciones");
  const cuerpo = sqlMigracion
    .slice(desde, sqlMigracion.indexOf(");", desde))
    // Fuera los comentarios de línea: explican el diseño y nombran a propósito
    // lo que la tabla no guarda.
    .replace(/--.*$/gm, "");

  for (const prohibida of [
    "telefono",
    "phone",
    "nombre",
    "direccion",
    "address",
    "conversacion",
    "cuerpo",
    " lat ",
    " lng ",
  ]) {
    assert.ok(
      !cuerpo.includes(prohibida),
      `la tabla de correlaciones declara "${prohibida}": eso la convierte en un registro de destinatarios`,
    );
  }
});

test("las tablas de pedidos retiradas siguen sin volver en la 0003", () => {
  // La 0027 del sistema anterior las retiró a propósito (Ley 21.719). Una
  // migración que las recree deshace esa decisión sin discutirla.
  for (const tabla of ["encomienda_pedidos", "encomienda_rutas", "encomienda_paradas"]) {
    assert.ok(
      !new RegExp(`create table[^;]*${tabla}`, "i").test(sqlMigracion),
      `la 0003 recrea ${tabla}: los datos del receptor volverían a la base`,
    );
  }
});

test("la correlación tiene RLS encendida y ninguna policy para el panel", () => {
  assert.match(
    sqlMigracion,
    /alter table encomienda_whatsapp_correlaciones enable row level security/,
    "la tabla quedaría legible con la anon key",
  );
  // El jefe no tiene pantalla que la necesite; darle acceso sería más de lo
  // estrictamente necesario (principio V).
  assert.ok(
    !/create policy \S+ on encomienda_whatsapp_correlaciones[\s\S]*?admin/i.test(sqlMigracion),
    "se le dio acceso al panel a una tabla que ninguna pantalla del jefe usa",
  );
});

test("cada policy de la correlación exige que sea del propio conductor", () => {
  const policies = sqlMigracion.match(
    /create policy[\s\S]*?on encomienda_whatsapp_correlaciones[\s\S]*?;/g,
  );
  assert.ok(policies?.length >= 4, `esperaba al menos 4 policies, encontré ${policies?.length ?? 0}`);
  for (const policy of policies) {
    assert.match(
      policy,
      /choferes where user_id = \(select auth\.uid\(\)\)/,
      `una policy no se limita al propio conductor:\n${policy.slice(0, 120)}`,
    );
  }
});

test("la retención está escrita en la migración: cierre de jornada y tope de 72 horas", () => {
  // Las dos mitades de lo que promete el documento principal.
  assert.match(
    sqlMigracion,
    /trg_encomienda_jornada_borrar_correlaciones/,
    "falta el borrado al cerrar la jornada",
  );
  assert.match(sqlMigracion, /interval '72 hours'/, "falta el tope de 72 horas");
  assert.match(
    sqlMigracion,
    /cron\.schedule\(\s*'encomienda-limpiar-correlaciones'/,
    "el barrido no queda programado, así que el tope no se aplicaría solo",
  );
});

test("el motivo de no entrega está restringido a los tres valores y solo en omisiones", () => {
  assert.match(sqlMigracion, /add column if not exists motivo text/);
  assert.match(
    sqlMigracion,
    /tipo = 'omision' and motivo in \('persona_no_encontrada', 'sin_respuesta', 'rechazo'\)/,
    "el motivo podría escribirse en una entrega o con un valor inventado",
  );
});

test("la 0003 no toca el cálculo del pago", () => {
  // El pago se cuenta por `tipo`, y las cifras de un día ya cerrado son
  // definitivas. Una migración que redefina esas funciones cambiaría
  // liquidaciones ya pagadas.
  for (const intocable of [
    "encomienda_congelar_dia",
    "encomienda_valorar_dia",
    "encomienda_pagos",
    "encomienda_reglas_pago",
  ]) {
    assert.ok(
      !new RegExp(`(create or replace function|drop table|alter table)[^;]*${intocable}`, "i").test(
        sqlMigracion,
      ),
      `la 0003 redefine ${intocable}: puede mover plata ya liquidada`,
    );
  }
});
