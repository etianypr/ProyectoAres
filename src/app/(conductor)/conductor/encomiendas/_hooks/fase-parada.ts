// En qué paso está la parada activa y qué salidas tiene (sale de pantalla.tsx,
// spec 002 T035). Puro.

import type { Parada } from "./use-dia-trabajo";

// En qué paso del trato con ESTA parada está el conductor.
//
//   antes_llamar         hay que contactarlo: no contestó el WhatsApp.
//   esperando_resultado  se lo llamó y hay que decir qué pasó con la llamada:
//                        contestó, volver a llamar, o no contestó. Es la ÚNICA
//                        pregunta de esta etapa, y se sigue en ella mientras la
//                        llamada no haya sido contestada.
//   confirmado           contestó la llamada y espera el paquete.
//   esperando_entrega    ya había confirmado por WhatsApp, así que no hace falta
//                        llamarlo: se va derecho a entregar. Es lo que hace que
//                        avisarle por WhatsApp AHORRE trabajo en terreno y no
//                        solo agregue información. Solo para ese caso.
//   salidas              no se pudo entregar: qué se hace con esta parada.
//
// Acá había una fase más, "eligiendo": no contestó la llamada y se preguntaba
// "¿dejar al final o cerrar la parada?" ANTES de preguntar por qué. Eran dos
// pantallas para una sola decisión —qué hago con esta puerta— y obligaban a
// elegir una categoría antes de poder elegir la respuesta. Ahora las tres
// salidas están juntas en "salidas".
export type Fase =
  | "antes_llamar"
  | "esperando_resultado"
  | "confirmado"
  | "esperando_entrega"
  | "salidas";

/** Las dos salidas de una parada que no se pudo cerrar entregando.
 *
 *  "Dejar como pendiente" NO cierra la parada: la deja donde menos alarga, al
 *  menos media hora más adelante (spec 017, R4). No genera ningún evento, así
 *  que tampoco hay nada que deshacer.
 *
 *  "No entregado" la tacha por hoy, sin motivo (spec 012): no se decide si es
 *  temporal o para siempre. Si el paquete vuelve a salir otro día, se escanea
 *  de nuevo. Es lo mismo que deja el receptor que pide "Mañana". */
export const SALIDAS = [
  {
    clave: "pendiente",
    etiqueta: "Dejar como pendiente",
    aviso: "Se reintenta más tarde",
    detalle: "Se reintenta más tarde, de pasada",
  },
  {
    clave: "no_entregado",
    etiqueta: "No entregado",
    aviso: "Marcado: no entregado",
    detalle: "Se tacha por hoy",
  },
] as const;

export type Salida = (typeof SALIDAS)[number];

/** En qué paso está la parada activa. Se decide por lo GUARDADO (la llamada) y
 *  por los dos estados de pantalla que no se pueden deducir de los datos. Pura. */
export function faseDeParada(
  activa: Parada | null,
  {
    dandoResultadoDe,
    esperandoResultadoDe,
  }: { dandoResultadoDe: string | null; esperandoResultadoDe: string | null },
): Fase {
  return (
    activa == null
      ? "antes_llamar"
      : dandoResultadoDe === activa.pedido.id
        ? "salidas"
        : esperandoResultadoDe === activa.pedido.id
          ? "esperando_resultado"
          : activa.pedido.llamada === "contesto"
            ? "confirmado"
            : // Se lo llamó y no contestó: se queda en la misma pregunta —qué pasó
              // con la llamada— y no pasa a la de entregar.
              //
              // Esta rama es la que faltaba, y su ausencia era un agujero, no una
              // decisión. "esperando_entrega" existe para UN caso: el receptor
              // confirmó por WhatsApp que va a estar, así que no hay nada que
              // preguntarle por teléfono. Pero se caía en ella también por
              // descarte, porque hayQueContactar significa "falta llamarlo" y deja
              // de ser cierto en cuanto se lo llamó — conteste o no conteste. Así,
              // volver atrás de las salidas aterrizaba en una tercera pantalla que
              // nadie diseñó: el renglón decía "No contestó la llamada" y abajo
              // ofrecía "Pedido finalizado" como acción principal, más un segundo
              // "Llamar" y un "No se pudo" que son el mismo triple otra vez.
              //
              // Se decide por el DATO guardado y no por el estado de pantalla:
              // cerrar la app y volver a abrirla con la parada así vuelve al mismo
              // lugar, en vez de aparecer en la pantalla de entregar.
              activa.pedido.llamada === "no_contesto"
              ? "esperando_resultado"
              : !activa.hayQueContactar
                ? "esperando_entrega"
                : "antes_llamar"
  );
}
