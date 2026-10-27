// Google Geocoding como último recurso (spec 016, US3): solo cuando Mapbox y OSM
// no dieron la puerta exacta y la dirección trae número. Es el proveedor que
// tiene numeradas las calles largas de Arica que los otros dos no.
//
// Decisión del dueño (2026-10-25), con lo que implica a la vista:
//   · Los términos de Google Maps Platform no permiten usar sus resultados con
//     un mapa que no sea de Google, y ARES dibuja y rutea con Mapbox.
//   · Google recibe la dirección (sin nombre ni teléfono): figura en
//     docs/PRIVACIDAD.md.
//   · Cobra por consulta sobre el cupo gratis mensual; acá entran solo las que
//     los otros no resolvieron.
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

/** Pregunta a Google con la clave del servidor. Nunca lanza. */
export async function googleDirecto(consulta: string, clave: string): Promise<SugerenciaDireccion[]> {
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
    if (!res.ok) return [];
    const datos = (await res.json()) as { status?: string; results?: ResultadoGoogle[] };
    if (datos.status !== "OK") return [];
    return (datos.results ?? []).flatMap((r) => aSugerenciaGoogle(r, consulta) ?? []);
  } catch {
    return [];
  }
}

/** La puerta según Google, o lista vacía (sin clave en el servidor, sin señal o
 *  sin acierto). Solo desde el navegador: en el servidor (la dirección de la
 *  empresa en el panel) no se usa. */
export async function conGoogle(consulta: string): Promise<SugerenciaDireccion[]> {
  if (typeof window === "undefined" || !partirCalleYNumero(consulta)) return [];
  try {
    const res = await fetch("/api/geocodificar", {
      signal: tope(12_000),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direccion: consulta }),
    });
    if (!res.ok) return [];
    const datos = (await res.json()) as { sugerencias?: SugerenciaDireccion[] };
    return datos.sugerencias ?? [];
  } catch {
    return [];
  }
}
