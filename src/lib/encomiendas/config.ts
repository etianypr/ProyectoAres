// Constante simple, en un archivo SIN "use server": un módulo "use server"
// solo puede exportar funciones async (server actions) — exportar una
// constante desde ahí rompe el empaquetado (Turbopack) para todo el mundo
// que la importe, con un error confuso de "module has no exports".

// Pucarani reparte encomiendas de Starken como subcontratista: el valor real
// de cada envío lo sabe el sistema interno de Starken, no algo que se pueda
// ingresar por pedido. Se estima el ingreso como (entregas × un valor fijo) en
// vez de guardar un dato que nunca se va a tener.
//
// Ese valor YA NO VIVE ACÁ: se configura en la regla de pago
// (encomienda_reglas_pago.valor_pedido, migración 0029), porque con tipo_pago
// 'porcentaje' entra en la fórmula del sueldo del conductor y tiene que quedar
// congelado junto con la regla que se usó para liquidar.
//
// Esto queda solo como RESPALDO, para los días que no tienen ninguna regla
// vigente: ahí no hay de dónde sacar el valor y el panel igual necesita mostrar
// un ingreso estimado. Es el mismo 950 que estaba antes, así que nada cambia
// de número mientras no se configure otro.
export const VALOR_APROXIMADO_PEDIDO = 950;

// ----------------------------------------------------------------------------
// Bloques horarios, disponibilidad y motivos de no entrega
// ----------------------------------------------------------------------------
//
// Estas tres listas las comparten CUATRO lados que no se pueden importar entre
// sí: el teléfono del conductor (IndexedDB, "use client"), la plantilla que
// sale a Meta (servidor), el webhook que recibe la respuesta (servidor) y el
// panel del jefe (componente de servidor). Definirlas de nuevo en cada uno era
// la forma segura de que un día el botón dijera un id que el webhook no
// reconoce y la respuesta del receptor se perdiera en silencio.
//
// Este archivo sigue sin ser "use server" y sin dependencias a propósito (ver
// el comentario de arriba): tiene que poder importarse desde cualquiera de los
// cuatro.

/** Un tramo del día que el receptor puede elegir como su disponibilidad. */
export type BloqueHorario = {
  /** Estable y corto: viaja dentro del payload del botón de WhatsApp
   *  (`HORARIO_<id>`, ver contracts/whatsapp.md) y queda guardado en el pedido
   *  del teléfono. Cambiarlo invalida las respuestas ya recibidas. */
  id: string;
  /** Lo que ve el receptor y lo que ve el conductor. */
  etiqueta: string;
  /** "HH:MM" en hora de Chile. Con esto se ordena la ruta. */
  desde: string;
  hasta: string;
};

/** Los seis bloques de dos horas con los que arranca la operación (FR-009).
 *  El jefe puede activar o desactivar cuáles se ofrecen (FR-010, ver la
 *  configuración del panel), pero no inventar tramos nuevos desde la app: la
 *  plantilla aprobada por Meta tiene una cantidad fija de botones. */
export const BLOQUES_HORARIOS: readonly BloqueHorario[] = [
  { id: "08-10", etiqueta: "08:00 - 10:00", desde: "08:00", hasta: "10:00" },
  { id: "10-12", etiqueta: "10:00 - 12:00", desde: "10:00", hasta: "12:00" },
  { id: "12-14", etiqueta: "12:00 - 14:00", desde: "12:00", hasta: "14:00" },
  { id: "14-16", etiqueta: "14:00 - 16:00", desde: "14:00", hasta: "16:00" },
  { id: "16-18", etiqueta: "16:00 - 18:00", desde: "16:00", hasta: "18:00" },
  { id: "18-20", etiqueta: "18:00 - 20:00", desde: "18:00", hasta: "20:00" },
] as const;

export function bloquePorId(id: string | null | undefined): BloqueHorario | null {
  if (!id) return null;
  return BLOQUES_HORARIOS.find((b) => b.id === id) ?? null;
}

