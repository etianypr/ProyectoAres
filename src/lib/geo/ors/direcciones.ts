// Trazado por calles de la ruta ya ordenada, con su distancia y duración, de la
// API de direcciones de OpenRouteService (spec 019; antes Mapbox, que cobra
// pasado lo gratis y no tiene tope de gasto).
//
// ORS acepta 70 puntos por consulta (verificado: 71 devuelve 400): un día normal
// es UNA consulta. Más largo, se parte en tramos que comparten el punto de corte.
import { distanciaMetros, rumboEntre, type Coordenada, type Trazado } from "@/lib/geo/coordenada";
import { claveOrs, postOrs } from "./cliente";
import { claseEn, permiteDarLaVuelta, type TramosDeTipo } from "./vuelta";

const DIRECCIONES = "/v2/directions/driving-car/geojson";
const MAX_PUNTOS_POR_CONSULTA = 70;

/** Falta la clave: es un error de configuración del despliegue, no una falla de
 *  red, así que se avisa fuerte en vez de degradar en silencio. */
export class ErrorClaveOrs extends Error {
  constructor() {
    super("Falta configurar NEXT_PUBLIC_ORS_KEY. Sin esa clave no hay trazado por calles.");
  }
}

/** La calle de cada punto de la ruta: para que el plan sepa dónde no se puede
 *  dar la vuelta (ver generar-ruta/sentido.ts). */
export type CalleDelPunto = {
  /** Tipo de calle con que se llega (ver vuelta.ts). */
  clase: string | null;
  /** Rumbo con que se llega: la dirección de la calle en ese punto. */
  eje: number | null;
  /** Metros de más que costó pasarlo de frente, si la ruta se devolvía ahí. */
  extraM: number | null;
};

export type RutaCalles = {
  /** [lng, lat] por punto — formato GeoJSON. */
  trazado: Trazado;
  distanciaM: number;
  duracionS: number;
  /** Uno por punto pedido (null en el primero y donde no hubo dato). */
  puntos?: (CalleDelPunto | null)[];
};

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

// ---------------------------------------------------------------------------
// Sin salir en reversa de un pasaje (terreno 2026-10-29). Libre, la ruta da la
// vuelta en cualquier parada, y en un pasaje o una residencial angosta eso es
// "entrar y salir en reversa". En ORS el rumbo en una parada intermedia NO lo
// impide (medido); `continue_straight` sí, pero vale para toda la consulta. Por
// eso se pide de nuevo SOLO el pedazo de esas paradas (la anterior, ellas y la
// siguiente) con `continue_straight`, y se reemplazan esos tramos. En avenidas y
// calles principales se sigue pudiendo dar la vuelta (ver vuelta.ts).
// ---------------------------------------------------------------------------

/** Pasadas como mucho: pasar de frente por una parada cambia cómo se llega a la
 *  siguiente, que puede quedar dando la vuelta. */
const MAX_PASADAS = 3;
/** Con la red lenta no se pide nada más después de esto: queda lo que hay. */
const MS_PASADAS = 12_000;
/** Una parada donde la ruta sale con más de esto de giro respecto de cómo
 *  llegó es una vuelta en U. */
const GRADOS_VUELTA = 120;
/** Cuántos metros del tramo se miran para el rumbo de llegada y de salida. */
const METROS_RUMBO = 20;

/** El camino entre dos puntos pedidos seguidos. */
type Tramo = { linea: Trazado; metros: number; segundos: number };

type RespuestaRuta = {
  features?: {
    geometry?: { coordinates?: Trazado };
    properties?: {
      segments?: { distance?: number; duration?: number }[];
      way_points?: number[];
      extras?: { waytype?: { values?: TramosDeTipo } };
    };
  }[];
};

