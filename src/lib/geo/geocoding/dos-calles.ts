// Dos calles en la dirección: vale la que tiene el número (spec 048, dueño 2026-11-27).
//
// «LINDEROS CON NEGHME 2480»: hasta la 048 la casa era siempre la calle que va junto al número
// (Neghme) y la otra, referencia (spec 035). La gente escribe la esquina de distintas formas, así
// que ubicar.ts le pregunta también a Google por la otra calle con el mismo número
// (referencias.ts, `otraCalleConElNumero`), y aquí se decide:
//   · solo una de las dos tiene esa puerta → esa (la otra queda como referencia);
//   · las dos, a más de una cuadra → no se elige: el conductor ve las dos (⚠);
//   · las dos, juntas (la casa de la esquina) → la del número, como antes;
//   · ninguna → como antes, y la IA la revisa con las dos lecturas (direccion-ia).
// Puro.
import { distanciaMetros } from "@/lib/geo/coordenada";
import { calleYNumero } from "./referencias";
import type { ResultadoUbicacion } from "./ubicar";
import type { SugerenciaDireccion } from "./tipos";

/** Dos puertas más separadas que esto son dos casas, no la de la esquina (la vara de ubicar.ts). */
const METROS_MISMA_ESQUINA = 300;

/** Una puerta con el número escrito (no la calle entera). */
const conElNumero = (c: SugerenciaDireccion) => !c.soloCalle && c.coincideNumero === true && c.confianza !== "baja";

/**
 * Lo que cambia con la otra calle, o null si se queda lo de la calle del número. `delNumero` es lo
 * que se encontró para la calle junto al número; `deLaOtra`, lo que contestó Google para la otra
 * calle con el mismo número (null o vacío: nada).
 */
export function decidirDosCalles(delNumero: ResultadoUbicacion, deLaOtra: SugerenciaDireccion[] | null): ResultadoUbicacion | null {
  const otras = (deLaOtra ?? []).filter(conElNumero);
  if (otras.length === 0) return null;
  const otra = otras[0];
  const propias = delNumero.candidatos.filter(conElNumero);
  const resto = delNumero.candidatos.filter((c) => !otras.includes(c));
  if (propias.length === 0) {
    return {
      tipo: otra.confianza === "exacta" ? "exacta" : "aproximada",
      candidatos: [...otras, ...resto],
      elegida: otra,
      advertencia:
        otra.confianza === "exacta"
          ? `La casa está en ${otra.direccion}: la otra calle escrita no tiene ese número.`
          : `La casa está en ${otra.direccion} (la cuadra, no la puerta): la otra calle escrita no tiene ese número.`,
    };
  }
  const propia = propias[0];
  if (distanciaMetros(propia, otra) <= METROS_MISMA_ESQUINA) return null;
  const nombre = (c: SugerenciaDireccion) => calleYNumero(c.direccion).calle;
  return {
    tipo: "ambigua",
    candidatos: [propia, otra, ...resto.filter((c) => c !== propia)],
    elegida: null,
    advertencia: `${nombre(propia)} y ${nombre(otra)} tienen el ${calleYNumero(propia.direccion).numero ?? "mismo número"}. Elige cuál es.`,
  };
}
