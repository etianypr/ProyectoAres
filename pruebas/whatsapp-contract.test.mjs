// El contrato con Meta, de las dos puntas: lo que sale y lo que entra.
//
// Corre el adaptador REAL de src/lib/whatsapp/meta.ts contra un doble del fetch
// global (ver pruebas/dobles/meta-whatsapp.mjs), así que lo que se comprueba es
// la URL que arma, los headers, el cuerpo de la plantilla, los índices de los
// botones y cómo interpreta cada error. Un doble a nivel de módulo no probaría
// nada de eso — y es justo eso lo que se rompe cuando Meta cambia algo.
//
// Los tres riesgos que sostienen este archivo:
//
//  1. Un payload mal armado hace que la respuesta del receptor no se pueda
//     resolver. El receptor contesta y el conductor nunca se entera.
//  2. Un evento duplicado aplicado dos veces (Meta reintenta cuando no recibe el
//     200 a tiempo) puede mover el estado de un pedido dos veces.
//  3. Un dato del receptor que se filtre a un log o a la base rompe la única
//     excepción de privacidad que esta feature pidió, y que se aprobó
//     precisamente porque era acotada.
import test from "node:test";
import assert from "node:assert/strict";

const {
  enviarAvisoDisponibilidad,
  enviarListaHorarios,
  configMeta,
  whatsappActivo,
} = await import("@/lib/whatsapp/meta");

const {
  BLOQUES_HORARIOS,
  leerPayloadBoton,
  payloadBoton,
  bloquesActivos,
} = await import("@/lib/encomiendas/config");
const { respuestaDeAccion } = await import("@/lib/encomiendas/estados");
const disponibilidadDe = (p) =>
  respuestaDeAccion(p.accion, p.bloqueHorarioId)?.tipo ?? "pendiente_respuesta";

const doble = await import("./dobles/meta-whatsapp.mjs");
const { meta, fixtures, instalarMeta, desinstalarMeta, respuestasEnOrden, errorMeta } = doble;

// Un "esperar" que no espera: sin esto, cada prueba del backoff tardaría dos
// segundos de reloj real. El adaptador lo recibe como parámetro justamente para
// que no haya forma de dejarlo apagado en producción sin darse cuenta.
const yaMismo = async () => {};

const AVISO = {
  telefono: "+56912340001",
  nombre: "Ana",
  correlationId: "corr-0001",
  cuando: "hoy",
};

test.before(() => {
  process.env.WHATSAPP_TOKEN = "EAAG-token-de-prueba";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID_1";
  process.env.WHATSAPP_PLANTILLA_AVISO = "aviso_encomienda";
  process.env.WHATSAPP_PLANTILLA_IDIOMA = "es";
  instalarMeta();
});
test.after(desinstalarMeta);
test.beforeEach(() => meta.reset());

const ultimoCuerpo = () => meta.llamadas.at(-1).cuerpo;

// ===========================================================================
// Configuración
// ===========================================================================

test("con token y número, WhatsApp está activo para la pantalla del conductor", () => {
  assert.equal(whatsappActivo(), true);
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  try {
    assert.equal(whatsappActivo(), false, "sin número no hay desde dónde mandar");
  } finally {
    process.env.WHATSAPP_PHONE_NUMBER_ID = numero;
  }
});

test("sin token configurado no se manda nada, y no se lanza", async () => {
  // Es la situación normal en desarrollo: la app tiene que funcionar igual y el
  // conductor sigue repartiendo, solo que sin avisos.
  const token = process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_TOKEN;
  try {
    assert.equal(configMeta(), null);
    assert.equal(whatsappActivo(), false, "la pantalla seguiría intentando avisar (spec 013)");
    const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
    assert.equal(r.ok, false);
    assert.equal(r.reintentable, false, "reintentar no va a configurar el token");
    assert.equal(meta.llamadas.length, 0, "se salió a la red sin token");
  } finally {
    process.env.WHATSAPP_TOKEN = token;
  }
});

// ===========================================================================
// El mensaje que sale
// ===========================================================================

