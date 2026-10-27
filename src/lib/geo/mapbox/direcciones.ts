// Trazado por calles y distancias reales, de la API de direcciones de Mapbox.
//
// El trazado por calles, la distancia, la duración y las instrucciones paso a
// paso se le piden a la API de direcciones de Mapbox. Antes era el servidor de
// demostración de OSRM, que en su propia documentación se declara "para uso
// razonable NO COMERCIAL, sin garantías de disponibilidad" — con cinco conductores
// pidiendo el camino cada 150 metros, esto era una empresa en producción
// apoyada en un servidor de pruebas que puede cortar el acceso cualquier día.
//
// Además Mapbox entrega las instrucciones YA ESCRITAS en español, incluidos los
// avisos de voz con la distancia calculada ("En 300 metros, gire a la derecha
// hacia Vicuña Mackenna"). Con OSRM había que traducir a mano su vocabulario de
// maniobras y no había voz posible.
import type { Coordenada, Trazado } from "@/lib/geo/coordenada";
import { tokenMapbox } from "./token";
import { tope } from "@/lib/comun/tope";

const DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox";
const MATRIX = "https://api.mapbox.com/directions-matrix/v1/mapbox";

// Perfil con tráfico real e histórico. Se usa también para el trazado del día
// completo: cuesta lo mismo que el perfil sin tráfico y la duración estimada
// sale más parecida a la realidad.
const PERFIL = "driving-traffic";

// Verificado contra la API: 25 puntos devuelve 200 y 26 devuelve 422, tanto en
// "driving" como en "driving-traffic". Un día de 30 paradas más la base son
// 31 puntos, así que el trazado del día SIEMPRE hay que pedirlo por tramos.
const MAX_PUNTOS_POR_CONSULTA = 25;

/** Falta la variable de entorno: es un error de configuración del despliegue,
 *  no una falla de red, así que se avisa fuerte en vez de degradar en silencio. */
export class ErrorTokenMapbox extends Error {
  constructor() {
    super(
      "Falta configurar NEXT_PUBLIC_MAPBOX_TOKEN. Sin ese token no hay mapa ni indicaciones.",
    );
  }
}

export function urlDirections(puntos: Coordenada[], params: Record<string, string>): string {
  const token = tokenMapbox();
  if (!token) throw new ErrorTokenMapbox();

  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(";");
  const query = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    // Mapbox trae esto en "true" por defecto para los perfiles en auto, y ese
    // default es el que hacía que la ruta "diera vueltas": obliga a SEGUIR
    // DERECHO al salir de cada parada intermedia, o sea prohíbe volver por
    // donde se vino. Para una camioneta de reparto —que se detiene, entrega y
    // puede perfectamente devolverse— eso no es una restricción real: es una
    // vuelta a la manzana regalada en cada entrega.
    //
    // Medido sobre 25 días de Arica: con el default, 18 de 25 rutas salían
    // más largas, hasta 1.448 m de más en una ruta de solo 4 paradas.
    continue_straight: "false",
    access_token: token,
    ...params,
  });
  return `${DIRECTIONS}/${PERFIL}/${coords}?${query}`;
}

// Límite verificado contra la API: el perfil "driving" acepta 25 coordenadas
// (26 devuelve 422) y "driving-traffic" solo 10. Se usa "driving" a propósito:
// con 25 paradas entra un día completo en UNA consulta, y para decidir el
// ORDEN de las paradas las velocidades de tráfico del momento no ayudan —el
// conductor va a pasar por ahí dentro de tres horas, no ahora.
const MAX_PUNTOS_MATRIZ = 25;

// Distancias reales por calles entre TODAS las paradas (matriz n×n, en metros).
// Es lo que le falta a ordenarParadas para no ordenar mirando la línea recta.
//
// Devuelve null si no entra en una sola consulta o si la API no respondió: en
// ese caso se ordena como siempre, en línea recta. Nunca lanza — que no se pueda
// afinar el orden no es motivo para dejar al conductor sin ruta.
export async function matrizDistancias(puntos: Coordenada[]): Promise<number[][] | null> {
  if (puntos.length < 2 || puntos.length > MAX_PUNTOS_MATRIZ) return null;

  const token = tokenMapbox();
  if (!token) return null;

  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(";");
  const query = new URLSearchParams({ annotations: "distance", access_token: token });

  try {
    const res = await fetch(`${MATRIX}/driving/${coords}?${query}`, { signal: tope(15_000) });
    if (!res.ok) return null;
    const datos = (await res.json()) as { distances?: (number | null)[][] };
    if (!Array.isArray(datos.distances)) return null;
    // Mapbox manda null en los pares que no tienen camino entre sí.
    return datos.distances.map((fila) => fila.map((d) => d ?? Infinity));
  } catch {
    return null;
  }
}

// Parte una lista de puntos en tramos de como máximo "max", repitiendo el
// último punto de cada tramo como primero del siguiente para que los trazados
// queden pegados sin huecos.
function enTramos(puntos: Coordenada[], max: number): Coordenada[][] {
  if (puntos.length <= max) return [puntos];
  const grupos: Coordenada[][] = [];
  let i = 0;
  while (i < puntos.length - 1) {
    const fin = Math.min(i + max, puntos.length);
    grupos.push(puntos.slice(i, fin));
    i = fin - 1;
  }
  return grupos;
}

export type RutaCalles = {
  /** [lng, lat] por punto — formato GeoJSON. */
  trazado: Trazado;
  distanciaM: number;
  duracionS: number;
};

// Trazado real (por calles) de la ruta ya ordenada, con su distancia y duración.
// Devuelve null si la API no respondió: el llamador conserva el trazado anterior
// en vez de dejar al conductor con un mapa en blanco (ver guardarRuta).
export async function obtenerRutaCalles(
  puntosOrdenados: Coordenada[],
): Promise<RutaCalles | null> {
  if (puntosOrdenados.length < 2) return null;

  const trazado: Trazado = [];
  let distanciaM = 0;
  let duracionS = 0;

  for (const tramo of enTramos(puntosOrdenados, MAX_PUNTOS_POR_CONSULTA)) {
    let ruta: { geometry: { coordinates: Trazado }; distance: number; duration: number };
    try {
      const res = await fetch(urlDirections(tramo, {}), { signal: tope(15_000) });
      if (!res.ok) return null;
      ruta = (await res.json()).routes?.[0];
    } catch (e) {
      // Un token faltante NO es una falla de red: tiene que llegar al llamador.
      if (e instanceof ErrorTokenMapbox) throw e;
      return null;
    }
    if (!ruta) return null;

    // Un tramo a medias sería peor que ninguno: el conductor vería una línea que
    // se corta en el medio de la ciudad y parece la ruta completa.
    const coords = ruta.geometry.coordinates;
    // El primer punto de cada tramo posterior es el último del anterior.
    trazado.push(...(trazado.length === 0 ? coords : coords.slice(1)));
    distanciaM += ruta.distance;
    duracionS += ruta.duration;
  }

  return {
    trazado,
    distanciaM: Math.round(distanciaM),
    duracionS: Math.round(duracionS),
  };
}