/** Los bloques que hay que ofrecerle al receptor, a partir de lo que configuró
 *  el jefe (`empresa.bloques_horarios_activos`).
 *
 *  `null` y `undefined` significan LOS SEIS, no ninguno: una empresa que nunca
 *  abrió esa pantalla tiene que ofrecer los bloques del documento principal. Un
 *  arreglo vacío sí significa ninguno — es una decisión explícita del jefe, y el
 *  adaptador de WhatsApp la reporta como configuración a revisar en vez de
 *  mandar una lista vacía que Meta rechaza.
 *
 *  Se devuelven SIEMPRE en el orden del día, no en el que vinieron guardados: al
 *  receptor le tienen que aparecer de la mañana a la tarde. */
export function bloquesActivos(
  configurados: string[] | null | undefined,
): readonly BloqueHorario[] {
  if (configurados == null) return BLOQUES_HORARIOS;
  const elegidos = new Set(configurados);
  return BLOQUES_HORARIOS.filter((b) => elegidos.has(b.id));
}

/** Minutos desde medianoche del inicio de un bloque. Es la clave con la que la
 *  ruta ordena por ventana horaria; un id desconocido (bloque retirado después
 *  de que el receptor ya había respondido) no puede reventar el cálculo, así
 *  que devuelve null y la parada se trata como sin ventana. */
