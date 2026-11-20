// Calles aprendidas (spec 044; dueño, 2026-11-20: «que cada corrección quede guardada para un
// aprendizaje de la aplicación»). Cómo viene escrita una calle → cómo se llama: «ORIZOMBO BARBOZA»
// → «Orozimbo Barbosa». Sin número de casa ni nada de una persona.
//
// Este módulo no guarda nada: tiene la lista en memoria para ubicar (`conCalleAprendida`) y avisa
// lo que hay que aprender a quien lo guarda (el teléfono y Supabase: local/calles-aprendidas.ts,
// que se engancha con `fijarAprendizaje`). Así lib/geo no toca IndexedDB ni el servidor.
//
// No se aprende lo que cambiaría la calle de otras casas, ni lo que no es un error de lectura:
//   · una calle oficial que no se parece a la escrita (esLaCalleParecida);
//   · un nombre genérico o una calle que está en varios lugares («Pasaje 1»), que dependen del lugar;
//   · una calle escrita que calza con dos o más del catálogo («Linderos»: Poniente y Oriente); un
//     número la eligió para esa casa, no para todas;
//   · un número de 3 dígitos o más (sería el de la casa).

import { callesSimilares } from "./calles";
import { esLaCalleParecida, normalizar } from "./consulta";
import { lugaresDeCalle } from "./lugares";
import { calleYNumero } from "./referencias";

export type FuenteAprendida = "conductor" | "ia" | "google";

/** La clave de una calle escrita: minúsculas, sin tildes y con los espacios juntos. */
export const claveDeCalle = (calle: string) => normalizar(calle).replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

let aprendidas = new Map<string, string>();
let alAprender: ((escrita: string, oficial: string, fuente: FuenteAprendida) => void | Promise<void>) | null = null;

/** La lista que tiene el teléfono (y que trae de Supabase). */
export function fijarCallesAprendidas(filas: { escrita: string; oficial: string }[]): void {
  aprendidas = new Map(filas.map((f) => [f.escrita, f.oficial]));
}

/** Quién guarda lo aprendido. null: nadie (las pruebas, el servidor). */
export function fijarAprendizaje(guardar: typeof alAprender): void {
  alAprender = guardar;
}

/** La consulta con la calle aprendida en vez de la escrita, si se conoce: «ORIZOMBO BARBOZA 2318» →
 *  «Orozimbo Barbosa 2318». Sin número, la calle sola. */
export function conCalleAprendida(consulta: string): string {
  if (aprendidas.size === 0) return consulta;
  const { calle, numero } = calleYNumero(consulta);
  const oficial = aprendidas.get(claveDeCalle(calle));
  if (!oficial) return consulta;
  return numero ? `${oficial} ${numero}` : oficial;
}

const NOMBRE_GENERICO = /^(?:pasaje|pje|psje|pj|calle|nueva)\s+(?:\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)$|^\d+\s+(?:norte|sur|oriente|poniente)$/i;

/** Aprende «calle escrita → calle oficial» si vale la pena y no es peligroso (ver arriba). Nunca
 *  lanza: aprender es un extra, no puede trabar ubicar una dirección. */
export async function aprenderCalle(escrita: string, oficial: string, fuente: FuenteAprendida): Promise<void> {
  try {
    const clave = claveDeCalle(escrita);
    const nombre = oficial.trim();
    if (!alAprender || clave.length < 3 || nombre.length < 3) return;
    if (/\d{3,}/.test(clave) || /\d{3,}/.test(nombre)) return;
    if (clave === claveDeCalle(nombre) || aprendidas.get(clave) === nombre) return;
    if (NOMBRE_GENERICO.test(clave) || NOMBRE_GENERICO.test(nombre)) return;
    // Una calle que no se parece a la escrita no es un error de lectura (el destinatario se mudó,
    // la guía traía otra calle): no se aprende.
    if (!esLaCalleParecida(escrita, nombre)) return;
    if ((await lugaresDeCalle(nombre)).length >= 2) return;
    if ((await callesSimilares(escrita)).length >= 2) return;
    aprendidas.set(clave, nombre);
    await alAprender(clave, nombre, fuente);
  } catch {
    // Sin catálogo o sin poder guardar: se aprenderá la próxima vez.
  }
}
