// ¿Se puede dar la vuelta en esta calle? (terreno 2026-10-29: "entrar a la calle y
// salir en reversa en calles estrechas no se puede; se puede en calles de doble
// sentido amplias").
//
// ORS dice el tipo de cada pedazo de la ruta en la misma respuesta (extra_info:
// waytype), así que no hace falta otro dato. Medido con la API real (spec 019):
// 1 son carreteras y avenidas troncales, 2 calles principales, 3 residenciales y
// pasajes. En Arica, según OpenStreetMap: 1.402 pasajes y 1.263 calles
// residenciales —ahí no se da la vuelta— y 955 avenidas y calles principales.

/** Los tipos de ORS (waytype), con nombre. */
const TIPOS: Record<number, string> = {
  1: "carretera",
  2: "principal",
  3: "calle",
  4: "sendero",
  5: "huella",
  6: "ciclovia",
  7: "vereda",
  8: "escalera",
  9: "transbordador",
  10: "en-obras",
};

/** Donde cabe dar la vuelta. */
const ANCHAS = new Set(["carretera", "principal"]);

/** Tramos de la geometría con su tipo: [desde, hasta, tipo] (índices de punto). */
export type TramosDeTipo = [number, number, number][];

/** Sin dato, no: es lo que pidió el dueño, y equivocarse para el otro lado deja
 *  al conductor saliendo en reversa de un pasaje. */
export function permiteDarLaVuelta(clase: string | null | undefined): boolean {
  return clase != null && ANCHAS.has(clase);
}

/** El tipo de calle del segmento que empieza en el punto `indice` de la
 *  geometría (el que va de `indice` a `indice + 1`). */
export function claseEn(tipos: TramosDeTipo | undefined, indice: number): string | null {
  for (const [desde, hasta, tipo] of tipos ?? []) {
    if (desde <= indice && indice < hasta) return TIPOS[tipo] ?? null;
  }
  return null;
}
