// Invariantes del dominio local que agregó la asistencia de ruta y resultado:
// disponibilidad del receptor y el resultado de la visita (entregado o no). Corre contra los módulos REALES (almacen/, config.ts,
// local/sincronizar-whatsapp.ts) sobre IndexedDB de verdad vía fake-indexeddb.
//
// Lo que se protege acá no es cosmético:
//
//  · Una respuesta de WhatsApp que se aplica dos veces, o que llega tarde y pisa
//    otra, deja al conductor llamando a quien ya contestó o dando por confirmado a
//    quien dijo que no.
//  · Un pedido cerrado que vuelve a la ruta del día se visita dos veces.
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
  leerCola,
  marcarResultado,
  registrarDisponibilidad,
  registrarAvisoEnviado,
  registrarAvisoFallido,
  reiniciarDisponibilidad,
} = almacen;

const config = await import("@/lib/encomiendas/config");
const {
  BLOQUES_HORARIOS,
  bloquePorId,
  minutosDesde,
  payloadBoton,
  leerPayloadBoton,
} = config;

const {
  respuestaDeAccion,
} = await import("@/lib/encomiendas/estados");

// Disponibilidad que deja un botón: "HORARIO" sin bloque no cambia nada.
const disponibilidadDe = (p) =>
  respuestaDeAccion(p.accion, p.bloqueHorarioId)?.tipo ?? "pendiente_respuesta";

const wsp = await import("@/lib/encomiendas/local/sincronizar-whatsapp");
const {
  validarRespuesta,
  pideListaDeHorarios,
  aplicarRespuestas,
  pedidosSinAviso,
} = wsp;

const idb = await import("@/lib/encomiendas/local/idb");

const HOY = "2026-08-20";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

// La clave de cada store es distinta (id, fecha, pedidoId), así que se resuelve
// por store en vez de adivinar con "fila.id ?? fila.fecha" — que es lo que
// rompería en silencio al agregar el cuarto store.
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
  for (let i = 1; i <= cantidad; i++) ids.push((await guardarPedido(P(i), HOY)).id);
  return ids;
}

/** Ruta del día con esos pedidos, en ese orden. */
async function rutaCon(ids) {
  return guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: ids,
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
}

const pedido = async (id) => (await leerPedidos(HOY)).find((p) => p.id === id);

test.beforeEach(limpiar);

// ---------------------------------------------------------------------------
// Los bloques horarios que promete el producto
// ---------------------------------------------------------------------------

