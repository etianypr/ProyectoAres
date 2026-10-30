// Indicaciones paso a paso, en español y con avisos de voz, para el tramo desde
// donde está el conductor hasta la parada activa. De OpenRouteService desde la
// spec 019 (antes Mapbox, que cobra pasado lo gratis y no tiene tope de gasto).
//
// ORS escribe cada instrucción en español ("Gire a la derecha a General Lagos")
// pero no trae avisos de voz: los arma pasosDeOrs, a distancias fijas antes de
// cada maniobra. El cartel, la flecha y la voz de la pantalla no cambian.
import { distanciaMetros, type Coordenada, type Trazado } from "@/lib/geo/coordenada";
import { rumboDelCamino } from "@/lib/geo/trazado";
import { postOrs } from "./cliente";
import { claseEn, permiteDarLaVuelta, type TramosDeTipo } from "./vuelta";

const DIRECCIONES = "/v2/directions/driving-car/geojson";

/** Aviso de voz de una maniobra. */
export type AvisoVoz = {
  /** Ya escrito en español ("En 200 metros, gire a la derecha a Chacabuco"). */
  texto: string;
  /** A cuántos metros del final del paso corresponde decirlo. */
  aMetros: number;
};

export type PasoNavegacion = {
  /** Instrucción completa en español, lista para mostrar. */
  instruccion: string;
  /** Texto corto del cartel: la calle de la maniobra que viene. */
  banner: string | null;
  /** Metros a recorrer ANTES de ejecutar esta maniobra, según la API. En
   *  pantalla se prefiere el cálculo local (ver metrosRestantes), que se
   *  actualiza con cada lectura de GPS. */
  distanciaM: number;
  /** Segundos estimados para recorrerlo: de acá sale la hora de llegada a la
   *  parada (ver restanteDelTramo). */
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

/** Un paso como lo da ORS. `type`: 0 izquierda, 1 derecha, 2 y 3 cerrada, 4 y 5
 *  leve, 6 recto, 7 entrar a la rotonda, 8 salir de ella, 9 vuelta en U, 10
 *  llegada, 11 salida, 12 y 13 mantenerse a la izquierda/derecha. */
export type PasoOrs = {
  distance?: number;
  duration?: number;
  type?: number;
  instruction?: string;
  name?: string;
  exit_number?: number;
  way_points?: [number, number];
};

/** El tipo y el modificador del ícono (el vocabulario que ya usa el cartel). */
const MANIOBRAS: Record<number, [string, string | null]> = {
  0: ["turn", "left"],
  1: ["turn", "right"],
  2: ["turn", "sharp left"],
  3: ["turn", "sharp right"],
  4: ["turn", "slight left"],
  5: ["turn", "slight right"],
  6: ["continue", "straight"],
  7: ["roundabout", null],
  8: ["continue", "straight"],
  9: ["turn", "uturn"],
  10: ["arrive", null],
  11: ["depart", null],
  12: ["fork", "slight left"],
  13: ["fork", "slight right"],
};

/** Avisos lejanos, en metros antes de la maniobra (si el paso alcanza). */
const AVISOS_LEJOS = [500, 200];
/** El paso tiene que ser al menos esto más largo que un aviso para decirlo: si
 *  no, se pisa con el de la salida. */
const MARGEN_AVISO = 100;
/** El aviso del giro, encima de la esquina. */
const METROS_DEL_GIRO = 40;

/** ORS escribe "Camina hacia el noroeste en …" al partir, aun en auto. */
function texto(paso: PasoOrs): string {
  return (paso.instruction ?? "").replace(/^Camina\b/, "Siga").trim();
}

/** Lo que se dice en voz alta de una maniobra. */
function frase(paso: PasoOrs): string {
  const t = texto(paso);
  return paso.type === 10 ? t.replace(/^Llegar a /, "Su destino está en ") : t;
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Los avisos de la maniobra que viene, para un paso de `largo` metros. */
function avisosHacia(siguiente: PasoOrs, largo: number): AvisoVoz[] {
  const f = frase(siguiente);
  if (!f) return [];
  const avisos: AvisoVoz[] = AVISOS_LEJOS.filter((m) => largo >= m + MARGEN_AVISO).map((m) => ({
    texto: `En ${m} metros, ${minuscula(f)}`,
    aMetros: m,
  }));
  avisos.push({ texto: f, aMetros: Math.min(METROS_DEL_GIRO, Math.max(0, Math.round(largo))) });
  return avisos;
}

/** Los pasos de ORS como los usa la pantalla. Pura. */
export function pasosDeOrs(pasos: PasoOrs[], linea: Trazado): PasoNavegacion[] {
  return pasos.map((p, k) => {
    const siguiente = pasos[k + 1];
    const largo = p.distance ?? 0;
    const [tipo, modificador] = MANIOBRAS[p.type ?? 6] ?? ["continue", null];
    const [desde, hasta] = p.way_points ?? [0, 0];
    const avisos = siguiente ? avisosHacia(siguiente, largo) : [];
    // Al salir se dice hacia dónde, antes que el primer giro.
    if (k === 0 && texto(p) && largo > METROS_DEL_GIRO + MARGEN_AVISO / 2) {
      avisos.unshift({ texto: frase(p), aMetros: Math.round(largo) });
    }
    const nombre = siguiente?.name && siguiente.name !== "-" ? siguiente.name : null;
    return {
      instruccion: texto(p),
      banner: siguiente ? (nombre ?? texto(siguiente)) : null,
      distanciaM: Math.round(largo),
      duracionS: Math.round(p.duration ?? 0),
      tipo,
      salida: typeof p.exit_number === "number" ? p.exit_number : null,
      modificador,
      trazado: linea.slice(desde, hasta + 1),
      // Del más lejano al más cercano, que es el orden en que se van diciendo.
      avisos: avisos.sort((a, b) => b.aMetros - a.aMetros),
    };
  });
}

// Tramo de navegación (posición actual → parada activa): instrucciones paso a
// paso MÁS el trazado por calles de ese tramo — distinto de obtenerRutaCalles,
// que es la ruta completa del día. Se llama una vez por parada / cada vez que el
// conductor se aleja lo suficiente de donde se pidió la última (ver
// useNavegacion), no en cada lectura de GPS.
//
// Cuánto se le permite a ORS apartarse del rumbo declarado al elegir por qué
// calzada arranca la ruta. Amplio a propósito: el rumbo muchas veces no viene del
// GPS sino estimado entre dos lecturas seguidas (ver use-ubicacion-actual), así
// que es ruidoso. Con 90° igual se descarta la calzada CONTRARIA de una avenida
// dividida sin arriesgar que la consulta se quede sin camino.
const TOLERANCIA_RUMBO = 90;

// ---------------------------------------------------------------------------
// Salir sin rumbo (terreno 2026-10-28). Con el rumbo, la ruta NUNCA arranca
// dando la vuelta ni doblando hacia atrás: obliga a seguir de frente hasta poder
// doblar. Con la casa siguiente 120 m detrás del auto eso era una vuelta a la
// manzana de 700 m a 1,4 km, y con la parada en una esquina, rodeos de 280 a
// 500 m. Un conductor ahí da la vuelta o dobla. Al salir hacia una parada se
// piden las dos —de frente y sin rumbo— y se usa la sin rumbo si conviene.
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
 *  la instrucción. */
const GRADOS_HACIA_ATRAS = 120;
/** Cuánto de la ruta se mira para saber hacia dónde arranca: poco, porque en
 *  una esquina la ruta dobla a los 10-20 m. */
const METROS_ARRANQUE = 10;

/** Lo que se compara de cada ruta. */
export type SalidaRuta = {
  metros: number;
  /** Donde la ruta enganchó al auto (su primer punto). */
  salida: Coordenada | null;
  /** Hacia dónde van sus primeros metros, en grados desde el norte. */
  arranque: number | null;
  /** El tipo de la calle donde está el auto, ver vuelta.ts. */
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

type RespuestaNav = {
  features?: {
    geometry?: { coordinates?: Trazado };
    properties?: {
      summary?: { distance?: number };
      segments?: { steps?: PasoOrs[] }[];
      extras?: { waytype?: { values?: TramosDeTipo } };
    };
  }[];
};

type Ruta = { linea: Trazado; pasos: PasoOrs[]; metros: number; tipos: TramosDeTipo | undefined };

/** Una consulta: la ruta, o null si no llegó (sin red, sin camino, sin cuota). */
async function pedir(origen: Coordenada, destino: Coordenada, grados: number | null): Promise<Ruta | null> {
  const r = await postOrs<RespuestaNav>(
    DIRECCIONES,
    {
      coordinates: [
        [origen.lng, origen.lat],
        [destino.lng, destino.lat],
      ],
      instructions: true,
      language: "es",
      units: "m",
      radiuses: [-1, -1],
      extra_info: ["waytype"],
      // Solo el origen lleva rumbo: hacia dónde va el auto se sabe ahí.
      ...(grados == null ? {} : { bearings: [[grados, TOLERANCIA_RUMBO]] }),
    },
    // Con 4G inestable una consulta colgada bloqueaba todo recálculo hacia ese
    // destino (spec 017, N6).
    8_000,
  );
  if (!r || !("datos" in r)) return null;
  const f = r.datos.features?.[0];
  const linea = f?.geometry?.coordinates;
  const pasos = f?.properties?.segments?.[0]?.steps;
  if (!linea || !Array.isArray(pasos) || pasos.length === 0) return null;
  return { linea, pasos, metros: f?.properties?.summary?.distance ?? Infinity, tipos: f?.properties?.extras?.waytype?.values };
}

function medir(r: Ruta): SalidaRuta {
  const inicio = r.linea[0] ? { lng: r.linea[0][0], lat: r.linea[0][1] } : null;
  return {
    metros: r.metros,
    salida: inicio,
    arranque: inicio ? rumboDelCamino(inicio, r.linea, METROS_ARRANQUE, 0) : null,
    calle: claseEn(r.tipos, 0),
  };
}

export async function obtenerNavegacion(
  origen: Coordenada,
  destino: Coordenada,
  /** Hacia dónde apunta el auto AHORA, en grados desde el norte. Sin esto, la
   *  posición del conductor se pega a la calle más cercana sin saber en qué
   *  sentido va: en una avenida dividida puede quedar en la calzada de enfrente
   *  y la ruta arrancar dando toda la vuelta. */
  rumbo?: number | null,
  /** Saliendo hacia una parada: se pide también la ruta sin rumbo, por si la
   *  casa queda atrás o en la esquina y conviene salir sin él (ver elegirSalida). */
  { permitirVuelta = false }: { permitirVuelta?: boolean } = {},
): Promise<{ pasos: PasoNavegacion[]; trazado: Trazado; daLaVuelta: boolean } | null> {
  // Un rumbo raro es un dato a acomodar, no un error que valga una consulta.
  const grados = rumbo == null || Number.isNaN(rumbo) ? null : ((Math.round(rumbo) % 360) + 360) % 360;

  let ruta: Ruta | null;
  let daLaVuelta = false;
  if (grados != null && permitirVuelta) {
    // Las dos a la vez: la espera es la de una sola.
    const [deFrente, sinRumbo] = await Promise.all([pedir(origen, destino, grados), pedir(origen, destino, null)]);
    const eleccion =
      deFrente && sinRumbo ? elegirSalida(medir(deFrente), medir(sinRumbo), grados) : { sinRumbo: false, daLaVuelta: false };
    daLaVuelta = eleccion.daLaVuelta;
    ruta = eleccion.sinRumbo ? sinRumbo : (deFrente ?? sinRumbo);
  } else {
    // Si el rumbo dejó a la consulta sin ninguna calzada que cumpla (un rumbo
    // viejo, o dentro de un estacionamiento), se reintenta sin él: mejor una
    // ruta imperfecta que ninguna instrucción en pantalla.
    ruta = (grados != null ? await pedir(origen, destino, grados) : null) ?? (await pedir(origen, destino, null));
  }
  // Sin ruta no se dice nada: esto corre en bucle mientras el conductor maneja
  // y no puede llenar la pantalla de errores.
  if (!ruta) return null;

  const pasos = pasosDeOrs(ruta.pasos, ruta.linea);
  // La vuelta se dice con el primer aviso del tramo, que es el que suena al
  // salir: un aviso aparte quedaría tapado por ese (ver useVozNavegacion).
  if (daLaVuelta && pasos[0]) {
    const [primero, ...resto] = pasos[0].avisos;
    pasos[0].avisos = primero
      ? [{ ...primero, texto: `Da la vuelta. ${primero.texto}` }, ...resto]
      : [{ texto: "Da la vuelta.", aMetros: pasos[0].distanciaM }];
  }
  return { pasos, trazado: ruta.linea, daLaVuelta };
}
