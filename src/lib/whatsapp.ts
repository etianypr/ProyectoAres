// Adaptador de salida hacia la Cloud API de Meta. Corre SOLO EN EL SERVIDOR.
//
// Por qué en el servidor y no en el teléfono, que es donde viven los pedidos: el
// token de Meta es permanente y da acceso a mandar mensajes en nombre de la
// empresa. Puesto en el navegador, cualquiera que abra las herramientas de
// desarrollo lo copia. Ese es el único motivo por el que esta feature necesita
// un servidor; todo lo demás del módulo del conductor sigue viviendo en el
// teléfono.
//
// ----------------------------------------------------------------------------
// QUÉ DATOS PASAN POR ACÁ, Y QUÉ SE HACE CON ELLOS
//
// Entra: el teléfono del receptor, su nombre de pila y un identificador de
// correlación opaco. Salen los tres hacia Meta, porque la plantilla aprobada los
// necesita para decir "Ana, tu encomienda llega hoy". Y no se guardan en ninguna
// parte: viven en memoria del proceso el tiempo que dura la consulta.
//
// NO SE REGISTRAN EN NINGÚN LOG. Es una regla y no una preferencia: un log con
// el nombre y el teléfono del receptor es exactamente el registro de
// destinatarios que este proyecto decidió no custodiar (principio V de la
// constitución, Ley 21.719). Los errores se reportan con el código de Meta y el
// identificador de correlación, que no dicen quién es nadie.
//
// ----------------------------------------------------------------------------
// SON DOS MENSAJES, NO UNO
//
// La plantilla admite como máximo TRES botones de respuesta rápida, y el
// producto ofrece seis bloques horarios. Además, un mensaje interactivo de lista
// solo se puede mandar dentro de la ventana de 24 horas que abre una respuesta
// del cliente. De ahí el flujo de dos pasos (ver la Decisión 8 de research.md):
//
//   1. enviarAvisoDisponibilidad()  plantilla con "Sí, estaré" / "Mañana" /
//                                   "Otro horario" (ver docs/WHATSAPP.md).
//   2. enviarListaHorarios()        solo si tocó el tercero. Tocarlo ES una
//                                   respuesta, así que la ventana ya está
//                                   abierta y se le puede mandar la lista con
//                                   los seis bloques.

import "server-only";
import {
  BLOQUES_HORARIOS,
  payloadBoton,
  type BloqueHorario,
} from "@/lib/encomiendas/config";
import { ACCIONES_WHATSAPP } from "@/lib/encomiendas/catalogos";

// Versión fijada a mano y no "la última": Meta cambia formas de respuesta entre
// versiones, y un webhook que empieza a recibir otra forma pierde respuestas de
// receptores en silencio. Subirla es una decisión, no algo que deba pasar solo.
const VERSION_API = "v21.0";
const GRAPH = `https://graph.facebook.com/${VERSION_API}`;

/** Se corta a los ocho segundos. El teléfono del conductor está esperando esta
 *  respuesta para poder seguir cargando pedidos: es mejor un "no se pudo,
 *  reintentá" rápido que una pantalla trabada. */
const MS_TIMEOUT = 8_000;

/** Esperas entre reintentos. Dos reintentos y se abandona: si Meta sigue
 *  diciendo que no, el chofer necesita saberlo para llamar por teléfono, no que
 *  la app siga insistiendo sola. */
const MS_BACKOFF = [500, 1_500];

/** Códigos de Meta que NO se reintentan porque el resultado va a ser el mismo:
 *  la plantilla no existe, el número no es de WhatsApp, el token no sirve.
 *  Reintentarlos gasta la cuota y retrasa el aviso que sí se puede resolver. */
const SIN_REINTENTO = new Set([
  131026, // el destinatario no puede recibir el mensaje (no tiene WhatsApp)
  131047, // fuera de la ventana de 24 h: hay que usar plantilla
  132000, // la plantilla no coincide con los parámetros
  132001, // la plantilla no existe
  132005, // el texto excede el largo de la plantilla
  190, // token vencido o inválido
]);

// ----------------------------------------------------------------------------
// Configuración
// ----------------------------------------------------------------------------

type ConfigMeta = {
  token: string;
  phoneNumberId: string;
  plantilla: string;
  idioma: string;
};

/** Lee la configuración del entorno. Devuelve null —y no lanza— cuando falta
 *  algo: la app tiene que poder funcionar sin WhatsApp configurado. Es la
 *  situación normal en desarrollo, y el conductor sigue repartiendo igual;
 *  simplemente no se manda ningún aviso y la pantalla lo dice. */