test("son los cinco bloques de dos horas de 08:00 a 18:00 (FR-009)", () => {
  assert.equal(BLOQUES_HORARIOS.length, 5);
  assert.deepEqual(
    BLOQUES_HORARIOS.map((b) => b.etiqueta),
    [
      "08:00 - 10:00",
      "10:00 - 12:00",
      "12:00 - 14:00",
      "14:00 - 16:00",
      "16:00 - 18:00",
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
  assert.equal(minutosDesde("16-18"), 16 * 60);
  assert.equal(minutosDesde("03-05"), null, "un bloque retirado no puede dar un número");
  assert.equal(minutosDesde(null), null);
  assert.equal(bloquePorId("no-existe"), null);
});

// ---------------------------------------------------------------------------
// El payload del botón: el contrato con Meta
// ---------------------------------------------------------------------------

test("el payload del botón va y vuelve sin perder nada", () => {
  for (const accion of ["CONFIRMAR", "MANANA", "HORARIO"]) {
    const p = payloadBoton(accion, "corr-abc123");
    assert.deepEqual(leerPayloadBoton(p), {
      accion,
      correlationId: "corr-abc123",
      bloqueHorarioId: null,
    });
  }

  const conBloque = payloadBoton("HORARIO", "corr-xyz", "16-18");
  assert.equal(conBloque, "HORARIO_16-18:corr-xyz");
  assert.deepEqual(leerPayloadBoton(conBloque), {
    accion: "HORARIO",
    correlationId: "corr-xyz",
    bloqueHorarioId: "16-18",
  });
});

test("el payload cabe en los 128 caracteres que permite Meta", () => {
  // El prefijo más largo posible con los bloques de hoy.
  const masLargo = payloadBoton("HORARIO", "a".repeat(36), "16-18");
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
  assert.equal(disponibilidadDe(leido), "pendiente_respuesta");
});

test("tocar 'indicar horario' NO confirma nada todavía", () => {
  // Es el paso intermedio del flujo de dos mensajes (Decisión 8): abre la
  // ventana de 24 h para poder mandar la lista, pero el receptor no eligió nada.
  assert.equal(
    disponibilidadDe({ accion: "HORARIO", correlationId: "c", bloqueHorarioId: null }),
    "pendiente_respuesta",
  );
  assert.equal(
    disponibilidadDe({ accion: "HORARIO", correlationId: "c", bloqueHorarioId: "10-12" }),
    "horario_indicado",
  );
  assert.equal(
    disponibilidadDe({ accion: "CONFIRMAR", correlationId: "c", bloqueHorarioId: null }),
    "confirmado",
  );
  assert.equal(
    disponibilidadDe({ accion: "MANANA", correlationId: "c", bloqueHorarioId: null }),
    "manana",
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
  assert.equal(p.resultado, "pendiente");
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
    cargadoEn: "2026-08-20T15:00:00.000Z",
  };
  await idb.escribir([idb.STORES.pedidos], ({ guardar }) =>
    guardar(idb.STORES.pedidos, viejo),
  );

  const p = await pedido(viejo.id);
  assert.equal(p.disponibilidad, "pendiente_respuesta", "un pedido v1 quedó con disponibilidad undefined");
  assert.equal(p.bloqueHorarioId, null);
  assert.equal(p.fecha, HOY, "la fecha sale del día de carga");
  assert.equal(p.resultado, "pendiente");
  assert.equal(p.llamada, "pendiente");
});

test("una ruta guardada por la versión ANTERIOR se lee sin undefined", async () => {
  const vieja = {
    fecha: HOY,
    paradas: [],
    trazado: null,
    distanciaM: null,
    duracionS: null,
    inicio: "2026-08-01T10:00:00.000Z",
    cierre: null,
  };
  await idb.escribir([idb.STORES.rutas], ({ guardar }) => guardar(idb.STORES.rutas, vieja));

  const r = await leerRuta(HOY);
  assert.deepEqual(r.orden, []);
  assert.deepEqual(r.advertencias, []);
  assert.equal(r.propuestasComparadas, 1);
});

// ---------------------------------------------------------------------------
// Disponibilidad: las cuatro respuestas
// ---------------------------------------------------------------------------

test("confirmar deja el pedido confirmado y visible como tal", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR), true);
  assert.equal((await pedido(id)).disponibilidad, "confirmado");
});

test("elegir un bloque lo asocia al pedido", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "16-18" }, "wamid.R1", CONDUCTOR);
  const p = await pedido(id);
  assert.equal(p.disponibilidad, "horario_indicado");
  assert.equal(p.bloqueHorarioId, "16-18");
});

test("cambiar de respuesta LIMPIA el bloque anterior", async () => {
  // Si no se limpiara, la ruta seguiría ordenando por una ventana horaria que el
  // receptor ya descartó.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "08-10" }, "wamid.R1", CONDUCTOR);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R2", CONDUCTOR);

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "confirmado");
  assert.equal(p.bloqueHorarioId, null, "quedó un bloque horario de una respuesta anterior");
});

test("una respuesta posterior reemplaza la anterior", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "12-14" }, "wamid.R2", CONDUCTOR);
  assert.equal((await pedido(id)).disponibilidad, "horario_indicado");
});

// ---------------------------------------------------------------------------
// Idempotencia: la misma respuesta puede llegar dos veces
// ---------------------------------------------------------------------------

test("la MISMA respuesta aplicada dos veces cambia el pedido una sola vez", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR), true);
  assert.equal(
    await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR),
    false,
    "la segunda aplicación del mismo mensaje se contó como un cambio",
  );

  const c = (await pedido(id)).aviso;
  assert.deepEqual(c.respuestasAplicadas, ["wamid.R1"], "el id del mensaje se anotó dos veces");
});

