// Google Geocoding: el que encuentra el número de casa (spec 019, US4). Desde
// que salió Mapbox es el único que tiene numeradas las calles de Arica: OSM casi
// no tiene números y falla mucho ahí ("Maps es más bueno para encontrar
// direcciones", el dueño, 2026-11-06). Se le pregunta solo por direcciones con
// número; las calles sin número y los lugares los busca OSM, que es gratis.
//
// Decisión del dueño (2026-10-25, spec 016), con lo que implica a la vista:
//   · Los términos de Google Maps Platform no permiten usar sus resultados con
//     un mapa que no sea de Google, y ARES dibuja con OpenFreeMap.
//   · Google recibe la dirección (sin nombre ni teléfono): figura en
//     docs/PRIVACIDAD.md.
//   · Cobra pasado el cupo gratis del mes (10.000). Un día de unas 100
//     direcciones no llega ni a un tercio, y el tope diario de la consola de
//     Google (lo pone el dueño) impide pasarse aunque algo falle.
//
// La clave (GOOGLE_MAPS_KEY) vive solo en el servidor: el teléfono pregunta por
// /api/geocodificar, que llama a googleDirecto. Este módulo no lee la clave.

import { tope } from "@/lib/comun/tope";
import { RECUADRO_ARICA } from "@/lib/geo/coordenada";
import { esLaCalleEscrita, partirCalleYNumero } from "./consulta";
import type { SugerenciaDireccion } from "./tipos";

const GOOGLE_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";

type Componente = { long_name: string; short_name: string; types: string[] };
export type ResultadoGoogle = {
  place_id?: string;
  formatted_address?: string;
  address_components?: Componente[];
  geometry?: { location?: { lat: number; lng: number }; location_type?: string };
};

const dentroDeArica = (lat: number, lng: number) =>
  lat >= RECUADRO_ARICA.sur && lat <= RECUADRO_ARICA.norte && lng >= RECUADRO_ARICA.oeste && lng <= RECUADRO_ARICA.este;

/** Un resultado de Google → puerta, o null si no sirve: otra calle, fuera de
 *  Arica, otro número, o solo la calle (eso ya lo daban los otros). */
export function aSugerenciaGoogle(r: ResultadoGoogle, consulta: string): SugerenciaDireccion | null {
  const partido = partirCalleYNumero(consulta);
  if (!partido) return null;
  const comp = (tipo: string) => r.address_components?.find((c) => c.types.includes(tipo));
  const calle = comp("route")?.long_name;
  const numero = comp("street_number")?.long_name?.replace(/\D/g, "");
  const punto = r.geometry?.location;
  if (!calle || !numero || !punto || !dentroDeArica(punto.lat, punto.lng)) return null;
  if (numero !== partido.numero || !esLaCalleEscrita(partido.calle, calle)) return null;

  const tipo = r.geometry?.location_type;
  // ROOFTOP es la puerta; RANGE_INTERPOLATED, la cuadra. Lo demás (centro de
  // la calle o del barrio) no agrega nada a lo que ya se sabía.
  if (tipo !== "ROOFTOP" && tipo !== "RANGE_INTERPOLATED") return null;
  return {
    id: `google:${r.place_id ?? `${punto.lat},${punto.lng}`}`,
    direccion: `${calle} ${numero}`,
    detalle: "Arica",
    lat: punto.lat,
    lng: punto.lng,
    soloCalle: false,
    confianza: tipo === "ROOFTOP" ? "exacta" : "aproximada",
    coincideNumero: true,
    fuente: "google",
  };
}

/** Pregunta a Google con la clave del servidor. Nunca lanza: devuelve las
 *  puertas, lista vacía si Google no la tiene (ZERO_RESULTS) o null si Google no
 *  contestó bien (sin red, clave, cupo, cobro). Un null no es "no existe": el
 *  teléfono no lo recuerda y vuelve a preguntar (auditoría del día real,
 *  2026-11-10; antes un REQUEST_DENIED dejaba todo "Sin ubicar" sin avisar). */
export async function googleDirecto(consulta: string, clave: string): Promise<SugerenciaDireccion[] | null> {
  const params = new URLSearchParams({
    address: `${consulta}, Arica, Chile`,
    components: "country:CL",
    region: "cl",
    language: "es",
    bounds: `${RECUADRO_ARICA.sur},${RECUADRO_ARICA.oeste}|${RECUADRO_ARICA.norte},${RECUADRO_ARICA.este}`,
    key: clave,
  });
  try {
    const res = await fetch(`${GOOGLE_GEOCODE}?${params}`, { signal: tope(8_000) });
    if (!res.ok) return null;
    const datos = (await res.json()) as { status?: string; results?: ResultadoGoogle[] };
    if (datos.status === "ZERO_RESULTS") return [];
    if (datos.status !== "OK") return null;
    return (datos.results ?? []).flatMap((r) => aSugerenciaGoogle(r, consulta) ?? []);
  } catch {
    return null;
  }
}

/** Lo ya preguntado, mientras dure la pantalla: escribiendo el número dígito a
 *  dígito, o al rearmar la ruta, la misma consulta vuelve a caer y cada una se
 *  paga. Solo se guarda lo que Google contestó, nunca un corte de señal. */
const MAX_RECORDADAS = 100;
const yaPreguntado = new Map<string, SugerenciaDireccion[]>();

/** Borra lo recordado: son direcciones de destinatarios (se olvidan al cerrar
 *  el día, spec 007) y las pruebas contestan distinto a la misma consulta. */
export function olvidarConsultasGoogle(): void {
  yaPreguntado.clear();
}

/** La puerta según Google; lista vacía si Google no la tiene, o null si no se
 *  pudo preguntar (sin señal, sin clave en el servidor, el conductor siguió
 *  escribiendo). No es lo mismo: con null no se descarta ninguna calle.
 *
 *  Solo desde el navegador: en el servidor no hay sesión de conductor para
 *  /api/geocodificar. */
export async function preguntarAGoogle(consulta: string, senal?: AbortSignal): Promise<SugerenciaDireccion[] | null> {
  if (typeof window === "undefined" || !partirCalleYNumero(consulta)) return [];
  const clave = consulta.trim().toLowerCase();
  const recordada = yaPreguntado.get(clave);
  if (recordada) return recordada;
  try {
    const res = await fetch("/api/geocodificar", {
      signal: tope(12_000, senal),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direccion: consulta }),
    });
    if (!res.ok) return null;
    const datos = (await res.json()) as { sugerencias?: SugerenciaDireccion[] };
    const puertas = datos.sugerencias ?? [];
    if (yaPreguntado.size >= MAX_RECORDADAS) yaPreguntado.delete(yaPreguntado.keys().next().value!);
    yaPreguntado.set(clave, puertas);
    return puertas;
  } catch {
    return null;
  }
}

/** La puerta según Google, o lista vacía (sin acierto o sin poder preguntar). */
export async function conGoogle(consulta: string, senal?: AbortSignal): Promise<SugerenciaDireccion[]> {
  return (await preguntarAGoogle(consulta, senal)) ?? [];
}
