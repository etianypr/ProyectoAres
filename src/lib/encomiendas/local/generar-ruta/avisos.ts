// Las frases de la propuesta que el conductor lee antes de salir (salen de
// estrategias.ts, spec 024, que lo dejó en más de 400 líneas). Puras.

import type { FallaOrs } from "@/lib/geo/ors/cliente";
import type { Alternativa } from "./tipos";

/** Por qué la propuesta no tiene el camino por calles (spec 024: el cupo de ORS
 *  se mostraba como «Sin señal»). */
export function avisoSinTrazado(motivo: FallaOrs | null | undefined): string {
  if (motivo === "cupo") {
    return "Sin trazado por calles: OpenRouteService no lo dio, y lo más probable es que se haya acabado su cupo gratis de hoy. El orden de las paradas está listo igual.";
  }
  if (motivo === "error") {
    return "Sin trazado por calles: el servicio de rutas no respondió. El orden de las paradas está listo igual.";
  }
  return "Sin trazado por calles: no hay señal. El orden de las paradas está listo igual y el mapa lo dibuja en cuanto haya conexión.";
}

/** El aviso de la propuesta si con este orden se llega fuera del horario de alguien. */
export function avisoDeHorario(a: Alternativa): string | null {
  if (a.bloquesIncumplidos === 0) return null;
  return a.fueraDeHorario.length === 1
    ? `Con este orden se llegaría fuera del horario que eligió ${a.fueraDeHorario[0]}. Conviene llamarlo.`
    : `Con este orden se llegaría fuera de horario a ${a.fueraDeHorario.length} clientes: ${a.fueraDeHorario.join(", ")}.`;
}
