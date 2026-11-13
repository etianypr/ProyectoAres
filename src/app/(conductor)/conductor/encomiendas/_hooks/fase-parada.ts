// En qué paso está la parada activa y qué salidas tiene (sale de pantalla.tsx,
// spec 002 T035). Puro.

import { BLOQUES_HORARIOS, type BloqueHorario } from "@/lib/encomiendas/config";
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
//
//   horas      «Pidió otra hora»: qué bloque (spec 033, otra-hora).
//   juntas     «Pedido entregado» con otra parada en el mismo punto: ¿los dos o
//              solo este? (spec 033, misma-dir).
export type Fase = "en_parada" | "salidas" | "horas" | "juntas";

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
export function faseDeParada(
  activa: Parada | null,
  {
    dandoResultadoDe,
    eligiendoHoraDe = null,
    juntasDe = null,
  }: { dandoResultadoDe: string | null; eligiendoHoraDe?: string | null; juntasDe?: string | null },
): Fase {
  if (activa == null) return "en_parada";
  const id = activa.pedido.id;
  if (juntasDe === id) return "juntas";
  if (eligiendoHoraDe === id) return "horas";
  return dandoResultadoDe === id ? "salidas" : "en_parada";
}

/** «Pidió otra hora» (spec 033): una disponibilidad, no un motivo. Va entre las
 *  salidas solo si queda algún bloque por delante hoy. */
export const OTRA_HORA = { etiqueta: "Pidió otra hora", detalle: "Elegir el bloque" } as const;

/** Los bloques horarios que todavía no terminan (minuto del día de ahora). */
export function bloquesPorDelante(minuto: number, bloques: readonly BloqueHorario[] = BLOQUES_HORARIOS): BloqueHorario[] {
  return bloques.filter((b) => {
    const [h, m] = b.hasta.split(":").map(Number);
    return h * 60 + m > minuto;
  });
}