test("el aviso va a la URL de mensajes del número configurado", async () => {
  await enviarAvisoDisponibilidad(AVISO, yaMismo);
  const [llamada] = meta.llamadas;

  assert.equal(llamada.metodo, "POST");
  assert.match(llamada.url, /graph\.facebook\.com/);
  assert.match(llamada.url, /\/PNID_1\/messages$/);
  // Versión fijada: si esto cambia solo, el webhook puede empezar a recibir otra
  // forma de evento y perder respuestas en silencio.
  assert.match(llamada.url, /\/v\d+\.\d+\//);
});

test("el token va en el header y NUNCA en la URL", async () => {
  // Una URL termina en los logs de acceso de cualquier proxy del camino.
  await enviarAvisoDisponibilidad(AVISO, yaMismo);
  const [llamada] = meta.llamadas;

  assert.equal(llamada.headers.Authorization, "Bearer EAAG-token-de-prueba");
  assert.ok(!llamada.url.includes("EAAG"), "el token viajó en la URL");
  assert.ok(!llamada.url.includes("access_token"), "el token viajó como parámetro");
});

test("el aviso sale como PLANTILLA, que es lo único que Meta permite de entrada", async () => {
  // Un mensaje interactivo requiere la ventana de 24 h que abre una respuesta del
  // cliente; el primer contacto tiene que ser plantilla.
  await enviarAvisoDisponibilidad(AVISO, yaMismo);
  const c = ultimoCuerpo();

  assert.equal(c.messaging_product, "whatsapp");
  assert.equal(c.to, "+56912340001");
  assert.equal(c.type, "template");
  assert.equal(c.template.name, "aviso_encomienda");
  assert.equal(c.template.language.code, "es");
});

test("la plantilla lleva exactamente TRES botones, en el orden del producto", async () => {
  // Tres es el máximo que Meta permite, y son las tres respuestas del documento
  // principal. El ORDEN importa: el payload se manda por índice, así que si
  // alguien reordena los botones en el panel de Meta, el "sí" de un receptor
  // llega como "Mañana" (spec 010: Sí, estaré · Mañana · Otro horario).
  await enviarAvisoDisponibilidad(AVISO, yaMismo);
  const botones = ultimoCuerpo().template.components.filter((x) => x.type === "button");

  assert.equal(botones.length, 3, `la plantilla salió con ${botones.length} botones`);
  assert.deepEqual(
    botones.map((b) => b.index),
    ["0", "1", "2"],
  );
  assert.deepEqual(
    botones.map((b) => leerPayloadBoton(b.parameters[0].payload).accion),
    ["CONFIRMAR", "MANANA", "HORARIO"],
  );
  for (const b of botones) assert.equal(b.sub_type, "quick_reply");
});

test("los tres botones llevan el MISMO identificador de correlación", async () => {
  // Es lo que permite resolver la respuesta sin guardar el teléfono del receptor.
  await enviarAvisoDisponibilidad(AVISO, yaMismo);
  const botones = ultimoCuerpo().template.components.filter((x) => x.type === "button");
  const ids = botones.map((b) => leerPayloadBoton(b.parameters[0].payload).correlationId);

  assert.deepEqual(new Set(ids), new Set(["corr-0001"]));
});

test("el cuerpo de la plantilla lleva el nombre y el cuándo, y nada más", async () => {
  await enviarAvisoDisponibilidad(AVISO, yaMismo);
  const body = ultimoCuerpo().template.components.find((x) => x.type === "body");

  assert.deepEqual(
    body.parameters.map((p) => p.text),
    ["Ana", "hoy"],
  );
});

/** Todas las CLAVES que aparecen en un objeto, a cualquier profundidad. */
function clavesDe(valor, acumulado = new Set()) {
  if (Array.isArray(valor)) {
    for (const v of valor) clavesDe(v, acumulado);
  } else if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      acumulado.add(k);
      clavesDe(v, acumulado);
    }
  }
  return acumulado;
}

/** Todos los valores de texto, a cualquier profundidad. */
function textosDe(valor, acumulado = []) {
  if (typeof valor === "string") acumulado.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) textosDe(v, acumulado);
  else if (valor && typeof valor === "object") {
    for (const v of Object.values(valor)) textosDe(v, acumulado);
  }
  return acumulado;
}

