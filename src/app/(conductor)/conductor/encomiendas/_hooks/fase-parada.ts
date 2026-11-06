// En qué paso está la parada activa y qué salidas tiene (sale de pantalla.tsx,
// spec 002 T035). Puro.

import type { Parada } from "./use-dia-trabajo";

// En qué paso del trato con ESTA parada está el conductor.
//
//   en_parada  la parada a la vista: "Pedido entregado", llamar y "No se entrega".
//   salidas    no se entrega: qué se hace con esta parada.
//
// Hasta el 2026-11-06 había tres pasos más alrededor de la llamada (antes de
// llamar, "¿contestó?" y confirmado). El dueño los sacó: hay personas que no
// contestan y reciben igual, y saber si contestó no ayuda a repartir; llamar es
// solo para coordinar la entrega (spec 020).
export type Fase = "en_parada" | "salidas";

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

/** En qué paso está la parada activa: el único estado de pantalla que no se
 *  deduce de los datos es si el conductor está eligiendo una salida. Pura. */
export function faseDeParada(activa: Parada | null, { dandoResultadoDe }: { dandoResultadoDe: string | null }): Fase {
  return activa != null && dandoResultadoDe === activa.pedido.id ? "salidas" : "en_parada";
}
