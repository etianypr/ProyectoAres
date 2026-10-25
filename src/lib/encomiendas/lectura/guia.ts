// La guía de despacho (spec 005) → líneas OF + destino. Puro.
//
// La guía (app Infologistic de Starken) trae una línea por paquete:
// "OF:275388184 DESTINO:SAN MARCOS 1030 .". Llega como texto: pegado desde
// Google Lens o devuelto por la IA. Sin nombre ni teléfono: esos están solo en
// la etiqueta de cada paquete.

import { LARGO_OF } from "../paquete";
import type { GuiaIA } from "./esquemas";

export type LineaGuia = {
  /** 9 dígitos si se leyó bien; si no, lo leído (y la línea queda dudosa). */
  of: string;
  destino: string;
  /** OF sin 9 dígitos o destino vacío: el conductor la revisa antes de crear. */
  dudosa: boolean;
};

export type GuiaLeida = {
  folio: string | null;
  /** MONTO NETO de la guía: cada línea vale 1, así que es la cantidad de
   *  paquetes (a confirmar con más guías). null si no se leyó. */
  totalDeclarado: number | null;
  lineas: LineaGuia[];
  /** Lo que el conductor tiene que saber: repetidas unidas, faltantes, dudosas. */
  avisos: string[];
};

/** Basura que trae el destino en la guía: entidades HTML, país, región. */
export function limpiarDestino(texto: string): string {
  let t = texto;
  // "&amp;amp;" puede venir anidado varias veces.
  for (let i = 0; i < 4 && /&amp;/i.test(t); i++) t = t.replace(/&amp;/gi, "&");
  t = t
    .replace(/&/g, " ")
    .replace(/^\s*CHILE\s*,\s*/i, "")
    .replace(/,?\s*XV\s+REGI[OÓ]N\s+DE\s+ARICA(\s+Y(\s+PARINACOTA)?)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  // "PASAJE LOS PINOS 56 NO. 56": el número repetido sobra.
  t = t.replace(/\s+N[OºÚ°]\.?\s*(\d+)\b/gi, (todo, n: string) =>
    new RegExp(`\\b${n}\\b`).test(t.replace(todo, "")) ? "" : todo,
  );
  return t.replace(/[\s.,]+$/, "").trim();
}

/** Texto de la guía (una o varias fotos pegadas una tras otra) → líneas. Las OF
 *  repetidas se juntan: dos fotos de la guía se superponen. */
export function leerGuia(texto: string): GuiaLeida {
  const plano = texto.replace(/\r?\n/g, " ");

  // Cada línea empieza en "OF:" y su destino corre hasta la próxima "OF:" o el
  // pie de la guía.
  const crudas = [
    ...plano.matchAll(
      // "0F:" también: el lector del teléfono suele leer la O como cero.
      /\b[O0]F\s*:?\s*([\d\s]{6,14}?)\s*DESTINO\s*:?\s*(.*?)(?=\b[O0]F\s*:|SOLO TRASLADO|Oficio\s+N|SON\s*:|MONTO\s+NETO|$)/gi,
    ),
  ];

  const folio = plano.match(/N[º°]\s*(\d{5,})/)?.[1] ?? plano.match(/FOLIO\s*:?\s*(\d{5,})/i)?.[1] ?? null;
  const neto = plano.match(/MONTO\s+NETO\s*:?\s*(\d+)/i)?.[1];
  return armarGuia(
    crudas.map(([, of, destino]) => ({ of, destino })),
    folio,
    neto != null ? Number(neto) : null,
  );
}

/** Lo que leyó la IA en una o varias fotos de la guía → las mismas reglas que el
 *  texto pegado (destino limpio, OF de 9 dígitos, repetidas, faltantes). */
export function guiaDesdeIA(fotos: GuiaIA[]): GuiaLeida {
  const folio = fotos.find((f) => f.folio)?.folio ?? null;
  const total = fotos.find((f) => f.totalDeclarado != null)?.totalDeclarado ?? null;
  return armarGuia(
    fotos.flatMap((f) => f.lineas),
    folio ? folio.replace(/\D/g, "") || null : null,
    total != null ? Math.round(total) : null,
  );
}

/** ¿La segunda lectura trae alguna OF válida que la primera no tiene? Sirve
 *  para controlar la lectura de la IA con la del teléfono (gratis): si el
 *  teléfono vio una OF que la IA no trajo, la foto se relee con más cuidado. */
export function faltanEnLaPrimera(primera: GuiaLeida, segunda: GuiaLeida): boolean {
  const leidas = new Set(primera.lineas.map((l) => l.of));
  return segunda.lineas.some((l) => !l.dudosa && !leidas.has(l.of));
}

/** Líneas crudas → GuiaLeida, con las OF repetidas juntas y los avisos. */
export function armarGuia(
  crudas: { of: string; destino: string }[],
  folio: string | null,
  totalDeclarado: number | null,
): GuiaLeida {
  const avisos: string[] = [];
  const porOf = new Map<string, LineaGuia>();
  let repetidas = 0;
  for (const cruda of crudas) {
    const of = cruda.of.replace(/\D/g, "");
    const destino = limpiarDestino(cruda.destino);
    if (porOf.has(of)) {
      repetidas++;
      continue;
    }
    porOf.set(of, { of, destino, dudosa: of.length !== LARGO_OF || destino === "" });
  }
  const lineas = [...porOf.values()];

  if (repetidas > 0) {
    avisos.push(
      repetidas === 1
        ? "Una OF estaba repetida (fotos superpuestas): quedó una sola vez."
        : `${repetidas} OF estaban repetidas (fotos superpuestas): quedó cada una una sola vez.`,
    );
  }
  const dudosas = lineas.filter((l) => l.dudosa).length;
  if (dudosas > 0) {
    avisos.push(
      dudosas === 1
        ? "Una línea se leyó mal (OF sin 9 dígitos o sin destino): revísala."
        : `${dudosas} líneas se leyeron mal (OF sin 9 dígitos o sin destino): revísalas.`,
    );
  }
  if (totalDeclarado != null && totalDeclarado !== lineas.length) {
    avisos.push(
      totalDeclarado > lineas.length
        ? `La guía dice ${totalDeclarado} y se leyeron ${lineas.length}: pueden faltar ${totalDeclarado - lineas.length}. Revisa si quedó alguna fuera de la foto.`
        : `La guía dice ${totalDeclarado} y se leyeron ${lineas.length}. Revisa que no haya líneas de más.`,
    );
  }
  if (lineas.length === 0) avisos.push("No se encontró ninguna línea \"OF: … DESTINO: …\".");

  return { folio, totalDeclarado, lineas, avisos };
}