test("el cuerpo que sale a Meta solo usa claves del protocolo, ninguna nuestra", async () => {
  // Se comprueba contra una lista blanca y no buscando palabras prohibidas: una
  // búsqueda de "lat" da positivo dentro de "template" y una prueba que grita en
  // falso se termina borrando. Con lista blanca, en cambio, cualquier campo nuevo
  // que alguien agregue —"direccion", "lat", lo que sea— aparece acá.
  await enviarAvisoDisponibilidad(AVISO, yaMismo);

  const PERMITIDAS = new Set([
    "messaging_product",
    "recipient_type",
    "to",
    "type",
    "template",
    "name",
    "language",
    "code",
    "components",
    "parameters",
    "text",
    "sub_type",
    "index",
    "payload",
  ]);

  const usadas = [...clavesDe(ultimoCuerpo())];
  const deMas = usadas.filter((k) => !PERMITIDAS.has(k));
  assert.deepEqual(deMas, [], `el cuerpo lleva claves que no son del protocolo: ${deMas}`);
});

test("NO sale la dirección ni las coordenadas del pedido", async () => {
  // Es la regla del contrato, y la razón por la que esta integración se aprobó.
  // El adaptador ni siquiera RECIBE la dirección: se le pasa acá a la fuerza,
  // dentro de los campos que sí acepta, para comprobar que nada la arrastra.
  await enviarAvisoDisponibilidad(
    { ...AVISO, nombre: "Ana", cuando: "hoy" },
    yaMismo,
  );

  const textos = textosDe(ultimoCuerpo()).join(" | ");

  // La dirección de un pedido de prueba: no tiene por qué aparecer, y no hay
  // ningún camino por el que pudiera. Es el centinela.
  assert.ok(!textos.includes("Chacabuco"), "salió una dirección");
  // Un par de coordenadas: dos números con punto decimal separados por coma.
  assert.ok(
    !/-?\d+\.\d{3,}\s*,\s*-?\d+\.\d{3,}/.test(textos),
    "salieron coordenadas",
  );
  // Y el orden de la ruta: un "parada 3 de 12" o similar.
  assert.ok(!/\bparada\b/i.test(textos), "salió el orden de la ruta");
});

test("un envío que funciona devuelve el wamid, que es lo único correlacionable", async () => {
  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.ok, true);
  assert.equal(r.mensajeId, "wamid.TEST0001");
});

test("un 200 SIN wamid no se da por bueno", async () => {
  // No debería pasar, pero si pasa no hay con qué correlacionar la respuesta:
  // darlo por bueno dejaría al receptor contestando al vacío.
  meta.responder = () => ({ estado: 200, cuerpo: { messaging_product: "whatsapp" } });
  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);

  assert.equal(r.ok, false);
  assert.equal(r.reintentable, false);
  assert.match(r.error, /identificador/i);
});

// ===========================================================================
// La lista de horarios: el segundo mensaje
// ===========================================================================

test("la lista de horarios sale como mensaje interactivo, no como plantilla", async () => {
  // Puede, porque tocar "indicar un horario" ya abrió la ventana de 24 h.
  await enviarListaHorarios({ telefono: "+56912340001", correlationId: "corr-3" }, yaMismo);
  const c = ultimoCuerpo();

  assert.equal(c.type, "interactive");
  assert.equal(c.interactive.type, "list");
  assert.ok(c.interactive.action.button.length > 0);
});

test("la lista trae los cinco bloques con su payload resoluble", async () => {
  await enviarListaHorarios({ telefono: "+56912340001", correlationId: "corr-3" }, yaMismo);
  const filas = ultimoCuerpo().interactive.action.sections[0].rows;

  assert.equal(filas.length, 5);
  assert.deepEqual(
    filas.map((f) => f.title),
    BLOQUES_HORARIOS.map((b) => b.etiqueta),
  );

  for (const fila of filas) {
    const leido = leerPayloadBoton(fila.id);
    assert.ok(leido, `no se pudo leer el payload "${fila.id}"`);
    assert.equal(leido.accion, "HORARIO");
    assert.equal(leido.correlationId, "corr-3");
    assert.ok(leido.bloqueHorarioId, "una fila de la lista salió sin bloque");
    assert.equal(disponibilidadDe(leido), "horario_indicado");
  }
});

