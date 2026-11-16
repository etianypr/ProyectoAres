// Las frases de la propuesta que el conductor lee antes de salir (salen de
// estrategias.ts, spec 024, que lo dejó en más de 400 líneas). Puras.

import type { FallaOrs } from "@/lib/geo/ors/cliente";
import type { Alternativa } from "./tipos";

/** Por qué la propuesta no tiene el camino por calles (spec 024: el cupo de ORS
 *  se mostraba como «Sin señal»). */
export function avisoSinTrazado(motivo: FallaOrs | null | undefined): string {
  if (motivo === "cupo") {
    return "Sin trazado por calles: OpenRouteService no respondió, probablemente por haberse agotado la cuota gratuita de hoy. El orden de las paradas no cambia.";
  }
  if (motivo === "error") {
    return "Sin trazado por calles: el servicio de rutas no respondió. El orden de las paradas no cambia.";
  }
  return "Sin trazado por calles: no hay conexión. El orden de las paradas no cambia y el mapa lo trazará al recuperar la conexión.";
}

/** El aviso de la propuesta si con este orden se llega fuera del horario de alguien. */
export function avisoDeHorario(a: Alternativa): string | null {
  if (a.bloquesIncumplidos === 0) return null;
  return a.fueraDeHorario.length === 1
    ? `Con este orden se llegaría fuera del horario solicitado por ${a.fueraDeHorario[0]}. Se recomienda llamar.`
    : `Con este orden se llegaría fuera de horario a ${a.fueraDeHorario.length} clientes: ${a.fueraDeHorario.join(", ")}.`;
}
