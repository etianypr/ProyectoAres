"use client";

// El lado del TELÉFONO de la coordinación por WhatsApp.
//
// Hay que tener claro el problema que resuelve este archivo, porque no es
// obvio: el pedido vive solo acá (IndexedDB) y la respuesta del receptor llega
// solo allá (el webhook, en el servidor). Ninguna de las dos puntas puede
// escribir en la otra. La solución elegida —y validada antes de escribir una
// línea de la integración, ver la Decisión 7 de research.md— es que el teléfono
// vaya a BUSCAR las respuestas y las aplique él mismo:
//
//   1. el teléfono pide el envío del aviso            → POST /api/whatsapp/send
//   2. el receptor toca un botón; Meta avisa al servidor → webhook
//   3. el teléfono consulta qué llegó                 → GET  /api/whatsapp/status
//   4. el teléfono lo escribe en IndexedDB            → registrarDisponibilidad
//   5. recién ahí confirma que lo aplicó              → POST /api/whatsapp/status
//
// El orden de 4 y 5 no es negociable, y es el mismo criterio que ya tiene la
// cola de actividad (ver quitarDeCola en almacen/cola.ts): primero el dato queda
// firme donde lo va a usar el chofer, después se avisa que se puede olvidar. Al
// revés, un teléfono que se apaga entre bajar la respuesta y guardarla dejaría
// esa respuesta marcada como entregada y no volvería a bajar nunca: el receptor
// habría confirmado y el conductor no se enteraría jamás.
//
// Este archivo NO habla con Meta. El token permanente no puede salir al
// navegador, así que todo pasa por las rutas del propio servidor.

import {
  marcarHorariosEnviados,
  registrarDisponibilidad,
  registrarAvisoEnviado,
  registrarAvisoFallido,
  type Pedido,
} from "./almacen";
import { bloquePorId, leerAccion } from "@/lib/encomiendas/config";
import { respuestaDeAccion } from "@/lib/encomiendas/estados";
import type { RespuestaAplicada } from "./replanificar";
import {
  RUTA_ENVIO,
  RUTA_RESPUESTAS,
  type ConfirmarAplicadas,
  type PedidoEnvio,
  type RespuestaPendiente,
} from "@/lib/encomiendas/contrato-whatsapp";

// ----------------------------------------------------------------------------
// Lo que devuelve GET /api/whatsapp/status
// ----------------------------------------------------------------------------

/** Valida una fila cruda venida de la red. Devuelve null en vez de lanzar: una
 *  respuesta malformada no puede tumbar la sincronización de las demás, y
 *  además esto es lo que impide que un dato inesperado del servidor termine
 *  escrito en IndexedDB.
 *
 *  Se valida aunque el servidor sea nuestro. El contenido original lo eligió
 *  Meta a partir de lo que tocó un desconocido, así que en el camino hay un dato
 *  no confiable; y el día que la ruta cambie de forma, es preferible perder una
 *  respuesta que corromper el pedido. */
export function validarRespuesta(cruda: unknown): RespuestaPendiente | null {
  if (typeof cruda !== "object" || cruda === null) return null;
  const r = cruda as Record<string, unknown>;

  const pedidoId = typeof r.pedidoId === "string" ? r.pedidoId.trim() : "";
  const mensajeId = typeof r.mensajeId === "string" ? r.mensajeId.trim() : "";
  const accion = r.accion;
  if (!pedidoId || !mensajeId) return null;
  const accionValida = leerAccion(accion);
  if (!accionValida) return null;

  // Un bloque que el jefe retiró después de mandar el aviso no se guarda: el
  // pedido quedaría ordenado por una ventana horaria que ya no existe en ninguna
  // parte. Se degrada a "quiere indicar un horario" y el chofer lo resuelve
  // llamando, que es la recuperación accionable que pide la constitución.
  const bloqueCrudo = typeof r.bloqueHorarioId === "string" ? r.bloqueHorarioId : null;
  const bloqueHorarioId = bloquePorId(bloqueCrudo) ? bloqueCrudo : null;

  const recibidoEn =
    typeof r.recibidoEn === "string" && !Number.isNaN(Date.parse(r.recibidoEn))
      ? r.recibidoEn
      : new Date().toISOString();

  return { pedidoId, mensajeId, accion: accionValida, bloqueHorarioId, recibidoEn };
}