test("los títulos de las filas caben en los 24 caracteres de Meta", async () => {
  await enviarListaHorarios({ telefono: "+56912340001", correlationId: "corr-3" }, yaMismo);
  for (const fila of ultimoCuerpo().interactive.action.sections[0].rows) {
    assert.ok(fila.title.length <= 24, `"${fila.title}" mide ${fila.title.length}`);
  }
});

test("solo se ofrecen los bloques que el jefe dejó activos", async () => {
  await enviarListaHorarios(
    {
      telefono: "+56912340001",
      correlationId: "corr-3",
      bloques: bloquesActivos(["08-10", "16-18"]),
    },
    yaMismo,
  );
  const filas = ultimoCuerpo().interactive.action.sections[0].rows;

  assert.deepEqual(
    filas.map((f) => f.title),
    ["08:00 - 10:00", "16:00 - 18:00"],
  );
});

test("los bloques salen en orden del día, no en el que se guardaron", async () => {
  // Al receptor le tienen que aparecer de la mañana a la tarde.
  await enviarListaHorarios(
    {
      telefono: "+56912340001",
      correlationId: "corr-3",
      bloques: bloquesActivos(["16-18", "08-10", "12-14"]),
    },
    yaMismo,
  );
  assert.deepEqual(
    ultimoCuerpo().interactive.action.sections[0].rows.map((f) => f.title),
    ["08:00 - 10:00", "12:00 - 14:00", "16:00 - 18:00"],
  );
});

test("sin ningún bloque activo NO se manda una lista vacía", async () => {
  // Meta la rechazaría con un error confuso. Y no es un problema de red: es una
  // configuración que alguien tiene que arreglar, y el conductor necesita saberlo
  // para llamar por teléfono.
  const r = await enviarListaHorarios(
    { telefono: "+56912340001", correlationId: "corr-3", bloques: bloquesActivos([]) },
    yaMismo,
  );

  assert.equal(r.ok, false);
  assert.equal(r.reintentable, false);
  assert.match(r.error, /bloques horarios activos/i);
  assert.equal(meta.llamadas.length, 0, "se mandó una lista vacía a Meta");
});

test("bloquesActivos: null son los seis, vacío es ninguno", () => {
  // La diferencia importa: confundirlas haría que desmarcar todo volviera a
  // ofrecer los seis, que es lo contrario de lo que el jefe pidió.
  assert.equal(bloquesActivos(null).length, 5);
  assert.equal(bloquesActivos(undefined).length, 5);
  assert.equal(bloquesActivos([]).length, 0);
  assert.equal(bloquesActivos(["10-12"]).length, 1);
  // Un id que ya no existe no aparece de la nada.
  assert.equal(bloquesActivos(["03-05"]).length, 0);
});

// ===========================================================================
// Errores, reintentos y backoff
// ===========================================================================

test("un 429 se reintenta y puede terminar bien", async () => {
  // La cuota de Meta se libera sola con el tiempo.
  respuestasEnOrden(errorMeta(429, fixtures.envio_error_limite), {
    estado: 200,
    cuerpo: fixtures.envio_ok,
  });

  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.ok, true);
  assert.equal(meta.llamadas.length, 2, "no reintentó tras el 429");
});

test("un 500 se reintenta", async () => {
  respuestasEnOrden(errorMeta(500, { error: { message: "boom" } }), {
    estado: 200,
    cuerpo: fixtures.envio_ok,
  });

  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.ok, true);
  assert.equal(meta.llamadas.length, 2);
});