export function configMeta(): ConfigMeta | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;

  return {
    token,
    phoneNumberId,
    plantilla: process.env.WHATSAPP_PLANTILLA_AVISO ?? "aviso_encomienda",
    idioma: process.env.WHATSAPP_PLANTILLA_IDIOMA ?? "es",
  };
}

export type ResultadoEnvioMeta =
  | { ok: true; mensajeId: string }
  | {
      ok: false;
      /** Mostrable al conductor. Sin datos del receptor y sin el token. */
      error: string;
      /** Código de Meta, para poder diagnosticar sin guardar nada personal. */
      codigo: number | null;
      /** Si vale la pena volver a intentar más tarde. false = hay que resolverlo
       *  de otra forma (llamar por teléfono). */
      reintentable: boolean;
    };

const SIN_CONFIGURAR: ResultadoEnvioMeta = {
  ok: false,
  error: "WhatsApp no está configurado en este servidor.",
  codigo: null,
  reintentable: false,
};

// ----------------------------------------------------------------------------
// El transporte, con timeout y backoff
// ----------------------------------------------------------------------------

type RespuestaMeta = {
  messages?: { id?: string }[];
  error?: { message?: string; code?: number; error_subcode?: number };
};

const dormir = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms));

/** Manda un cuerpo a /messages, con timeout y reintentos.
 *
 *  `esperar` existe para las pruebas: el backoff real haría que la prueba del
 *  reintento tardara dos segundos por caso. Es un parámetro y no una variable de
 *  módulo para que no haya forma de dejarlo cambiado sin darse cuenta. */
async function mandar(
  cuerpo: Record<string, unknown>,
  esperar: (ms: number) => Promise<void> = dormir,
): Promise<ResultadoEnvioMeta> {
  const config = configMeta();
  if (!config) return SIN_CONFIGURAR;

  const url = `${GRAPH}/${config.phoneNumberId}/messages`;
  let ultimo: ResultadoEnvioMeta = SIN_CONFIGURAR;

  for (let intento = 0; intento <= MS_BACKOFF.length; intento++) {
    if (intento > 0) await esperar(MS_BACKOFF[intento - 1]);

    ultimo = await unIntento(url, config.token, cuerpo);
    if (ultimo.ok || !ultimo.reintentable) return ultimo;
  }

  return ultimo;
}

async function unIntento(
  url: string,
  token: string,
  cuerpo: Record<string, unknown>,
): Promise<ResultadoEnvioMeta> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        // El token va en el header y nunca en la URL: una URL termina en los
        // logs de acceso de cualquier proxy que haya en el camino.
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(MS_TIMEOUT),
    });
  } catch {
    // Timeout o red caída. Es lo más reintentable que hay.
    return {
      ok: false,
      error: "No se pudo contactar a WhatsApp. Reintentá en un momento.",
      codigo: null,
      reintentable: true,
    };
  }

  // Cuerpo ilegible: se trata como error del proveedor, no se asume nada.
  const datos = (await res.json().catch(() => null)) as RespuestaMeta | null;

  if (res.ok) {
    const mensajeId = datos?.messages?.[0]?.id;
    if (mensajeId) return { ok: true, mensajeId };
    // 200 sin wamid no debería pasar; si pasa, no se puede correlacionar nada, y
    // dar el envío por bueno dejaría al receptor sin respuesta posible.
    return {
      ok: false,
      error: "WhatsApp aceptó el mensaje pero no devolvió su identificador.",
      codigo: null,
      reintentable: false,
    };
  }

  const codigo = datos?.error?.code ?? null;
  return {
    ok: false,
    // El mensaje de Meta se pasa tal cual: describe el problema del ENVÍO y no
    // contiene datos del receptor. El token no aparece nunca en él.
    error: datos?.error?.message ?? `WhatsApp respondió ${res.status}.`,
    codigo,
    reintentable: esErrorReintentable(res.status, codigo),
  };
}

function esErrorReintentable(estado: number, codigo: number | null): boolean {
  if (codigo != null && SIN_REINTENTO.has(codigo)) return false;
  // 429 (cuota) y 5xx (problema de Meta) pasan solos con el tiempo.
  if (estado === 429 || estado >= 500) return true;
  // 4xx es culpa nuestra: el payload, el número o el token. Reintentar el mismo
  // cuerpo va a dar el mismo error.
  return false;
}

// ----------------------------------------------------------------------------
// 1. El aviso
// ----------------------------------------------------------------------------

