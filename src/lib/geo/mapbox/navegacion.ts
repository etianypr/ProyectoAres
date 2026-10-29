// Indicaciones paso a paso de Mapbox, en español y con avisos de voz, para el
// tramo desde donde está el conductor hasta la parada activa.
import { distanciaMetros, type Coordenada, type Trazado } from "@/lib/geo/coordenada";
import { rumboDelCamino } from "@/lib/geo/trazado";
import { urlDirections } from "./direcciones";
import { claseAlInicio, permiteDarLaVuelta } from "./vuelta";
import { tope } from "@/lib/comun/tope";

/** Aviso de voz de una maniobra, tal como lo entrega Mapbox. */
export type AvisoVoz = {
  /** Ya escrito en español ("En 300 metros, gire a la derecha hacia Chacabuco"). */
  texto: string;
  /** A cuántos metros del final del paso corresponde decirlo. */
  aMetros: number;
};

export type PasoNavegacion = {
  /** Instrucción completa en español, lista para mostrar. La escribe Mapbox
   *  (language=es): ya no hay que traducir vocabulario de maniobras a mano. */
  instruccion: string;
  /** Texto corto del cartel: normalmente la calle a la que se entra. */
  banner: string | null;
  /** Metros a recorrer ANTES de ejecutar esta maniobra, según la API. En
   *  pantalla se prefiere el cálculo local (ver metrosRestantes), que se
   *  actualiza con cada lectura de GPS. */
  distanciaM: number;
  /** Segundos que Mapbox estima para recorrerlo: de acá sale la hora de
   *  llegada a la parada (ver restanteDelTramo). */
  duracionS: number;
  /** "turn" | "roundabout" | "arrive" | … — solo para elegir el ícono. */
  tipo: string;
  /** En una rotonda, por qué salida se sale (1, 2, 3…); si no, null. */
  salida: number | null;
  /** "left" | "right" | "slight left" | "uturn" | … , o null. Solo para el ícono. */
  modificador: string | null;
  /** Trazado de ESTE paso, que termina justo en la maniobra. Con esto se sabe
   *  cuántos metros faltan para el giro sin volver a consultar la API. */
  trazado: Trazado;
  /** Avisos de voz de este paso, del más lejano al más cercano. */
  avisos: AvisoVoz[];
};

type PasoCrudo = {
  maneuver?: { type?: string; modifier?: string; instruction?: string; exit?: number };
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: Trazado };
  bannerInstructions?: { primary?: { text?: string } }[];
  voiceInstructions?: { announcement?: string; distanceAlongGeometry?: number }[];
  intersections?: { mapbox_streets_v8?: { class?: string } }[];
};

// Tramo de navegación (posición actual → parada activa): instrucciones paso a
// paso MÁS el trazado por calles de ese tramo — distinto de obtenerRutaCalles,
// que es la ruta completa del día (todas las paradas desde la base, calculada
// una sola vez al generar). Esta es la que el conductor necesita ver: cómo ir
// desde donde está AHORA hasta la próxima entrega.
//
// Se llama una vez por parada / cada vez que el conductor se aleja lo suficiente
// de donde se pidió la última (ver useNavegacion), no en cada actualización de
// GPS. Entre consulta y consulta, la distancia a la maniobra se recalcula en el
// teléfono con metrosRestantes().
// Cuánto se le permite a Mapbox apartarse del rumbo declarado al elegir por
// qué calzada arranca la ruta. Amplio a propósito: el rumbo muchas veces no
// viene del GPS sino estimado entre dos lecturas seguidas (ver
// use-ubicacion-actual), así que es ruidoso. Con 90° igual se descarta la
// calzada CONTRARIA de una avenida dividida —que es el caso que importa— sin
// arriesgar que la consulta se quede sin ningún camino válido.
const TOLERANCIA_RUMBO = 90;

// ---------------------------------------------------------------------------
// Salir sin rumbo (terreno 2026-10-28). Con el rumbo, Mapbox NUNCA arranca la
// ruta dando la vuelta ni doblando hacia atrás: obliga a seguir de frente
// hasta poder doblar. Con la casa siguiente 120 m detrás del auto eso era una
// vuelta a la manzana de 700 m a 1,4 km (Diego Portales, Av. Argentina, Pey
// Casado), y con la parada en una esquina —el auto llega por una calle y la
// salida corta va por la de al lado— rodeos de 280 a 500 m. Un conductor ahí
// da la vuelta o dobla. Al salir hacia una parada se piden las dos —de frente
// y sin rumbo— y se usa la sin rumbo si conviene.
// ---------------------------------------------------------------------------

