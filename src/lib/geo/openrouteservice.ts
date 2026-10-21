// Trazado por calles con OpenRouteService: el camino ABIERTO, sobre el grafo de
// OpenStreetMap y con Jerarquías de Contracción (Contraction Hierarchies).
//
// Esto NO reemplaza a lib/rutas.ts. La ruta que maneja el chofer sigue saliendo
// de Mapbox, y por dos razones concretas que están escritas allá: las
// instrucciones vienen ya redactadas en español con sus avisos de voz, y el
// trazado sale del mismo mundo que las teselas que se dibujan. Cambiar eso
// sería rehacer la navegación entera.
//
// Para qué sirve entonces: para preguntar SIN gastar cuota de Mapbox y sin
// tocar el camino del chofer — comparar un trazado, revisar una ruta vieja,
// contestarle al LLM cuánto tarda ir de acá a allá. Es la herramienta del
// servidor MCP (ver mcp/), no la de la app.
//
// La cuenta gratuita de ORS da 2.000 consultas de direcciones por día y 40 por
// minuto. No es open source autohospedado —pide una API key— pero tampoco se
// paga. Si algún día hace falta cortar esa dependencia, ORS y Valhalla se
// levantan en un contenedor con el extracto OSM de Chile y lo único que cambia
// acá es ORS_BASE.
import type { Coordenada, Trazado } from "./coordenada";

const ORS_BASE = process.env.ORS_BASE ?? "https://api.openrouteservice.org";

/** Perfiles de ORS. Los nombres son los suyos y viajan tal cual en la URL. */
export type PerfilRuta = "driving-car" | "driving-hgv" | "cycling-regular" | "foot-walking";

/** Lo que se puede pedir evitar, en castellano, traducido abajo al vocabulario
 *  de ORS. Se traduce acá y no en quien llama para que nadie tenga que saber
 *  que "peajes" se dice "tollways". */
export type Evitable = "autopistas" | "peajes" | "ferries";

const EVITABLES: Record<Evitable, string> = {
  autopistas: "highways",
  peajes: "tollways",
  ferries: "ferries",
};

// Verificado contra la API real: 70 puntos devuelve 200 y 71 devuelve 400, con
// el mensaje "The specified number of waypoints must not be greater than 70".
// Antes acá decía 50, sacado de la documentación: era un supuesto y estaba de
// más: rechazaba rutas que el servicio acepta. Es el mismo criterio con el que
// está escrito MAX_PUNTOS_POR_CONSULTA en lib/rutas.ts para Mapbox.
//
// Da de sobra: un día de 30 paradas más la base son 31 puntos.
const MAX_PUNTOS = 70;

/** Falta la API key. NO es una falla de red y no se traga: sin esto, un .env
 *  mal armado se ve igual que "OpenRouteService está caído" y se busca el
 *  problema donde no está. Mismo criterio que ErrorTokenMapbox en lib/rutas. */
export class ErrorClaveORS extends Error {
  constructor() {
    super("Falta ORS_API_KEY: no se puede consultar OpenRouteService.");
    this.name = "ErrorClaveORS";
  }
}

/** Una maniobra, ya en castellano (ORS las redacta con language=es). */
export type PasoRuta = {
  texto: string;
  distanciaM: number;
  duracionS: number;
  punto: Coordenada;
};

export type RutaAbierta = {
  /** [lng, lat] por punto — formato GeoJSON, IDÉNTICO a RutaCalles.trazado en
   *  lib/rutas.ts. Es a propósito: así entra sin traducir a ajustarATrazado(),
   *  recortarTrazado() y metrosRestantes(). Invertir el par no da error, pone
   *  la ruta en el mar. */
  trazado: Trazado;
  distanciaM: number;
  duracionS: number;
  /** Índices de los puntos que se pasaron, en el orden recorrido. Mismo formato
   *  que devuelve ordenarParadas() en lib/rutas.ts. */
  orden: number[];
  pasos: PasoRuta[] | null;
};

export type OpcionesRuta = {
  perfil?: PerfilRuta;
  /** Deja que ORS reordene las paradas del medio. Por defecto NO: el orden de
   *  este proyecto lo decide ordenarParadas(), que además pondera los bloques
   *  horarios que el receptor pidió por WhatsApp — algo que ORS no sabe. */
  optimizarOrden?: boolean;
  instrucciones?: boolean;
  evitar?: Evitable[];
  senal?: AbortSignal;
};