export type AvisoDisponibilidad = {
  /** En E.164, ya normalizado (ver lib/telefono.ts). */
  telefono: string;
  /** Nombre de presentación del receptor. Va al cuerpo de la plantilla. */
  nombre: string;
  /** Identificador opaco. Viaja en el payload de los tres botones y vuelve con
   *  la respuesta: es lo que permite resolverla sin guardar el teléfono. */
  correlationId: string;
  /** Contexto de entrega que la plantilla aprobada admite ("hoy", "mañana"). No
   *  se manda la dirección ni el orden de la ruta. */
  cuando: string;
};

/** Manda la plantilla con las tres respuestas del producto.
 *
 *  Los tres botones son exactamente el máximo que Meta permite (spec 010). El
 *  payload de cada uno lleva el identificador de
 *  correlación, así que la respuesta se puede resolver sin consultar ni guardar
 *  nada del receptor. */
export function enviarAvisoDisponibilidad(
  aviso: AvisoDisponibilidad,
  esperar?: (ms: number) => Promise<void>,
): Promise<ResultadoEnvioMeta> {
  const config = configMeta();
  if (!config) return Promise.resolve(SIN_CONFIGURAR);

  return mandar(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: aviso.telefono,
      type: "template",
      template: {
        name: config.plantilla,
        language: { code: config.idioma },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: aviso.nombre },
              { type: "text", text: aviso.cuando },
            ],
          },
          // El índice es la POSICIÓN del botón en la plantilla aprobada, y
          // ACCIONES_WHATSAPP está en ese mismo orden. Si alguien reordena los
          // botones en el panel de Meta y no toca esto, el "sí" del receptor
          // llega como otra cosa: no hay forma de detectarlo desde acá.
          ...ACCIONES_WHATSAPP.map((accion, i) =>
            botonRapido(i, payloadBoton(accion, aviso.correlationId)),
          ),
        ],
      },
    },
    esperar,
  );
}

function botonRapido(indice: number, payload: string) {
  return {
    type: "button",
    sub_type: "quick_reply",
    index: String(indice),
    parameters: [{ type: "payload", payload }],
  };
}

// ----------------------------------------------------------------------------
// 2. La lista de horarios
// ----------------------------------------------------------------------------

/** Largo máximo del título de una fila en un mensaje de lista de Meta. Las
 *  etiquetas de los bloques ("08:00 - 10:00") miden 13, así que sobra; el corte
 *  está para que agregar un bloque con nombre largo no haga fallar el envío
 *  entero. */
const MAX_TITULO_FILA = 24;

/** Manda los bloques horarios como mensaje de lista.
 *
 *  Solo se puede llamar DESPUÉS de que el receptor tocó "Indicar un horario":
 *  este no es un mensaje de plantilla, así que necesita la ventana de 24 horas
 *  que abre una respuesta suya. Mandarlo antes lo rechaza Meta con el código
 *  131047, que justamente por eso está en la lista de los que no se reintentan. */
export function enviarListaHorarios(
  {
    telefono,
    correlationId,
    bloques = BLOQUES_HORARIOS,
  }: {
    telefono: string;
    correlationId: string;
    /** Los que el jefe dejó activos. Por defecto los seis iniciales. */
    bloques?: readonly BloqueHorario[];
  },
  esperar?: (ms: number) => Promise<void>,
): Promise<ResultadoEnvioMeta> {
  if (!configMeta()) return Promise.resolve(SIN_CONFIGURAR);

  // Meta rechaza una lista vacía. Si el jefe desactivó todos los bloques, esto
  // no es un error de red que haya que reintentar: es una configuración que
  // alguien tiene que arreglar, y el chofer necesita saberlo para llamar.
  if (bloques.length === 0) {
    return Promise.resolve({
      ok: false,
      error: "No hay bloques horarios activos para ofrecerle al receptor.",
      codigo: null,
      reintentable: false,
    });
  }

  return mandar(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: telefono,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "¿En qué horario podrías recibir la encomienda?" },
        action: {
          button: "Ver horarios",
          sections: [
            {
              title: "Horarios disponibles",
              rows: bloques.map((b) => ({
                // El id de la fila es el mismo payload que los botones: así el
                // webhook lee las dos cosas con el mismo codec.
                id: payloadBoton("HORARIO", correlationId, b.id),
                title: b.etiqueta.slice(0, MAX_TITULO_FILA),
              })),
            },
          ],
        },
      },
    },
    esperar,
  );
}
