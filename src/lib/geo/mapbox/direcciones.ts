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
import { distanciaMetros, rumboEntre, type Coordenada, type Trazado } from "@/lib/geo/coordenada";
import { claseAlFinal, permiteDarLaVuelta } from "./vuelta";
import { tokenMapbox } from "./token";
import { tope } from "@/lib/comun/tope";

const DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox";

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

// La matriz de distancias entre paradas está en matriz.ts (por bloques, spec 017).

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

// ---------------------------------------------------------------------------
// Sin salir en reversa de un pasaje (terreno 2026-10-29). Con continue_straight
// en false la ruta puede dar la vuelta en CUALQUIER parada, y en un pasaje o una
// residencial angosta eso es "entrar y salir en reversa". En esas paradas la
// ruta se vuelve a pedir con el rumbo de llegada fijo: Mapbox la hace pasar de
// frente (medido: 380 m pasan a 1.006 y 1.580 m, que es lo que de verdad se
// maneja). En avenidas y calles principales se sigue pudiendo dar la vuelta
// (ver vuelta.ts).
// ---------------------------------------------------------------------------

/** Pasadas como mucho: fijar una parada cambia cómo se llega a las siguientes. */
const MAX_PASADAS = 3;
/** Una parada donde la ruta sale con más de esto de giro respecto de cómo
 *  llegó es una vuelta en U. */
const GRADOS_VUELTA = 120;
/** Cuántos metros del tramo se miran para el rumbo de llegada y de salida. */
const METROS_RUMBO = 20;
/** Margen del rumbo fijo: la calle puede curvarse un poco. */
const MARGEN_RUMBO = 45;

type PasoCrudo = { geometry?: { coordinates?: Trazado }; intersections?: { mapbox_streets_v8?: { class?: string } }[] };
type RutaCruda = { geometry: { coordinates: Trazado }; distance: number; duration: number; legs?: { distance?: number; steps?: PasoCrudo[] }[] };

const rumboEntrePuntos = (a: [number, number], b: [number, number]) =>
  rumboEntre({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
const metrosEntre = (a: [number, number], b: [number, number]) =>
  distanciaMetros({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });

function geometriaDelTramo(pasos: PasoCrudo[] | undefined): Trazado {
  return (pasos ?? []).flatMap((p) => p.geometry?.coordinates ?? []);
}

/** Rumbo con el que se llega al final de la línea (sus últimos metros). */
function rumboAlLlegar(linea: Trazado): number | null {
  const fin = linea[linea.length - 1];
  for (let i = linea.length - 2, acumulado = 0; i >= 0; i--) {
    acumulado += metrosEntre(linea[i], linea[i + 1]);
    if (acumulado >= METROS_RUMBO) return rumboEntrePuntos(linea[i], fin);
  }
  return null;
}

/** Rumbo con el que sale la línea (sus primeros metros). */
function rumboAlSalir(linea: Trazado): number | null {
  for (let i = 1, acumulado = 0; i < linea.length; i++) {
    acumulado += metrosEntre(linea[i - 1], linea[i]);
    if (acumulado >= METROS_RUMBO) return rumboEntrePuntos(linea[0], linea[i]);
  }
  return null;
}

/** Las paradas intermedias donde la ruta da la vuelta en una calle estrecha,
 *  con el rumbo con que se llega a ellas. */
function vueltasEnEstrechas(ruta: RutaCruda, rumbos: (number | null)[]): { i: number; rumbo: number }[] {
  const salida: { i: number; rumbo: number }[] = [];
  const tramos = ruta.legs ?? [];
  for (let i = 1; i < tramos.length; i++) {
    if (rumbos[i] != null) continue;
    const llega = tramos[i - 1];
    const sale = tramos[i];
    const llegada = rumboAlLlegar(geometriaDelTramo(llega.steps));
    const partida = rumboAlSalir(geometriaDelTramo(sale.steps));
    if (llegada == null || partida == null) continue;
    const giro = Math.abs((((partida - llegada) % 360) + 540) % 360 - 180);
    if (giro > GRADOS_VUELTA && !permiteDarLaVuelta(claseAlFinal(llega.steps))) salida.push({ i, rumbo: llegada });
  }
  return salida;
}

async function pedirTramo(tramo: Coordenada[], rumbos: (number | null)[]): Promise<RutaCruda | null> {
  const params: Record<string, string> = { steps: "true" };
  if (rumbos.some((r) => r != null)) {
    params.bearings = rumbos.map((r) => (r == null ? "" : `${Math.round(r)},${MARGEN_RUMBO}`)).join(";");
  }
  try {
    const res = await fetch(urlDirections(tramo, params), { signal: tope(15_000) });
    if (!res.ok) return null;
    return ((await res.json()).routes?.[0] as RutaCruda | undefined) ?? null;
  } catch (e) {
    // Un token faltante NO es una falla de red: tiene que llegar al llamador.
    if (e instanceof ErrorTokenMapbox) throw e;
    return null;
  }
}

/** Un tramo de la ruta, sin vueltas en calles estrechas. Si fijar el rumbo
 *  deja a Mapbox sin camino, se queda con la pasada anterior. */
async function tramoSinReversa(tramo: Coordenada[]): Promise<RutaCruda | null> {
  const rumbos: (number | null)[] = tramo.map(() => null);
  let ruta = await pedirTramo(tramo, rumbos);
  for (let pasada = 1; ruta && pasada < MAX_PASADAS; pasada++) {
    const nuevas = vueltasEnEstrechas(ruta, rumbos);
    if (nuevas.length === 0) break;
    for (const { i, rumbo } of nuevas) rumbos[i] = rumbo;
    const otra = await pedirTramo(tramo, rumbos);
    if (!otra) break;
    ruta = otra;
  }
  return ruta;
}

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
    const ruta = await tramoSinReversa(tramo);
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