test("no se reintenta para siempre: dos reintentos y se abandona", async () => {
  // Si Meta sigue diciendo que no, el conductor necesita enterarse para llamar por
  // teléfono, no que la app siga insistiendo sola.
  meta.responder = () => errorMeta(500, { error: { message: "boom" } });

  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.ok, false);
  assert.equal(r.reintentable, true, "sigue siendo reintentable más tarde");
  assert.equal(meta.llamadas.length, 3, `hizo ${meta.llamadas.length} intentos`);
});

test("una plantilla que no existe NO se reintenta", async () => {
  // Reintentarlo gasta cuota y retrasa los avisos que sí se pueden mandar.
  meta.responder = () => errorMeta(400, fixtures.envio_error_plantilla);

  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.ok, false);
  assert.equal(r.reintentable, false);
  assert.equal(r.codigo, 132001);
  assert.equal(meta.llamadas.length, 1, "reintentó un error que no cambia con el tiempo");
});

test("un número sin WhatsApp NO se reintenta", async () => {
  meta.responder = () => errorMeta(400, { error: { code: 131026, message: "undeliverable" } });

  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.reintentable, false);
  assert.equal(meta.llamadas.length, 1);
});

test("un token vencido NO se reintenta", async () => {
  meta.responder = () => errorMeta(401, { error: { code: 190, message: "token expirado" } });

  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.reintentable, false);
  assert.equal(meta.llamadas.length, 1);
});

test("mandar la lista fuera de la ventana de 24 h no se reintenta", async () => {
  // Código 131047. Es la mitad de la Decisión 8: la lista solo se puede mandar
  // después de que el receptor contestó.
  meta.responder = () => errorMeta(400, { error: { code: 131047, message: "reengagement" } });

  const r = await enviarListaHorarios(
    { telefono: "+56912340001", correlationId: "corr-3" },
    yaMismo,
  );
  assert.equal(r.reintentable, false);
  assert.equal(meta.llamadas.length, 1);
});

test("una respuesta que no es JSON no tumba nada", async () => {
  meta.responder = () => ({ estado: 502, cuerpo: null });
  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
});

test("el mensaje de error NUNCA incluye el token", async () => {
  meta.responder = () => errorMeta(400, fixtures.envio_error_plantilla);
  const r = await enviarAvisoDisponibilidad(AVISO, yaMismo);
  assert.ok(!r.error.includes("EAAG"), "el error mostrable filtró el token");
});

// ===========================================================================
// El payload que vuelve: los fixtures reales del webhook
// ===========================================================================
//
// Se leen los cuerpos tal como los manda Meta, con la envoltura
// entry[].changes[].value completa: si el código asume una forma más plana, se
// rompe en producción y no acá.

/** Saca el payload de un webhook igual que lo hace la ruta. */
function payloadDelWebhook(cuerpo) {
  const cambios = (cuerpo.entry ?? []).flatMap((e) => e.changes ?? []);
  const mensajes = cambios
    .filter((c) => c.field === "messages")
    .flatMap((c) => c.value?.messages ?? []);
  const m = mensajes[0];
  if (!m) return null;
  const i = m.interactive;
  return m.button?.payload ?? i?.list_reply?.id ?? i?.button_reply?.id ?? null;
}

test("un CONFIRMAR de plantilla se resuelve a 'confirmado'", () => {
  const leido = leerPayloadBoton(payloadDelWebhook(fixtures.respuesta_confirmar));
  assert.deepEqual(leido, {
    accion: "CONFIRMAR",
    correlationId: "corr-0001",
    bloqueHorarioId: null,
  });
  assert.equal(disponibilidadDe(leido), "confirmado");
});

test("un RECHAZAR de un aviso anterior a la 010 se lee como 'Mañana'", () => {
  // Es el mismo botón (segunda posición) con el payload viejo: un aviso puede
  // responderse hasta 72 h después de enviado.
  const leido = leerPayloadBoton(payloadDelWebhook(fixtures.respuesta_rechazar));
  assert.equal(leido.accion, "MANANA");
  assert.equal(disponibilidadDe(leido), "manana");
});

test("un MANANA se resuelve a 'manana'", () => {
  const leido = leerPayloadBoton(payloadBoton("MANANA", "corr-9"));
  assert.deepEqual(leido, { accion: "MANANA", correlationId: "corr-9", bloqueHorarioId: null });
  assert.equal(disponibilidadDe(leido), "manana");
});

