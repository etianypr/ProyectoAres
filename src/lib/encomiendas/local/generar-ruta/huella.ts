// La huella de una propuesta (sale de index.ts, spec 038, para que no pase de 400 líneas).

import type { Coordenada } from "@/lib/geo/coordenada";
import type { PedidoUbicado } from "./tipos";

/** Huella de TODO lo que entra en el cálculo de una ruta. Si no cambió ni un
 *  pedido, ni su ubicación, ni su horario, ni quién confirmó, ni sus bultos
 *  (spec 024), ni de dónde y a qué hora se parte, la ruta que saldría es la misma y no hay nada que
 *  preguntarle a OpenRouteService. Antes no miraba los horarios: un cliente que eligió
 *  bloque seguía recibiendo la propuesta vieja (spec 017, R3).
 *
 *  `minutosDeInicio` es null cuando ningún pedido tiene bloque: la hora solo decide
 *  qué bloques se alcanzan (planificar.ts, avisos.ts), y sin bloques la propuesta
 *  es la misma a cualquier hora. Así la propuesta se repite aunque pase el cuarto de
 *  hora (spec 038). */
export function huella(
  fecha: string,
  base: Coordenada,
  llegada: Coordenada,
  ubicados: PedidoUbicado[],
  minutosDeInicio: number | null,
): string {
  const paradas = ubicados
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:${p.bloqueHorarioId ?? ""}:${p.disponibilidad}:${p.bultos ?? ""}`)
    .sort()
    .join("|");
  // La partida se redondea a ~10 m: partiendo del GPS, un metro de diferencia
  // entre dos lecturas no cambia el orden de treinta paradas. La hora, al cuarto
  // de hora: cambia qué bloques se alcanzan.
  const cuarto = minutosDeInicio == null ? "-" : Math.floor(minutosDeInicio / 15);
  return `${fecha}|${base.lat.toFixed(4)},${base.lng.toFixed(4)}>${llegada.lat.toFixed(4)},${llegada.lng.toFixed(4)}|${cuarto}|${paradas}`;
}
