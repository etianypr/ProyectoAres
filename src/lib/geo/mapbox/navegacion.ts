// Indicaciones paso a paso de Mapbox, en español y con avisos de voz, para el
// tramo desde donde está el conductor hasta la parada activa.
import type { Coordenada, Trazado } from "@/lib/geo/coordenada";
import { urlDirections } from "./direcciones";
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

export async function obtenerNavegacion(
  origen: Coordenada,
  destino: Coordenada,
  /** Hacia dónde apunta el auto AHORA, en grados desde el norte. Sin esto,
   *  Mapbox pega la posición del conductor a la calle más cercana sin saber en qué
   *  sentido va: en una avenida dividida puede engancharlo en la calzada de
   *  enfrente y devolver una ruta que arranca dando toda la vuelta. */
  rumbo?: number | null,
): Promise<{ pasos: PasoNavegacion[]; trazado: Trazado } | null> {
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

  let ruta:
    | { geometry?: { coordinates?: Trazado }; legs?: { steps?: PasoCrudo[] }[] }
    | undefined;
  try {
    // Tope de 8 s: con 4G inestable una consulta colgada bloqueaba todo
    // recálculo hacia ese destino (spec 017, N6).
    let res = conRumbo ? await fetch(urlDirections([origen, destino], conRumbo), { signal: tope(8_000) }) : null;
    // Si el rumbo dejó a la consulta sin ninguna calzada que cumpla (pasa con
    // un rumbo viejo, o estando dentro de un estacionamiento), se reintenta sin
    // él: mejor una ruta imperfecta que ninguna instrucción en pantalla.
    if (!res || !res.ok) res = await fetch(urlDirections([origen, destino], comunes), { signal: tope(8_000) });
    if (!res.ok) return null;
    ruta = (await res.json()).routes?.[0];
  } catch {
    // Acá sí se traga todo, token incluido: esto corre en bucle mientras el
    // conductor maneja y no puede llenar la pantalla de errores. Si falta el token,
    // el aviso ya salió al armar la ruta (ver obtenerRutaCalles).
    return null;
  }

  const pasos = ruta?.legs?.[0]?.steps;
  if (!Array.isArray(pasos)) return null;

  return {
    pasos: pasos.map((p) => ({
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
    })),
    trazado: ruta?.geometry?.coordinates ?? [],
  };
}
