// La referencia de una dirección de la guía y la calle repetida (spec 035; toma de la 025 lo de
// separar referencias).
//
// Muchas líneas traen, además de la calle con su número, la población antes («LINDEROS
// PROVIDENCI CALLE 2 901») o una referencia después («… 1450 CON CALLE 5», «… FRENTE A LA
// SEDE»). La calle de la casa es la que va junto al número (dueño, 2026-11-15): eso se busca, y
// lo demás es referencia. Con una calle que está en varios lugares de Arica («Pasaje 1»), la
// referencia es lo que dice cuál es: la población escrita o la calle que cruza.
//
// Todo puro y sin red, salvo los catálogos que viajan en el código.
import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { sectorDe } from "@/lib/geo/sectores-arica";
import type { ResultadoUbicacion } from "./ubicar";
import type { SugerenciaDireccion } from "./tipos";

export type Referencias = {
  /** Lo que se busca: la calle con su número (y lo que va pegado, como el depto). */
  consulta: string;
  /** Lo que no es la calle: la población de antes y la referencia de después, tal como venían. */
  referencia: string;
  /** Las calles nombradas como cruce («con X», «esquina X», «entre X y Y»). */
  cruces: string[];
};

/** La palabra que abre el nombre de una calle. */
const TIPO_DE_CALLE = /^(?:avenida|avda|av|calle|pasaje|psje|pje|pj|camino|callej[oó]n|diagonal)\.?$/i;
/** La palabra que, después del número, abre una referencia. */
const ABRE_REFERENCIA =
  /^(?:con|esq|esquina|entre|frente|al|detras|detrás|cerca|pob|pobl|poblacion|población|villa|sector|condominio|conj|conjunto)\.?,?$/i;
const esNumero = (p: string) => /^\d+[a-z]?,?$/i.test(p);

/** Dónde está el número de casa en las palabras de una calle: el primer número que no es parte
 *  del nombre («Pasaje 1 1450»: el 1 es del nombre). -1 si no hay. */
function numeroDeCasa(palabras: string[]): number {
  const desde = TIPO_DE_CALLE.test(palabras[0] ?? "") ? 2 : 1;
  return palabras.findIndex((p, i) => i >= desde && esNumero(p));
}

/** «Pasaje 1 1450» → calle «Pasaje 1» y número «1450». partirCalleYNumero (consulta.ts) no
 *  parte un nombre que termina en número; esta sí. Sin número, todo es la calle. */
export function calleYNumero(consulta: string): { calle: string; numero: string | null } {
  const palabras = consulta.trim().split(/\s+/);
  const n = numeroDeCasa(palabras);
  if (n <= 0) return { calle: consulta.trim(), numero: null };
  return { calle: palabras.slice(0, n).join(" "), numero: palabras[n].replace(/,$/, "") };
}

/** Separa la calle con su número de la referencia. Sin calle reconocible, todo es consulta. */
export function separarReferencias(texto: string): Referencias {
  const t = texto.replace(/\s+/g, " ").trim();
  const palabras = t.split(" ");
  // La población va ANTES de la calle: el último «Pasaje/Calle/Avenida …» que trae su número
  // es la calle de la casa.
  let inicio = 0;
  palabras.forEach((p, i) => {
    // Con un número antes, la casa ya apareció: lo de después es referencia («… 1450 ESQ. CALLE 5»).
    const numeroAntes = palabras.slice(0, i).some(esNumero);
    if (i > 0 && !numeroAntes && TIPO_DE_CALLE.test(p) && numeroDeCasa(palabras.slice(i)) > 0) inicio = i;
  });
  const calle = palabras.slice(inicio);
  // Después del número, desde la palabra que abre una referencia hasta el final.
  let fin = calle.length;
  const n = numeroDeCasa(calle);
  if (n > 0 && n + 1 < calle.length && ABRE_REFERENCIA.test(calle[n + 1])) fin = n + 1;
  const antes = palabras.slice(0, inicio).join(" ").replace(/[,\s-]+$/, "");
  const despues = calle.slice(fin).join(" ");
  const consulta = calle.slice(0, fin).join(" ").replace(/,$/, "");
  const cruces: string[] = [];
  const cruce = /\b(?:con|esq(?:uina)?\.?|entre)\s+(.+)$/i.exec(despues);
  if (cruce) {
    for (const parte of cruce[1].split(/\s+y\s+/i)) {
      // «Calle 5 900» → «Calle 5»: el número de casa del cruce no es parte de su nombre.
      const ps = parte.trim().split(" ");
      const n = numeroDeCasa(ps);
      const limpia = (n > 0 ? ps.slice(0, n) : ps).join(" ");
      if (limpia) cruces.push(limpia);
    }
  }
  return { consulta: consulta || t, referencia: [antes, despues].filter(Boolean).join(" · "), cruces };
}