test("tres aplicaciones EN PARALELO del mismo mensaje: solo una entra", async () => {
  // Es el caso real: la pantalla sincroniza, vuelve la app del fondo y el
  // reintento periódico dispara, los tres bajan el mismo lote. Sin la fila del
  // almacén, los tres leerían "no aplicada" y los tres pasarían.
  const [id] = await cargar(1);
  const r = await Promise.all([
    registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR),
    registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR),
    registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR),
  ]);
  assert.equal(r.filter(Boolean).length, 1, `entraron ${r.filter(Boolean).length} veces`);

  const c = (await pedido(id)).aviso;
  assert.deepEqual(c.respuestasAplicadas, ["wamid.R1"]);
});

test("una respuesta para un pedido borrado se descarta sin lanzar", async () => {
  assert.equal(
    await registrarDisponibilidad("00000000-0000-7000-8000-000000000404", { tipo: "confirmado" }, "wamid.R9", CONDUCTOR),
    false,
  );
});

// ---------------------------------------------------------------------------
// Regla 2: lo cerrado no se reabre ("Mañana" cierra el pedido, spec 010)
// ---------------------------------------------------------------------------

test("un 'sí' que llega DESPUÉS de 'Mañana' no lo reabre", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR);
  assert.equal(
    await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R2", CONDUCTOR),
    false,
    "una respuesta posterior reabrió un pedido cerrado",
  );
  const p = await pedido(id);
  assert.equal(p.disponibilidad, "manana");
  assert.equal(p.resultado, "no_entregado");
});

test("un bloque elegido DESPUÉS de 'Mañana' tampoco lo reabre", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "10-12" }, "wamid.R2", CONDUCTOR);

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "manana");
  assert.equal(p.bloqueHorarioId, null);
});

test("una respuesta frenada por una regla se anota igual, para no bajarla eternamente", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R2", CONDUCTOR);

  const c = (await pedido(id)).aviso;
  assert.deepEqual(
    c.respuestasAplicadas.sort(),
    ["wamid.R1", "wamid.R2"],
    "la respuesta descartada no quedó anotada y volvería a bajar para siempre",
  );
});

test("repetir el MISMO 'Mañana' es idempotente: un solo evento", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR), true);
  assert.equal(await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR), false);
  assert.equal((await leerCola()).length, 1);
});

// ---------------------------------------------------------------------------
// El resultado de la visita: entregado o no (spec 012)
// ---------------------------------------------------------------------------

test("entregar cierra el pedido y encola una entrega", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");

  assert.equal((await pedido(id)).resultado, "entregado");
  const cola = await leerCola();
  assert.equal(cola.length, 1);
  assert.equal(cola[0].tipo, "entrega");
  assert.equal("motivo" in cola[0], false, "el evento lleva un motivo");
});

test("no entregado cierra el pedido del día y encola una omisión sin motivo", async () => {
  const [id, otro] = await cargar(2);
  await rutaCon([id, otro]);
  await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "no_entregado");

  assert.equal((await pedido(id)).resultado, "no_entregado");
  assert.deepEqual(
    (await pedidosPendientes(HOY)).map((p) => p.id),
    [otro],
    "el pedido tachado sigue en juego",
  );
  const [ev] = await leerCola();
  assert.equal(ev.tipo, "omision");
  assert.equal("motivo" in ev, false);
  assert.deepEqual((await leerRuta(HOY)).orden, [id, otro], "tacharlo lo sacó del orden");
});

test("marcar dos veces la misma parada no duplica el evento, con cualquier resultado", async () => {
  const [a, b, c, d] = await cargar(4);
  await rutaCon([a, b, c, d]);

  const casos = [
    [a, "entregado"],
    [b, "no_entregado"],
    [c, "entregado"],
    [d, "no_entregado"],
  ];
  for (const [id, resultado] of casos) {
    const primero = await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, resultado);
    const segundo = await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, resultado);
    assert.ok(primero, `${resultado}: el primer toque no devolvió evento`);
    assert.equal(segundo, null, `${resultado}: el segundo toque volvió a cerrar la parada`);
  }
  assert.equal((await leerCola()).length, 4, "se encolaron eventos de más");
});