/** Si esta respuesta obliga a mandarle al receptor la lista de bloques. Es la
 *  segunda mitad del flujo de dos pasos: la plantilla solo admite tres botones,
 *  así que los seis bloques van en un mensaje aparte que recién se puede mandar
 *  porque el receptor, al tocar el botón, abrió la ventana de 24 horas. */
export function pideListaDeHorarios(r: RespuestaPendiente): boolean {
  return r.accion === "HORARIO" && r.bloqueHorarioId == null;
}

// ----------------------------------------------------------------------------
// Aplicar un lote
// ----------------------------------------------------------------------------

export type ResultadoAplicado = {
  /** Respuestas que cambiaron el pedido. */
  aplicadas: number;
  /** Bajadas y descartadas: repetidas, o de un pedido ya cerrado. Se confirman
   *  al servidor igual: ya están resueltas. */
  descartadas: number;
  /** Ids de mensaje que el servidor ya puede dejar de mandar. Incluye las
   *  descartadas a propósito: si no, volverían a bajar en cada consulta. */
  confirmar: string[];
  /** Pedidos a los que hay que mandarles la lista de bloques horarios. */
  pedirHorarios: string[];
  /** Respuestas aplicadas que pueden mover la ruta en curso ("Mañana", un bloque). */
  cambios: RespuestaAplicada[];
};

/** Escribe un lote de respuestas en IndexedDB.
 *
 *  Va de a una y en serie, no en paralelo: cada `registrarDisponibilidad` toma
 *  turno en la fila del almacén (ver su comentario), así que lanzarlas todas
 *  juntas no las haría más rápidas y sí haría más difícil saber cuál falló.
 *
 *  Una respuesta que falla al escribirse NO se confirma: queda en el servidor y
 *  vuelve a bajar en la próxima consulta. */
export async function aplicarRespuestas(
  crudas: unknown[],
  /** Para el evento de no entrega que deja "Mañana". */
  choferId: string,
): Promise<ResultadoAplicado> {
  const resultado: ResultadoAplicado = {
    aplicadas: 0,
    descartadas: 0,
    confirmar: [],
    pedirHorarios: [],
    cambios: [],
  };

  for (const cruda of crudas) {
    const respuesta = validarRespuesta(cruda);
    // Una fila que no se entiende no se confirma: si el servidor la mandó mal,
    // confirmarla la borraría y nadie se enteraría del problema.
    if (!respuesta) continue;

    const disponibilidad = respuestaDeAccion(respuesta.accion, respuesta.bloqueHorarioId);

    try {
      if (disponibilidad) {
        const cambio = await registrarDisponibilidad(
          respuesta.pedidoId,
          disponibilidad,
          respuesta.mensajeId,
          choferId,
        );
        if (cambio) {
          resultado.aplicadas++;
          if (disponibilidad.tipo !== "confirmado") {
            resultado.cambios.push({ pedidoId: respuesta.pedidoId, tipo: disponibilidad.tipo });
          }
        } else {
          resultado.descartadas++;
        }
      } else {
        // "Quiere indicar un horario": no hay disponibilidad que escribir, pero
        // la respuesta está atendida y hay que mandarle la lista.
        resultado.descartadas++;
      }

      if (pideListaDeHorarios(respuesta)) resultado.pedirHorarios.push(respuesta.pedidoId);
      resultado.confirmar.push(respuesta.mensajeId);
    } catch {
      // El teléfono no pudo guardar (modo privado, sin espacio). Se deja en el
      // servidor y se reintenta; el error general ya lo muestra la pantalla.
    }
  }

  return resultado;
}

// ----------------------------------------------------------------------------
// Qué pedidos necesitan un aviso
// ----------------------------------------------------------------------------