/** Pedidos del día ya ubicados: con menos que esto todavía no hay ruta que mire. */
const PUNTOS_PARA_FILTRAR = 3;
/** Un lugar a esta distancia de alguna parada del día está «cerca de la ruta» aunque sea de
 *  otro sector (los sectores municipales cortan barrios por la mitad). */
const METROS_CERCA_DE_LA_RUTA = 1000;

const distanciaALaRuta = (c: Coordenada, puntos: Coordenada[]) => Math.min(...puntos.map((p) => distanciaMetros(c, p)));

/** Una calle repetida, mirando la ruta del día (dueño, 2026-11-15: «las posibles calles se
 *  limitan a las que quedan cerca de la ruta o en el mismo sector; si hay otra en otro sector
 *  no se recomienda»). Solo actúa sobre un resultado `ambigua` de lugares (con `sector`):
 *    · queda uno solo en la zona de la ruta → ese, sin preguntar, con la advertencia;
 *    · quedan varios → solo esos, el más cercano a las demás paradas primero;
 *    · ninguno → todos, por cercanía (no hay a cuál ir sin preguntar).
 *  Lo que ya calzó con la referencia de la guía tiene prioridad: la zona se mira entre esos. */
export function elegirConLaRuta(r: ResultadoUbicacion, puntosDelDia: Coordenada[]): ResultadoUbicacion {
  if (r.tipo !== "ambigua" || r.elegida || !r.candidatos.some((c) => c.sector)) return r;
  if (puntosDelDia.length < PUNTOS_PARA_FILTRAR) return r;
  const lugares = r.candidatos.filter((c) => c.sector);
  const calzan = lugares.filter((c) => c.calza);
  const base = calzan.length > 0 ? calzan : lugares;
  const sectores = new Set<string>(puntosDelDia.map((p) => sectorDe(p)));
  const enZona = base.filter((c) => sectores.has(c.sector!) || distanciaALaRuta(c, puntosDelDia) <= METROS_CERCA_DE_LA_RUTA);
  const porCercania = (xs: SugerenciaDireccion[]) =>
    [...xs].sort((a, b) => distanciaALaRuta(a, puntosDelDia) - distanciaALaRuta(b, puntosDelDia));
  if (enZona.length === 1) {
    const elegida = enZona[0];
    return {
      tipo: elegida.confianza === "exacta" ? "exacta" : "aproximada",
      candidatos: [elegida, ...porCercania(lugares.filter((c) => c !== elegida))],
      elegida,
      advertencia: `Único ${nombreDeCalle(elegida)} en los sectores de la ruta: ${elegida.detalle}.`,
    };
  }
  const opciones = enZona.length > 1 ? enZona : base;
  return { ...r, candidatos: porCercania(opciones) };
}

/** «Pasaje 1» de «Pasaje 1 1450». */
function nombreDeCalle(s: SugerenciaDireccion): string {
  const ps = s.direccion.split(" ");
  const n = numeroDeCasa(ps);
  return (n > 0 ? ps.slice(0, n) : ps).join(" ");
}