test("cuatro toques EN PARALELO sobre la misma parada encolan un solo evento", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  const marca = { fecha: HOY, pedidoId: id, conductorId: CONDUCTOR };

  const ids = await Promise.all([
    marcarResultado(marca, "no_entregado"),
    marcarResultado(marca, "no_entregado"),
    marcarResultado(marca, "no_entregado"),
    marcarResultado(marca, "no_entregado"),
  ]);
  assert.equal(ids.filter(Boolean).length, 1);
  assert.equal((await leerCola()).length, 1);
});

// ---------------------------------------------------------------------------
// "Mañana" por WhatsApp: no entregado sin visita (specs 010 y 012)
// ---------------------------------------------------------------------------

test("'Mañana' cierra el pedido como no entregado y lo cuenta, sin necesitar una ruta", async () => {
  const [id] = await cargar(1);
  assert.equal(await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR), true);

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "manana", "lo que dijo el receptor sigue separado del resultado");
  assert.equal(p.resultado, "no_entregado");
  assert.deepEqual(await pedidosPendientes(HOY), []);

  const [ev] = await leerCola();
  assert.equal(ev.tipo, "omision");
  assert.equal(ev.fecha, HOY);
  assert.equal(ev.conductorId, CONDUCTOR);
});

test("'Mañana' en paralelo encola un solo evento", async () => {
  const [id] = await cargar(1);
  const r = await Promise.all([
    registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR),
    registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR),
    registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R2", CONDUCTOR),
  ]);
  assert.equal(r.filter(Boolean).length, 1);
  assert.equal((await leerCola()).length, 1);
});

test("'Sí' y un horario no cierran nada ni encolan", async () => {
  // Solo "Mañana" cierra: lo demás es disponibilidad, el resultado lo pone la puerta.
  const [a, b] = await cargar(2);
  await registrarDisponibilidad(a, { tipo: "confirmado" }, "wamid.RA", CONDUCTOR);
  await registrarDisponibilidad(b, { tipo: "horario_indicado", bloqueHorarioId: "16-18" }, "wamid.RB", CONDUCTOR);

  assert.deepEqual((await pedidosPendientes(HOY)).map((p) => p.id).sort(), [a, b].sort());
  assert.equal((await leerCola()).length, 0);
});

// ---------------------------------------------------------------------------
// Corregir un teléfono mal escrito
// ---------------------------------------------------------------------------

test("editar un pedido conserva lo que el receptor ya contestó", async () => {
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "14-16" }, "wamid.R1", CONDUCTOR);

  await guardarPedido({ ...P(1), notas: "portón azul" }, HOY, id);

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "horario_indicado");
  assert.equal(p.bloqueHorarioId, "14-16");
  assert.equal(p.notas, "portón azul");
});

test("reiniciar la disponibilidad borra la respuesta del número equivocado", async () => {
  // Esa respuesta era de otra persona: no puede quedar pegada al pedido, y el
  // aviso tiene que poder salir de nuevo al número correcto.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "horario_indicado", bloqueHorarioId: "16-18" }, "wamid.R1", CONDUCTOR);

  await reiniciarDisponibilidad(id);

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  assert.equal(p.bloqueHorarioId, null);
  assert.deepEqual((await pedido(id)).aviso.respuestasAplicadas, [], "quedó el aviso del número viejo");

  // Y ahora el mismo mensaje puede volver a aplicarse: es otro destinatario.
  assert.equal(await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR), true);
});

test("corregir un teléfono mal escrito descarta la respuesta del anterior", async () => {
  // El flujo completo tal como lo dispara el formulario.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.DELOTRO", CONDUCTOR);

  await reiniciarDisponibilidad(id);
  await guardarPedido({ ...P(1), telefono: "+56999999999" }, HOY, id);

  const p = await pedido(id);
  assert.equal(p.telefono, "+56999999999");
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  assert.deepEqual((await pedidosPendientes(HOY)).map((x) => x.id), [id]);
});