/** Cuántas veces se reintenta el aviso de un pedido antes de dejar de insistir.
 *  Un número sin WhatsApp falla siempre igual, y seguir intentando gasta
 *  créditos de Meta y esconde el caso que el chofer tiene que resolver llamando. */
export const MAX_INTENTOS_AVISO = 3;

/** De una lista de pedidos, los que todavía no tienen aviso mandado y pueden
 *  recibirlo. Se consulta al confirmar la ruta (FR-007) y en cada sondeo.
 *
 *  Quedan fuera los que ya tienen un aviso enviado —mandarlo dos veces le llega
 *  al receptor dos veces— y los que agotaron los reintentos. */
export function pedidosSinAviso<T extends Pedido>(pedidos: T[]): T[] {
  return pedidos.filter(
    ({ aviso }) =>
      aviso.estado === "pendiente" || (aviso.estado === "fallido" && aviso.intentos < MAX_INTENTOS_AVISO),
  );
}

// ----------------------------------------------------------------------------
// Hablar con el servidor
// ----------------------------------------------------------------------------
//
// Las tres funciones de abajo son las únicas que salen a la red en este módulo,
// y ninguna lanza: el conductor tiene que poder seguir repartiendo con el
// servidor caído, exactamente igual que con la cola de actividad. Un fallo se
// devuelve como dato para que la pantalla pueda ofrecer el reintento o el
// contacto manual (principio IV de la constitución).

/** Un error de red o del servidor, ya listo para mostrar. */
export type FalloEnvio = { error: string; reintentable: boolean };

async function pedir(
  url: string,
  opciones: RequestInit,
): Promise<{ ok: true; datos: Record<string, unknown> } | { ok: false } & FalloEnvio> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...opciones,
      headers: { "Content-Type": "application/json", ...(opciones.headers ?? {}) },
      // La sesión va en cookie; sin esto el servidor no sabe quién pregunta.
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", reintentable: true };
  }

  // El cuerpo puede no ser JSON si algo se interpuso (un portal cautivo de wifi
  // devolviendo HTML es el caso real en la periferia). No puede tumbar nada.
  const datos = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    return {
      ok: false,
      error: typeof datos?.error === "string" ? datos.error : `El servidor respondió ${res.status}.`,
      // Si el servidor dijo explícitamente si vale reintentar, se le cree. Si no,
      // se reintenta solo lo que puede cambiar con el tiempo: un 5xx.
      reintentable: typeof datos?.reintentable === "boolean" ? datos.reintentable : res.status >= 500,
    };
  }

  return { ok: true, datos: datos ?? {} };
}

/** Pide que salga el aviso de un pedido y anota el resultado en IndexedDB.
 *
 *  El nombre y el teléfono se mandan en el cuerpo porque la plantilla de Meta los
 *  necesita; el servidor los usa y no los guarda (ver la ruta de envío y la
 *  migración 0003). Lo que queda del lado del servidor es una correlación opaca.
 *
 *  Devuelve null si salió bien. */
export async function pedirAviso(
  pedido: Pedido,
  fecha: string,
): Promise<FalloEnvio | null> {
  const r = await pedir(RUTA_ENVIO, {
    method: "POST",
    body: JSON.stringify({
      tipo: "aviso",
      pedidoId: pedido.id,
      fecha,
      nombre: pedido.nombre,
      telefono: pedido.telefono,
    } satisfies PedidoEnvio),
  });

  if (!r.ok) {
    // El intento se cuenta igual, y por eso se anota antes de devolver: es lo que
    // frena el reintento eterno de un número que va a fallar siempre.
    await registrarAvisoFallido(pedido.id, r.error);
    return { error: r.error, reintentable: r.reintentable };
  }

  // El contrato HTTP conserva "correlationId" hasta renombrar la base (spec 002).
  const codigo = typeof r.datos.correlationId === "string" ? r.datos.correlationId : null;
  if (!codigo) {
    // No debería pasar. Sin código no hay forma de recibir la respuesta, así que
    // se trata como fallo en vez de darlo por bueno.
    await registrarAvisoFallido(pedido.id, "El servidor no devolvió el código del aviso.");
    return { error: "El aviso no quedó registrado. Reintentá.", reintentable: true };
  }

  await registrarAvisoEnviado({
    pedidoId: pedido.id,
    codigo,
    mensajeId: typeof r.datos.mensajeId === "string" ? r.datos.mensajeId : null,
  });
  return null;
}