/** La ruta sin rumbo tiene que ahorrar al menos esto para usarla. */
const AHORRO_MINIMO_M = 200;
/** Las dos consultas engancharon el auto en el MISMO punto si sus salidas
 *  quedan a menos de esto. En una avenida con bandejón las calzadas van a
 *  10-20 m: más lejos, la ruta sin rumbo salió por la de enfrente y tomarla
 *  sería cruzar el bandejón. */
const MISMA_CALZADA_M = 6;
/** Arranca hacia atrás —"Da la vuelta"— si sus primeros metros se apartan más
 *  que esto del rumbo del auto. Menos es doblar en la esquina, y eso ya lo dice
 *  la instrucción de Mapbox. */
const GRADOS_HACIA_ATRAS = 120;
/** Cuánto de la ruta se mira para saber hacia dónde arranca: poco, porque en
 *  una esquina la ruta dobla a los 10-20 m. */
const METROS_ARRANQUE = 10;

/** Lo que se compara de cada ruta. */
export type SalidaRuta = {
  metros: number;
  /** Donde Mapbox enganchó al auto (waypoints[0]). */
  salida: Coordenada | null;
  /** Hacia dónde van sus primeros metros, en grados desde el norte. */
  arranque: number | null;
  /** El tipo de la calle donde está el auto (Mapbox Streets v8), ver vuelta.ts. */
  calle: string | null;
};

/** ¿Se sale sin rumbo, y eso es dar la vuelta? Pura. */
export function elegirSalida(
  deFrente: SalidaRuta,
  sinRumbo: SalidaRuta,
  rumbo: number,
): { sinRumbo: boolean; daLaVuelta: boolean } {
  const conviene =
    deFrente.salida != null &&
    sinRumbo.salida != null &&
    deFrente.metros - sinRumbo.metros >= AHORRO_MINIMO_M &&
    distanciaMetros(deFrente.salida, sinRumbo.salida) <= MISMA_CALZADA_M;
  if (!conviene) return { sinRumbo: false, daLaVuelta: false };
  const giro =
    sinRumbo.arranque == null ? 0 : Math.abs((((sinRumbo.arranque - rumbo) % 360) + 540) % 360 - 180);
  const daLaVuelta = giro > GRADOS_HACIA_ATRAS;
  // Dar la vuelta solo en una calle ancha de doble sentido: en un pasaje o una
  // residencial angosta es salir en reversa. Doblar en la esquina, en cualquiera.
  if (daLaVuelta && !permiteDarLaVuelta(sinRumbo.calle ?? deFrente.calle)) return { sinRumbo: false, daLaVuelta: false };
  return { sinRumbo: true, daLaVuelta };
}

type RutaCruda = { distance?: number; geometry?: { coordinates?: Trazado }; legs?: { steps?: PasoCrudo[] }[] };

/** Una consulta: la ruta, o null si Mapbox no encontró camino (un error de red
 *  sube, y quien llama decide). */
