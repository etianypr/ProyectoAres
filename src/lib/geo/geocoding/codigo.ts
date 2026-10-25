// Plus Codes en el campo de dirección: se resuelven sin preguntarle a nadie.

import { resolverPlusCode } from "@/lib/geo/plus-code";
import type { SugerenciaDireccion } from "./tipos";

// ---------------------------------------------------------------------------
// Plus Codes: el camino corto
// ---------------------------------------------------------------------------
//
// Un Plus Code YA ES la ubicación. No hay nada que buscar, nada que consultar y
// nada sobre lo que dudar: se resuelve con aritmética, sin red, sin API key y
// siempre igual (ver lib/geo/plus-code.ts).
//
// Que esto exista en el campo de dirección es la respuesta al problema de fondo
// de Arica, y está medido: de 23 direcciones reales, Mapbox tiene la puerta
// exacta en 2 y estima el resto (npm run sondear). Para una casa sin número, un
// código dictado por teléfono —"GMCP+MX"— ubica mejor que cualquier dirección
// escrita, y ubica igual de bien mañana.
//
// Por eso corta antes que los proveedores en los tres caminos de entrada: no
// tiene sentido preguntarle a Mapbox por algo que ya sabemos.

/** Un código con este recuadro o menos apunta a la puerta. Diez dígitos dan
 *  ~14 m; once, ~3 m. Por encima de esto ya es la cuadra o el barrio y hay que
 *  decirlo. */
const METROS_MISMA_PUERTA = 20;

/** ¿Lo escrito es un Plus Code? Se pregunta antes de normalizar: la
 *  normalización está pensada para direcciones y no tiene por qué respetar un
 *  código. */
export function esPlusCode(texto: string): boolean {
  return resolverPlusCode(texto) !== null;
}

/** El Plus Code escrito, ya como sugerencia, con el tamaño de su recuadro al
 *  lado: eso último no entra en SugerenciaDireccion y hace falta para poder
 *  decirle al conductor CUÁNTO cubre un código impreciso. null si no era código. */
export function comoPlusCode(
  texto: string,
): { sugerencia: SugerenciaDireccion; precisionMetros: number } | null {
  const r = resolverPlusCode(texto);
  if (!r) return null;

  const sugerencia: SugerenciaDireccion = {
    id: `plus:${r.codigoCompleto}`,
    // Se guarda el código COMPLETO y no lo que se escribió: un código corto no
    // significa nada sin saber respecto de dónde se leyó, y lo que queda
    // guardado en el pedido tiene que valerse solo.
    direccion: r.codigoCompleto,
    detalle: `Plus Code · ±${r.precisionMetros} m`,
    lat: r.lat,
    lng: r.lng,
    soloCalle: false,
    confianza: r.precisionMetros <= METROS_MISMA_PUERTA ? "exacta" : "aproximada",
    // No hay número de casa en juego: no es que no coincida, es que no aplica.
    coincideNumero: null,
    fuente: "plus_code",
  };

  return { sugerencia, precisionMetros: r.precisionMetros };
}