const rumboEntrePuntos = (a: [number, number], b: [number, number]) =>
  rumboEntre({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
const metrosEntre = (a: [number, number], b: [number, number]) =>
  distanciaMetros({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });

/** Rumbo con el que se llega al final de la línea (sus últimos metros). */
export function rumboAlLlegar(linea: Trazado): number | null {
  const fin = linea[linea.length - 1];
  for (let i = linea.length - 2, acumulado = 0; i >= 0; i--) {
    acumulado += metrosEntre(linea[i], linea[i + 1]);
    if (acumulado >= METROS_RUMBO) return rumboEntrePuntos(linea[i], fin);
  }
  return null;
}

/** Rumbo con el que sale la línea (sus primeros metros). */
export function rumboAlSalir(linea: Trazado): number | null {
  for (let i = 1, acumulado = 0; i < linea.length; i++) {
    acumulado += metrosEntre(linea[i - 1], linea[i]);
    if (acumulado >= METROS_RUMBO) return rumboEntrePuntos(linea[0], linea[i]);
  }
  return null;
}

/** Una consulta partida en sus tramos, con el tipo de calle con que se llega a
 *  cada punto. null si no llegó (sin red, sin camino, sin cuota). */
async function pedirTramos(
  puntos: Coordenada[],
  deFrente: boolean,
): Promise<{ tramos: Tramo[]; clases: (string | null)[] } | null> {
  const r = await postOrs<RespuestaRuta>(
    DIRECCIONES,
    {
      coordinates: puntos.map((p) => [p.lng, p.lat]),
      // Sin esto ORS prohibiría volver por donde se vino en CADA parada: una
      // vuelta a la manzana regalada en cada entrega (medido con Mapbox sobre 25
      // días de Arica: 18 de 25 rutas salían más largas). Solo se pide en los
      // pedazos de calles estrechas (ver tramoSinReversa).
      continue_straight: deFrente,
      // Sin radio: una parada mal ubicada lejos de la calle igual entra, como
      // con Mapbox, en vez de botar la consulta entera.
      radiuses: puntos.map(() => -1),
      // Sin instrucciones ORS no devuelve `segments`, que es lo que mide cada
      // tramo entre parada y parada (verificado con la API real).
      instructions: true,
      units: "m",
      extra_info: ["waytype"],
    },
    15_000,
  );
  if (!r || !("datos" in r)) return null;
  const f = r.datos.features?.[0];
  const linea = f?.geometry?.coordinates;
  const marcas = f?.properties?.way_points;
  const segmentos = f?.properties?.segments;
  if (!linea || !marcas || marcas.length !== puntos.length || segmentos?.length !== puntos.length - 1) return null;
  const tipos = f?.properties?.extras?.waytype?.values;
  return {
    tramos: segmentos.map((s, k) => ({
      linea: linea.slice(marcas[k], marcas[k + 1] + 1),
      metros: s.distance ?? 0,
      segundos: s.duration ?? 0,
    })),
    clases: marcas.map((m, k) => (k === 0 ? null : claseEn(tipos, Math.max(0, m - 1)))),
  };
}

/** Las paradas intermedias donde la ruta da la vuelta en una calle estrecha. */
function vueltasEnEstrechas(tramos: Tramo[], clases: (string | null)[], vistas: Set<number>): number[] {
  const salida: number[] = [];
  for (let i = 1; i < tramos.length; i++) {
    if (vistas.has(i)) continue;
    const llegada = rumboAlLlegar(tramos[i - 1].linea);
    const partida = rumboAlSalir(tramos[i].linea);
    if (llegada == null || partida == null) continue;
    const giro = Math.abs((((partida - llegada) % 360) + 540) % 360 - 180);
    if (giro > GRADOS_VUELTA && !permiteDarLaVuelta(clases[i])) salida.push(i);
  }
  return salida;
}

/** Índices ordenados en rachas de seguidos: [3, 4, 9] → [[3, 4], [9, 9]]. */
export function enRachas(indices: number[]): [number, number][] {
  const orden = [...new Set(indices)].sort((a, b) => a - b);
  const rachas: [number, number][] = [];
  for (const i of orden) {
    const ultima = rachas[rachas.length - 1];
    if (ultima && i === ultima[1] + 1) ultima[1] = i;
    else rachas.push([i, i]);
  }
  return rachas;
}

/** Un grupo de puntos, sin vueltas en calles estrechas. */
async function tramoSinReversa(grupo: Coordenada[]): Promise<{ tramos: Tramo[]; puntos: (CalleDelPunto | null)[] } | null> {
  const libre = await pedirTramos(grupo, false);
  if (!libre) return null;
  const tramos = [...libre.tramos];
  const deFrente = new Set<number>();
  const empezo = Date.now();

  for (let pasada = 0; pasada < MAX_PASADAS && Date.now() - empezo < MS_PASADAS; pasada++) {
    const nuevas = vueltasEnEstrechas(tramos, libre.clases, deFrente);
    if (nuevas.length === 0) break;
    for (const i of nuevas) deFrente.add(i);
    // Cada racha que tenga alguna nueva se pide entera: las de frente de antes
    // siguen de frente.
    for (const [a, b] of enRachas([...deFrente])) {
      if (!nuevas.some((i) => i >= a && i <= b)) continue;
      if (Date.now() - empezo >= MS_PASADAS) break;
      const pedazo = await pedirTramos(grupo.slice(a - 1, b + 2), true);
      // Sin camino de frente (una calle sin salida): queda la vuelta.
      if (pedazo) tramos.splice(a - 1, b - a + 2, ...pedazo.tramos);
    }
  }

  // La calle de cada punto sale de la ruta libre; lo que costó pasarlo de
  // frente, de comparar sus dos tramos con los finales.
  const puntos = grupo.map((_, i): CalleDelPunto | null => {
    const llega = libre.tramos[i - 1];
    if (!llega) return null;
    const antes = llega.metros + (libre.tramos[i]?.metros ?? 0);
    const despues = (tramos[i - 1]?.metros ?? 0) + (tramos[i]?.metros ?? 0);
    return {
      clase: libre.clases[i],
      eje: rumboAlLlegar(llega.linea),
      extraM: deFrente.has(i) ? Math.max(0, Math.round(despues - antes)) : null,
    };
  });
  return { tramos, puntos };
}

// Trazado real (por calles) de la ruta ya ordenada, con su distancia y duración.
// Devuelve null si la API no respondió: el llamador conserva el trazado anterior
// en vez de dejar al conductor con un mapa en blanco (ver guardarRuta).
export async function obtenerRutaCalles(puntosOrdenados: Coordenada[]): Promise<RutaCalles | null> {
  if (puntosOrdenados.length < 2) return null;
  if (!claveOrs()) throw new ErrorClaveOrs();

  const trazado: Trazado = [];
  let distanciaM = 0;
  let duracionS = 0;
  const puntos: (CalleDelPunto | null)[] = puntosOrdenados.map(() => null);
  let desde = 0;

  for (const grupo of enTramos(puntosOrdenados, MAX_PUNTOS_POR_CONSULTA)) {
    const pedido = await tramoSinReversa(grupo);
    // Un trazado a medias sería peor que ninguno: el conductor vería una línea
    // que se corta en el medio de la ciudad y parece la ruta completa.
    if (!pedido) return null;
    pedido.puntos.forEach((p, i) => {
      if (p) puntos[desde + i] = p;
    });
    desde += grupo.length - 1;
    for (const t of pedido.tramos) {
      // El primer punto de cada tramo es el último del anterior.
      trazado.push(...(trazado.length === 0 ? t.linea : t.linea.slice(1)));
      distanciaM += t.metros;
      duracionS += t.segundos;
    }
  }

  return { trazado, distanciaM: Math.round(distanciaM), duracionS: Math.round(duracionS), puntos };
}