test("corregir el teléfono NO reabre un 'Mañana' ya registrado", async () => {
  // La no entrega ya salió al servidor como evento: reabrirla dejaría las dos
  // puntas contando cosas distintas.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "manana" }, "wamid.R1", CONDUCTOR);

  await reiniciarDisponibilidad(id);
  const p = await pedido(id);
  assert.equal(p.resultado, "no_entregado");
  assert.equal(p.disponibilidad, "pendiente_respuesta");
});

test("corregir SOLO la dirección conserva lo que el receptor contestó", async () => {
  // La contracara: no hay que descartar una respuesta válida porque el conductor
  // arregló una calle mal escrita.
  const [id] = await cargar(1);
  await registrarDisponibilidad(id, { tipo: "confirmado" }, "wamid.R1", CONDUCTOR);

  await guardarPedido({ ...P(1), direccion: "Calle Corregida 200, Arica" }, HOY, id);

  const p = await pedido(id);
  assert.equal(p.direccion, "Calle Corregida 200, Arica");
  assert.equal(p.disponibilidad, "confirmado");
});

test("reiniciar la disponibilidad NO reabre un pedido tachado en la puerta", async () => {
  // Corregir el teléfono descarta lo que dijo OTRA persona por WhatsApp. Lo
  // marcado en la puerta sí ocurrió: queda cerrado.
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "no_entregado");

  await reiniciarDisponibilidad(id);
  assert.equal((await pedido(id)).resultado, "no_entregado");
});

test("reiniciar la disponibilidad NO reabre una entrega ya hecha", async () => {
  const [id] = await cargar(1);
  await rutaCon([id]);
  await marcarResultado({ fecha: HOY, pedidoId: id, conductorId: CONDUCTOR }, "entregado");

  await reiniciarDisponibilidad(id);
  assert.equal((await pedido(id)).resultado, "entregado", "se reabrió un pedido ya entregado y contado");
});

// ---------------------------------------------------------------------------
// Estado del MENSAJE — que no se confunda con el de la entrega
// ---------------------------------------------------------------------------

test("un mensaje fallido deja el pedido pendiente de contacto, no tachado", async () => {
  // Es una regla explícita del contrato: 'failed' describe el mensaje, no lo que
  // el receptor quiere. Tacharlo perdería una entrega posible.
  const [id] = await cargar(1);
  await registrarAvisoEnviado({ pedidoId: id, codigo: "corr-1", mensajeId: "wamid.T1" });
  await registrarAvisoFallido(id, "Receiver is incapable of receiving this message");

  const p = await pedido(id);
  assert.equal(p.disponibilidad, "pendiente_respuesta");
  const c = (await pedido(id)).aviso;
  assert.equal(c.estado, "fallido");
  assert.match(c.ultimoError, /incapable/);
});


test("el envío guarda el código del aviso y cuenta el intento", async () => {
  const [id] = await cargar(1);
  await registrarAvisoEnviado({ pedidoId: id, codigo: "corr-1", mensajeId: "wamid.T1" });

  const c = (await pedido(id)).aviso;
  assert.equal(c.codigo, "corr-1");
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
  await registrarAvisoEnviado({ pedidoId: a, codigo: "corr-a", mensajeId: "wamid.TA" });

  assert.deepEqual(
    pedidosSinAviso(await leerPedidos(HOY)).map((p) => p.id),
    [b],
    "se iba a avisar dos veces al mismo receptor",
  );
});