/** Manda la lista de bloques horarios a un receptor que pidió indicar uno.
 *
 *  Es el segundo mensaje del flujo de dos pasos: solo se puede mandar porque el
 *  receptor, al tocar el botón, abrió la ventana de 24 horas (Decisión 8). */
export async function pedirListaHorarios(
  pedido: Pedido,
  fecha: string,
): Promise<FalloEnvio | null> {
  const r = await pedir(RUTA_ENVIO, {
    method: "POST",
    body: JSON.stringify({
      tipo: "horarios",
      pedidoId: pedido.id,
      fecha,
      telefono: pedido.telefono,
    } satisfies PedidoEnvio),
  });

  if (!r.ok) return { error: r.error, reintentable: r.reintentable };

  // Se anota para no repetir la lista si la sincronización vuelve a ver la misma
  // respuesta antes de que el receptor elija.
  await marcarHorariosEnviados(pedido.id);
  return null;
}

export type ResultadoSincronizacion = {
  /** Respuestas que cambiaron un pedido. */
  aplicadas: number;
  /** Pedidos a los que hay que mandarles la lista de bloques. */
  pedirHorarios: string[];
  /** Lo que puede mover la ruta en curso (ver replanificarRuta). */
  cambios: RespuestaAplicada[];
  /** Mostrable, o null si todo salió bien. */
  error: string | null;
};

/** Baja las respuestas del servidor, las escribe en IndexedDB y recién entonces
 *  las confirma.
 *
 *  EL ORDEN DE LOS TRES PASOS NO ES NEGOCIABLE, y es el mismo criterio que la
 *  cola de actividad: primero el dato queda firme donde lo va a usar el chofer,
 *  después se avisa que se puede olvidar. Al revés, un teléfono que se apaga en
 *  el medio deja la respuesta marcada como aplicada y no vuelve a bajar nunca:
 *  el receptor habría confirmado y el conductor no se enteraría jamás.
 *
 *  Si la confirmación falla no pasa nada grave: la respuesta vuelve a bajar y
 *  aplicarla otra vez no cambia el pedido (es idempotente por mensajeId). */
export async function sincronizarDisponibilidad(
  choferId: string,
): Promise<ResultadoSincronizacion> {
  const vacio = { aplicadas: 0, pedirHorarios: [] as string[], cambios: [] as RespuestaAplicada[] };

  const bajada = await pedir(RUTA_RESPUESTAS, { method: "GET" });
  if (!bajada.ok) return { ...vacio, error: bajada.error };

  const crudas = Array.isArray(bajada.datos.respuestas) ? bajada.datos.respuestas : [];
  if (crudas.length === 0) return { ...vacio, error: null };

  // Paso 2: escribir en el teléfono.
  const aplicado = await aplicarRespuestas(crudas, choferId);

  // Paso 3: confirmar solo lo que quedó resuelto. Lo que no se pudo escribir no
  // se confirma, y vuelve a bajar en la próxima pasada.
  if (aplicado.confirmar.length > 0) {
    const confirmacion = await pedir(RUTA_RESPUESTAS, {
      method: "POST",
      body: JSON.stringify({ aplicadas: aplicado.confirmar } satisfies ConfirmarAplicadas),
    });
    if (!confirmacion.ok) {
      // No se pierde nada: las respuestas ya están en IndexedDB y volverán a
      // bajar.
      return {
        aplicadas: aplicado.aplicadas,
        pedirHorarios: aplicado.pedirHorarios,
        cambios: aplicado.cambios,
        error: null,
      };
    }
  }

  return {
    aplicadas: aplicado.aplicadas,
    pedirHorarios: aplicado.pedirHorarios,
    cambios: aplicado.cambios,
    error: null,
  };
}
