// ¿El cliente contestó? (spec 015, data-model "Regla de la llamada").
//
// Pura: recibe lo que el plugin leyó del registro de llamadas —solo las llamadas
// al número marcado, sin el número— y decide. El emparejamiento por los últimos
// 8 dígitos lo hace el plugin en el teléfono (TelefonoPlugin.java).
import type { EntradaRegistro } from "./telefono";

/** Segundos de conversación desde los que cuenta como contestada. Menos que esto
 *  es un corte, un "ocupado" o un buzón que se cerró al tiro. */
export const SEGUNDOS_CONTESTO = 5;
/** Tolerancia hacia atrás: el registro anota el inicio de la llamada y puede
 *  quedar un instante antes del toque guardado en la app. */
export const MS_TOLERANCIA = 2000;

export type ResultadoDetectado = "contesto" | "no_contesto";

/** La saliente más reciente hecha desde `desdeMs`: ≥ 5 s de conversación →
 *  "contesto"; si no → "no_contesto". Sin datos o sin saliente → null (no se
 *  sabe: la pantalla pregunta como siempre). */
export function resultadoDeLlamada(
  entradas: EntradaRegistro[] | null,
  desdeMs: number,
): ResultadoDetectado | null {
  if (!entradas) return null;
  const ultima = entradas
    .filter((e) => e.tipo === "saliente" && e.fechaMs >= desdeMs - MS_TOLERANCIA)
    .sort((a, b) => b.fechaMs - a.fechaMs)[0];
  if (!ultima) return null;
  return ultima.duracionS >= SEGUNDOS_CONTESTO ? "contesto" : "no_contesto";
}
