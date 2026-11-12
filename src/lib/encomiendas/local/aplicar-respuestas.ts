"use client";

// Validar y aplicar las respuestas que bajan de GET /api/whatsapp/status (pasos
// 3 y 4 de sincronizar-whatsapp.ts). Va aparte para que ese archivo no pase las
// 400 líneas (spec 004).

import { registrarDisponibilidad, registrarRespuestaDireccion } from "./almacen";
import { bloquePorId, leerAccion, limpiarTextoReceptor } from "@/lib/encomiendas/config";
import { respuestaDeAccion } from "@/lib/encomiendas/estados";
import type { RespuestaAplicada } from "./replanificar";
import type { RespuestaPendiente } from "@/lib/encomiendas/contrato-whatsapp";

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
  // parte. Se degrada a "quiere indicar un horario" y el conductor lo resuelve
  // llamando, que es la recuperación accionable que pide la constitución.
  const bloqueCrudo = typeof r.bloqueHorarioId === "string" ? r.bloqueHorarioId : null;
  const bloqueHorarioId = bloquePorId(bloqueCrudo) ? bloqueCrudo : null;

  const recibidoEn =
    typeof r.recibidoEn === "string" && !Number.isNaN(Date.parse(r.recibidoEn))
      ? r.recibidoEn
      : new Date().toISOString();

  // Lo escrito por el receptor se limpia de nuevo acá: lo escribió un desconocido.
  const texto = limpiarTextoReceptor(r.texto);

  return { pedidoId, mensajeId, accion: accionValida, bloqueHorarioId, texto, recibidoEn };
}

/** Si esta respuesta obliga a mandarle al receptor la lista de bloques. Es la
 *  segunda mitad del flujo de dos pasos: la plantilla solo admite tres botones,
 *  así que los cinco bloques van en un mensaje aparte que recién se puede mandar
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
  /** Receptores que contestaron «No, es otra» (spec 004): su pedido quedó con ⚠. */
  direccionesNuevas: number;
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
  conductorId: string,
): Promise<ResultadoAplicado> {
  const resultado: ResultadoAplicado = {
    aplicadas: 0,
    descartadas: 0,
    confirmar: [],
    pedirHorarios: [],
    cambios: [],
    direccionesNuevas: 0,
  };

  for (const cruda of crudas) {
    const respuesta = validarRespuesta(cruda);
    // Una fila que no se entiende no se confirma: si el servidor la mandó mal,
    // confirmarla la borraría y nadie se enteraría del problema.
    if (!respuesta) continue;

    if (respuesta.accion === "DIRECCION_SI" || respuesta.accion === "DIRECCION_NO") {
      const confirma = respuesta.accion === "DIRECCION_SI";
      try {
        const cambio = await registrarRespuestaDireccion(
          respuesta.pedidoId,
          { confirma, texto: respuesta.texto },
          respuesta.mensajeId,
        );
        if (cambio) {
          resultado.aplicadas++;
          if (!confirma) resultado.direccionesNuevas++;
        } else {
          resultado.descartadas++;
        }
        resultado.confirmar.push(respuesta.mensajeId);
      } catch {
        // Igual que abajo: queda en el servidor y vuelve a bajar.
      }
      continue;
    }

    const disponibilidad = respuestaDeAccion(respuesta.accion, respuesta.bloqueHorarioId);

    try {
      if (disponibilidad) {
        const cambio = await registrarDisponibilidad(
          respuesta.pedidoId,
          disponibilidad,
          respuesta.mensajeId,
          conductorId,
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