export function minutosDesde(bloqueId: string | null | undefined): number | null {
  const bloque = bloquePorId(bloqueId);
  if (!bloque) return null;
  const [h, m] = bloque.desde.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

// ----------------------------------------------------------------------------

/** Lo que el receptor contestó (o no) al aviso de WhatsApp. Es una dimensión
 *  DISTINTA del resultado del reparto: un receptor puede confirmar por WhatsApp
 *  y después no estar en el domicilio (principio II de la constitución). */
export const DISPONIBILIDADES = {
  pendiente_respuesta: "Sin responder",
  confirmado: "Confirmó",
  horario_indicado: "Eligió horario",
  rechazado: "No lo recibirá",
  disponibilidad_sin_respuesta: "No respondió",
} as const;
export type Disponibilidad = keyof typeof DISPONIBILIDADES;

/** Una disponibilidad de la que ya no se espera nada más: no tiene sentido
 *  reintentar el aviso ni esperar una respuesta tardía. */
export function disponibilidadCerrada(d: Disponibilidad): boolean {
  return d === "rechazado" || d === "disponibilidad_sin_respuesta";
}

// ----------------------------------------------------------------------------

/** Por qué no se entregó. Viaja al servidor junto al evento de omisión para
 *  que el jefe pueda distinguir los motivos (FR-021) sin que el servidor sepa
 *  QUIÉN era el receptor: es una etiqueta de tres valores, no un dato personal.
 *
 *  Los nombres son los mismos en el teléfono, en la columna `motivo` de
 *  `encomienda_actividad` y en el panel. */
export const MOTIVOS_NO_ENTREGA = {
  persona_no_encontrada: "Persona no encontrada",
  sin_respuesta: "Sin respuesta",
  rechazo: "Rechazo",
} as const;
export type MotivoNoEntrega = keyof typeof MOTIVOS_NO_ENTREGA;

/** ¿Se puede volver a intentar otro día?
 *
 *  El rechazo es el único que NO: el receptor dijo que no lo recibe, y volver a
 *  cargarlo en una ruta futura es exactamente lo que la constitución prohibe
 *  (principio II, FR-012). Los otros dos siguen pendientes y se arrastran. */
export function esReintentable(motivo: MotivoNoEntrega): boolean {
  return motivo !== "rechazo";
}

// ----------------------------------------------------------------------------
// El payload de los botones de WhatsApp
// ----------------------------------------------------------------------------
//
// Esto es un CODEC, y vive acá por el mismo motivo que las listas de arriba: lo
// escribe el servidor al armar la plantilla y lo lee el servidor al recibir el
// webhook, pero el formato tiene que estar definido en un solo lugar porque un
// desajuste no se nota — Meta entrega el payload tal cual se lo dieron, así que
// un botón que dice "CONFIRM" y un webhook que espera "CONFIRMAR" no fallan:
// simplemente pierden la respuesta del receptor en silencio.
//
// Forma: "<ACCION>:<correlationId>", y para la elección de un bloque
// "HORARIO_<bloqueId>:<correlationId>". El correlationId es opaco y aleatorio;
// es lo único nuestro que Meta llega a ver (ver la Decisión 7 de research.md).
//
// Meta permite 128 caracteres de payload en un botón de respuesta rápida. Con el
// prefijo más largo ("HORARIO_18-20:", 14) queda sitio de sobra para el
// identificador de correlación.

/** Las tres respuestas de la plantilla. "HORARIO" no elige un bloque todavía:
 *  solo dice que el receptor quiere indicar uno, y eso abre la ventana de 24
 *  horas en la que se le puede mandar la lista (ver la Decisión 8). */
export const ACCIONES_WHATSAPP = ["CONFIRMAR", "RECHAZAR", "HORARIO"] as const;
export type AccionWhatsApp = (typeof ACCIONES_WHATSAPP)[number];

export type PayloadBoton = {
  accion: AccionWhatsApp;
  correlationId: string;
  /** Solo cuando el receptor eligió un bloque de la lista. */
  bloqueHorarioId: string | null;
};

/** Arma el payload que va en un botón. */
export function payloadBoton(
  accion: AccionWhatsApp,
  correlationId: string,
  bloqueHorarioId?: string,
): string {
  const prefijo =
    accion === "HORARIO" && bloqueHorarioId ? `HORARIO_${bloqueHorarioId}` : accion;
  return `${prefijo}:${correlationId}`;
}

/** Lee un payload recibido por webhook. Devuelve null ante cualquier cosa que no
 *  reconozca, y eso es a propósito: el receptor puede escribir texto libre, Meta
 *  puede mandar un evento de otro tipo, y una plantilla vieja puede traer un
 *  formato anterior. Nada de eso puede tumbar el webhook — se ignora y se
 *  contesta 200, que es lo que evita que Meta reintente para siempre. */
export function leerPayloadBoton(payload: unknown): PayloadBoton | null {
  if (typeof payload !== "string") return null;

  const corte = payload.indexOf(":");
  if (corte <= 0) return null;

  const prefijo = payload.slice(0, corte);
  const correlationId = payload.slice(corte + 1).trim();
  if (!correlationId) return null;

  if (prefijo.startsWith("HORARIO_")) {
    const bloqueHorarioId = prefijo.slice("HORARIO_".length);
    // Un bloque que ya no existe (el jefe lo retiró después de mandar el aviso)
    // no puede entrar al dominio: se trata como "quiere indicar un horario" y el
    // conductor lo resuelve por teléfono. Guardarlo igual dejaría un pedido
    // ordenado por una ventana que nadie sabe cuál es.
    if (!bloquePorId(bloqueHorarioId)) return { accion: "HORARIO", correlationId, bloqueHorarioId: null };
    return { accion: "HORARIO", correlationId, bloqueHorarioId };
  }

  const accion = ACCIONES_WHATSAPP.find((a) => a === prefijo);
  return accion ? { accion, correlationId, bloqueHorarioId: null } : null;
}

/** La disponibilidad que corresponde a una respuesta. "HORARIO" sin bloque
 *  elegido NO confirma nada: el receptor todavía tiene que elegir de la lista,
 *  así que el pedido sigue pendiente de respuesta. */
export function disponibilidadDeRespuesta(p: PayloadBoton): Disponibilidad {
  switch (p.accion) {
    case "CONFIRMAR":
      return "confirmado";
    case "RECHAZAR":
      return "rechazado";
    case "HORARIO":
      return p.bloqueHorarioId ? "horario_indicado" : "pendiente_respuesta";
  }
}