test("una fila de la lista de horarios trae su bloque", () => {
  const leido = leerPayloadBoton(payloadDelWebhook(fixtures.respuesta_horario_lista));
  assert.deepEqual(leido, {
    accion: "HORARIO",
    correlationId: "corr-0003",
    bloqueHorarioId: "16-18",
  });
  assert.equal(disponibilidadDe(leido), "horario_indicado");
});

test("un texto libre del receptor NO se interpreta", () => {
  // El producto decidió no depender de mensajes libres. Y no se guarda ni una
  // palabra de lo que escribió.
  assert.equal(payloadDelWebhook(fixtures.respuesta_texto_libre), null);
  assert.equal(leerPayloadBoton(payloadDelWebhook(fixtures.respuesta_texto_libre)), null);
});

test("un evento que no es de mensajes se ignora", () => {
  // Aprobación de plantillas, calidad del número: llegan por el mismo webhook.
  assert.equal(payloadDelWebhook(fixtures.evento_de_otro_campo), null);
});

test("una respuesta sin 'context' igual se resuelve por el payload", () => {
  // El payload es la vía principal justamente para no depender de que Meta mande
  // el contexto.
  const leido = leerPayloadBoton(payloadDelWebhook(fixtures.respuesta_sin_contexto));
  assert.equal(leido.accion, "CONFIRMAR");
  assert.equal(leido.correlationId, "corr-0005");
});

test("el 'context' del fixture trae el wamid de NUESTRO aviso", () => {
  // Es la segunda vía de resolución cuando el payload no viene.
  const m = fixtures.respuesta_confirmar.entry[0].changes[0].value.messages[0];
  assert.equal(m.context.id, "wamid.TEST0001");
});

test("los estados del mensaje describen el MENSAJE, no la entrega", () => {
  // Un 'failed' deja el pedido pendiente de contacto; nunca lo marca rechazado
  // ni sin respuesta. Es una regla explícita del contrato.
  const enviado = fixtures.estado_enviado.entry[0].changes[0].value.statuses[0];
  assert.equal(enviado.status, "sent");
  assert.equal(enviado.id, "wamid.TEST0001");

  const fallido = fixtures.estado_fallido.entry[0].changes[0].value.statuses[0];
  assert.equal(fallido.status, "failed");
  assert.equal(fallido.errors[0].code, 131026);
});

// ===========================================================================
// Respuestas duplicadas
// ===========================================================================

test("el MISMO evento leído dos veces da exactamente lo mismo", () => {
  // Meta reintenta el mismo evento cuando no recibe el 200 a tiempo. Leerlo es
  // puro, así que la idempotencia depende de la escritura — y esa la garantiza el
  // índice único de respuesta_mensaje_id (migración 0003) más el filtro
  // "solo si todavía no tiene respuesta" del webhook.
  const payload = payloadDelWebhook(fixtures.respuesta_confirmar);
  assert.deepEqual(leerPayloadBoton(payload), leerPayloadBoton(payload));
});

test("dos respuestas distintas del mismo receptor traen wamid distintos", () => {
  // Es lo que hace que la segunda se pueda aplicar sin que la primera la frene:
  // la clave de idempotencia es el wamid de la RESPUESTA, no la correlación.
  const a = fixtures.respuesta_confirmar.entry[0].changes[0].value.messages[0].id;
  const b = fixtures.respuesta_horario_lista.entry[0].changes[0].value.messages[0].id;
  assert.notEqual(a, b);
});

test("el payload de ida y el de vuelta usan el MISMO formato", () => {
  // Si se separaran, el webhook dejaría de reconocer los botones que el
  // adaptador manda y las respuestas se perderían en silencio. Es el motivo por
  // el que el codec vive en un solo archivo compartido.
  const ida = payloadBoton("HORARIO", "corr-0003", "16-18");
  const vuelta = payloadDelWebhook(fixtures.respuesta_horario_lista);
  assert.equal(ida, vuelta);
});