async function pedir(puntos: Coordenada[], params: Record<string, string>) {
  const res = await fetch(urlDirections(puntos, params), { signal: tope(8_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { routes?: RutaCruda[]; waypoints?: { location?: [number, number] }[] };
  const ruta = json.routes?.[0];
  if (!ruta) return null;
  const donde = json.waypoints?.[0]?.location;
  return { ruta, salida: Array.isArray(donde) ? { lng: donde[0], lat: donde[1] } : null };
}

function medir(r: { ruta: RutaCruda; salida: Coordenada | null }): SalidaRuta {
  const trazado = r.ruta.geometry?.coordinates ?? [];
  const inicio = trazado[0] ? { lng: trazado[0][0], lat: trazado[0][1] } : null;
  return {
    metros: r.ruta.distance ?? Infinity,
    salida: r.salida,
    arranque: inicio ? rumboDelCamino(inicio, trazado, METROS_ARRANQUE, 0) : null,
    calle: claseAlInicio(r.ruta.legs?.[0]?.steps?.[0]),
  };
}

export async function obtenerNavegacion(
  origen: Coordenada,
  destino: Coordenada,
  /** Hacia dónde apunta el auto AHORA, en grados desde el norte. Sin esto,
   *  Mapbox pega la posición del conductor a la calle más cercana sin saber en qué
   *  sentido va: en una avenida dividida puede engancharlo en la calzada de
   *  enfrente y devolver una ruta que arranca dando toda la vuelta. */
  rumbo?: number | null,
  /** Saliendo hacia una parada: se pide también la ruta sin rumbo, por si la
   *  casa queda atrás o en la esquina y conviene salir sin él (ver elegirSalida). */
  { permitirVuelta = false }: { permitirVuelta?: boolean } = {},
): Promise<{ pasos: PasoNavegacion[]; trazado: Trazado; daLaVuelta: boolean } | null> {
  const comunes = {
    steps: "true",
    language: "es",
    voice_instructions: "true",
    banner_instructions: "true",
    voice_units: "metric",
  };
  // El ";" final deja el DESTINO sin restricción de rumbo: solo se sabe hacia
  // dónde va el auto en el origen.
  // Mapbox rechaza la consulta entera si el ángulo se sale de 0-360, y ese
  // rechazo se pagaría con una consulta perdida más el reintento. Se normaliza
  // acá: un rumbo raro es un dato a acomodar, no un error que valga un viaje.
  const grados = rumbo == null || Number.isNaN(rumbo) ? null : ((Math.round(rumbo) % 360) + 360) % 360;
  const conRumbo =
    grados == null ? null : { ...comunes, bearings: `${grados},${TOLERANCIA_RUMBO};` };
  const puntos = [origen, destino];

  let ruta: RutaCruda | undefined;
  let daLaVuelta = false;
  try {
    // Tope de 8 s por consulta: con 4G inestable una consulta colgada bloqueaba
    // todo recálculo hacia ese destino (spec 017, N6).
    if (conRumbo && permitirVuelta) {
      // Las dos a la vez: la espera es la de una sola.
      const [deFrente, sinRumbo] = await Promise.all([
        pedir(puntos, conRumbo).catch(() => null),
        pedir(puntos, comunes).catch(() => null),
      ]);
      const eleccion =
        deFrente && sinRumbo ? elegirSalida(medir(deFrente), medir(sinRumbo), grados!) : { sinRumbo: false, daLaVuelta: false };
      daLaVuelta = eleccion.daLaVuelta;
      ruta = (eleccion.sinRumbo ? sinRumbo : (deFrente ?? sinRumbo))?.ruta;
    } else {
      // Si el rumbo dejó a la consulta sin ninguna calzada que cumpla (pasa con
      // un rumbo viejo, o estando dentro de un estacionamiento), se reintenta sin
      // él: mejor una ruta imperfecta que ninguna instrucción en pantalla.
      const r = (conRumbo ? await pedir(puntos, conRumbo) : null) ?? (await pedir(puntos, comunes));
      ruta = r?.ruta;
    }
  } catch {
    // Acá sí se traga todo, token incluido: esto corre en bucle mientras el
    // conductor maneja y no puede llenar la pantalla de errores. Si falta el token,
    // el aviso ya salió al armar la ruta (ver obtenerRutaCalles).
    return null;
  }

  const pasos = ruta?.legs?.[0]?.steps;
  if (!Array.isArray(pasos)) return null;

  const resultado = pasos.map((p) => ({
    instruccion: p.maneuver?.instruction ?? "",
    banner: p.bannerInstructions?.[0]?.primary?.text ?? null,
    distanciaM: Math.round(p.distance ?? 0),
    duracionS: Math.round(p.duration ?? 0),
    tipo: p.maneuver?.type ?? "continue",
    salida: typeof p.maneuver?.exit === "number" ? p.maneuver.exit : null,
    modificador: p.maneuver?.modifier ?? null,
    trazado: p.geometry?.coordinates ?? [],
    avisos: (p.voiceInstructions ?? [])
      .filter((a) => a.announcement)
      .map((a) => ({ texto: a.announcement!, aMetros: Math.round(a.distanceAlongGeometry ?? 0) }))
      // Del más lejano al más cercano, que es el orden en que se van diciendo.
      .sort((a, b) => b.aMetros - a.aMetros),
  }));

  // La vuelta se dice con el primer aviso del tramo, que es el que suena al
  // salir: un aviso aparte quedaría tapado por ese (ver useVozNavegacion).
  if (daLaVuelta && resultado[0]) {
    const [primero, ...resto] = resultado[0].avisos;
    resultado[0].avisos = primero
      ? [{ ...primero, texto: `Da la vuelta. ${primero.texto}` }, ...resto]
      : [{ texto: "Da la vuelta.", aMetros: resultado[0].distanciaM }];
  }

  return { pasos: resultado, trazado: ruta?.geometry?.coordinates ?? [], daLaVuelta };
}
