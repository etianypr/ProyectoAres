// ¿Se puede dar la vuelta en esta calle? (terreno 2026-10-29: "entrar a la calle y
// salir en reversa en calles estrechas no se puede; se puede en calles de doble
// sentido amplias").
//
// Mapbox dice el tipo de cada calle en la misma respuesta de la ruta
// (intersections[].mapbox_streets_v8.class), así que no hace falta otro dato. En
// Arica, según OpenStreetMap: 1.402 pasajes y 1.263 calles residenciales —ahí no
// se da la vuelta— y 955 avenidas y calles principales.
//
// Un solo sentido no hace falta mirarlo: por una calle así Mapbox nunca arma una
// ruta que se devuelva.

/** Las clases de Mapbox Streets v8 donde cabe dar la vuelta. "street" (residencial
 *  y pasajes) y "service" no. */
const CLASES_ANCHAS = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);

/** Sin dato, no: es lo que pidió el dueño, y equivocarse para el otro lado deja
 *  al conductor saliendo en reversa de un pasaje. */
export function permiteDarLaVuelta(clase: string | null | undefined): boolean {
  return clase != null && CLASES_ANCHAS.has(clase);
}

type ConInterseccion = { intersections?: { mapbox_streets_v8?: { class?: string } }[] };

/** El tipo de la calle donde empieza un paso (su primera intersección). */
export function claseAlInicio(paso: ConInterseccion | undefined): string | null {
  return paso?.intersections?.[0]?.mapbox_streets_v8?.class ?? null;
}

/** El tipo de la calle donde termina un tramo: la última intersección con dato
 *  de sus pasos, que es la calle de la parada. */
export function claseAlFinal(pasos: ConInterseccion[] | undefined): string | null {
  for (let i = (pasos?.length ?? 0) - 1; i >= 0; i--) {
    const cruces = pasos![i].intersections ?? [];
    for (let k = cruces.length - 1; k >= 0; k--) {
      const clase = cruces[k].mapbox_streets_v8?.class;
      if (clase) return clase;
    }
  }
  return null;
}