test("un aviso fallido se reintenta, pero no para siempre", async () => {
  const [id] = await cargar(1);

  for (let i = 1; i <= wsp.MAX_INTENTOS_AVISO; i++) {
    assert.equal(pedidosSinAviso(await leerPedidos(HOY)).length, 1, `intento ${i}: dejó de reintentar antes de tiempo`);
    await registrarAvisoFallido(id, "sin señal");
  }
  assert.deepEqual(pedidosSinAviso(await leerPedidos(HOY)), [], "siguió insistiendo con un número que falla siempre");

  const c = (await pedido(id)).aviso;
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
  assert.deepEqual(respuestaDeAccion(r.accion, r.bloqueHorarioId), { tipo: "confirmado" });
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
  assert.equal(respuestaDeAccion(r.accion, r.bloqueHorarioId), null);
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
    { pedidoId: b, mensajeId: "wamid.RB", accion: "HORARIO", bloqueHorarioId: "16-18", recibidoEn: "2026-08-20T12:01:00.000Z" },
    { pedidoId: c, mensajeId: "wamid.RC", accion: "HORARIO", bloqueHorarioId: null, recibidoEn: "2026-08-20T12:02:00.000Z" },
    // Basura en el medio: no puede frenar las demás ni confirmarse.
    { pedidoId: "", mensajeId: "wamid.RX", accion: "CONFIRMAR" },
  ];

  const r = await aplicarRespuestas(lote, CONDUCTOR);

  assert.equal(r.aplicadas, 2, "no se aplicaron las dos respuestas con disponibilidad");
  assert.equal(r.descartadas, 1, "el 'quiere indicar horario' debía quedar atendido sin cambiar el pedido");
  assert.deepEqual(r.confirmar.sort(), ["wamid.RA", "wamid.RB", "wamid.RC"]);
  assert.ok(!r.confirmar.includes("wamid.RX"), "se confirmó una fila que no se entendió");
  assert.deepEqual(r.pedirHorarios, [c]);
  // El bloque elegido es lo único de este lote que puede mover la ruta en curso.
  assert.deepEqual(r.cambios, [{ pedidoId: b, tipo: "horario_indicado" }]);

  assert.equal((await pedido(a)).disponibilidad, "confirmado");
  assert.equal((await pedido(b)).bloqueHorarioId, "16-18");
  assert.equal((await pedido(c)).disponibilidad, "pendiente_respuesta");
});

test("volver a aplicar el mismo lote no cambia nada y sigue confirmándose", async () => {
  const [id] = await cargar(1);
  const lote = [
    { pedidoId: id, mensajeId: "wamid.R1", accion: "CONFIRMAR", recibidoEn: "2026-08-20T12:00:00.000Z" },
  ];

  const primera = await aplicarRespuestas(lote, CONDUCTOR);
  const segunda = await aplicarRespuestas(lote, CONDUCTOR);

  assert.equal(primera.aplicadas, 1);
  assert.equal(segunda.aplicadas, 0);
  assert.equal(segunda.descartadas, 1);
  // Se sigue confirmando: si no, el servidor la mandaría en cada consulta.
  assert.deepEqual(segunda.confirmar, ["wamid.R1"]);
});

test("un lote vacío no hace nada", async () => {
  assert.deepEqual(await aplicarRespuestas([], CONDUCTOR), {
    aplicadas: 0,
    descartadas: 0,
    confirmar: [],
    pedirHorarios: [],
    cambios: [],
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
      // La migración es histórica (0003): la tabla se renombró en la 0006 y
      // Postgres actualizó las policies solo. Lo que importa es el filtro.
      /where user_id = \(select auth\.uid\(\)\)/,
      `una policy no se limita al propio conductor:\n${policy.slice(0, 120)}`,
    );
  }
});

test("la retención está escrita en la migración: cierre de día y tope de 72 horas", () => {
  // Las dos mitades de lo que promete el documento principal.
  assert.match(
    sqlMigracion,
    /trg_encomienda_jornada_borrar_correlaciones/,
    "falta el borrado al cerrar el día",
  );
  assert.match(sqlMigracion, /interval '72 hours'/, "falta el tope de 72 horas");
  assert.match(
    sqlMigracion,
    /cron\.schedule\(\s*'encomienda-limpiar-correlaciones'/,
    "el barrido no queda programado, así que el tope no se aplicaría solo",
  );
});

test("la 0003 restringe el motivo heredado a omisiones (la columna se borra en 002 T051)", () => {
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
