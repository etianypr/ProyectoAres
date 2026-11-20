// La dirección de la parada en corto: solo la calle y su número, como se lee en la burbuja
// (spec 046; dueño, 2026-11-20). El depto, la referencia, la población y «Arica» quedan en
// el pedido y en la pestaña de ARES; la burbuja es angosta y lo que importa ahí es adónde
// ir. La calle y el número van separados: si no cabe, se corta la calle y nunca el número.
// Puro, sin red.

import { normalizarConsulta } from "@/lib/geo/geocoding/consulta";
import { calleYNumero, separarReferencias } from "@/lib/geo/geocoding/referencias";

export type DireccionCorta = { calle: string; numero: string | null };

/** El tipo de calle abreviado: «Avenida» → «Av.», «Pasaje» → «Pje.». */
const TIPOS: [RegExp, string][] = [
  [/^(?:avenida|avda|av)\.?\s+/i, "Av. "],
  [/^(?:pasaje|psje|pje|pj)\.?\s+/i, "Pje. "],
];

/** Las palabras que van en minúscula dentro de un nombre («18 de Septiembre»). */
const MENORES = new Set(["de", "del", "la", "las", "los", "el", "y"]);

/** La guía llega en mayúsculas («DAVID GIRVAN»): se escribe como un nombre propio.
 *  Lo que ya trae minúsculas se respeta. */
function comoNombre(texto: string, todoMayusculas: boolean): string {
  if (!todoMayusculas) return texto;
  return texto
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MENORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** «DAVID GIRVAN 931 DEPTO 12, ARICA» → { calle: «David Girvan», numero: «931» }. Sin número
 *  reconocible, todo es la calle. Una dirección vacía da calle vacía. */
export function direccionCorta(direccion: string | null | undefined): DireccionCorta {
  const texto = (direccion ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return { calle: "", numero: null };
  const todoMayusculas = !/\p{Ll}/u.test(texto);
  const consulta = normalizarConsulta(separarReferencias(texto).consulta) || texto;
  const { calle, numero } = calleYNumero(consulta);
  let corta = comoNombre(calle.replace(/,$/, "").trim(), todoMayusculas);
  for (const [tipo, abreviado] of TIPOS) corta = corta.replace(tipo, abreviado);
  return { calle: corta, numero };
}

/** La dirección corta en una línea («David Girvan 931»). */
export function textoDireccionCorta(direccion: string | null | undefined): string {
  const { calle, numero } = direccionCorta(direccion);
  return numero ? `${calle} ${numero}` : calle;
}