type RespuestaGeoJson = {
  features?: {
    geometry?: { coordinates?: Trazado };
    properties?: {
      summary?: { distance?: number; duration?: number };
      way_points?: number[];
      segments?: {
        steps?: {
          instruction?: string;
          distance?: number;
          duration?: number;
          way_points?: number[];
        }[];
      }[];
    };
  }[];
};

/** Trazado real por calles entre coordenadas.
 *
 *  Devuelve null si ORS no contestó o contestó algo inservible — el llamador se
 *  queda con lo que ya tenía, igual que hace obtenerRutaCalles() con Mapbox. Lo
 *  único que SÍ se lanza es la falta de API key.
 *
 *  Se pide el endpoint /geojson y no el /json a propósito: el json entrega la
 *  geometría como polilínea codificada y habría que escribir un decodificador
 *  —y probarlo—, mientras que el geojson ya viene con los pares [lng, lat]
 *  crudos, que es exactamente el formato que el resto del proyecto usa. */
export async function obtenerRutaAbierta(
  puntos: Coordenada[],
  opciones: OpcionesRuta = {},
): Promise<RutaAbierta | null> {
  if (puntos.length < 2) return null;
  if (puntos.length > MAX_PUNTOS) return null;

  const clave = process.env.ORS_API_KEY;
  if (!clave) throw new ErrorClaveORS();

  const perfil = opciones.perfil ?? "driving-car";
  const evitar = (opciones.evitar ?? []).map((e) => EVITABLES[e]).filter(Boolean);

  const cuerpo: Record<string, unknown> = {
    // ⚠️ ORS recibe [lng, lat], igual que GeoJSON y al revés de como se lee en
    // voz alta. Darlo vuelta no da error: devuelve una ruta por el océano.
    coordinates: puntos.map((p) => [p.lng, p.lat]),
    instructions: opciones.instrucciones ?? false,
    language: "es",
  };
  if (opciones.optimizarOrden) cuerpo.optimize_waypoints = true;
  if (evitar.length > 0) cuerpo.options = { avoid_features: evitar };

  let datos: RespuestaGeoJson;
  try {
    const res = await fetch(`${ORS_BASE}/v2/directions/${perfil}/geojson`, {
      method: "POST",
      headers: {
        Authorization: clave,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify(cuerpo),
      signal: opciones.senal,
    });
    if (!res.ok) return null;
    datos = (await res.json()) as RespuestaGeoJson;
  } catch {
    return null;
  }

  const f = datos.features?.[0];
  const trazado = f?.geometry?.coordinates;
  // Una ruta de un solo punto no es una ruta: es peor que ninguna, porque se
  // dibuja igual y parece que el trazado terminó.
  if (!Array.isArray(trazado) || trazado.length < 2) return null;

  const resumen = f?.properties?.summary ?? {};
  const pasosCrudos = (f?.properties?.segments ?? []).flatMap((s) => s.steps ?? []);

  return {
    trazado,
    distanciaM: Math.round(resumen.distance ?? 0),
    duracionS: Math.round(resumen.duration ?? 0),
    // way_points dice en qué índice del trazado cae cada parada. Sin
    // optimize_waypoints el orden es el que se mandó; con él, ORS lo reordena y
    // esto es lo único que lo cuenta.
    orden: ordenDe(f?.properties?.way_points, puntos.length),
    pasos: opciones.instrucciones ? pasosCrudos.map((p) => aPaso(p, trazado)) : null,
  };
}

/** Traduce los way_points de ORS al formato de ordenarParadas(): el orden en
 *  que se recorrieron los puntos que se mandaron. Sin optimización es la
 *  identidad, y así se devuelve si ORS no informó nada. */
function ordenDe(wayPoints: number[] | undefined, cuantos: number): number[] {
  const identidad = Array.from({ length: cuantos }, (_, i) => i);
  if (!Array.isArray(wayPoints) || wayPoints.length !== cuantos) return identidad;

  // way_points son índices DENTRO del trazado, crecientes en el orden del
  // recorrido. El orden de las paradas es el de esos índices ordenados.
  return identidad
    .slice()
    .sort((a, b) => wayPoints[a] - wayPoints[b]);
}

function aPaso(
  p: { instruction?: string; distance?: number; duration?: number; way_points?: number[] },
  trazado: Trazado,
): PasoRuta {
  const indice = p.way_points?.[0] ?? 0;
  const [lng, lat] = trazado[Math.min(indice, trazado.length - 1)] ?? trazado[0];
  return {
    texto: p.instruction ?? "",
    distanciaM: Math.round(p.distance ?? 0),
    duracionS: Math.round(p.duration ?? 0),
    punto: { lat, lng },
  };
}
