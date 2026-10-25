// Mapbox (geocodificación v6): sugerencias mientras se escribe y la consulta de
// una dirección completa. Ver la cabecera de ./index.ts.

import { tokenMapbox } from "@/lib/geo/mapbox/token";
import { comoPlusCode } from "./codigo";
import { calleDeLaConsulta, esLaCalleEscrita, normalizarConsulta } from "./consulta";
import {
  BBOX_ARICA,
  CANDIDATOS_POR_PROVEEDOR,
  MIN_CARACTERES,
  type Confianza,
  type SugerenciaDireccion,
} from "./tipos";

const MAPBOX_GEOCODE = "https://api.mapbox.com/search/geocode/v6/forward";

// Qué se ofrece: la puerta exacta primero, la calle sola si todavía no escribió
// el número, y barrio/ciudad como último recurso. La v6 no tiene puntos de
// interés ("poi" es de la API de Búsqueda y acá devuelve error).
const TIPOS = "address,street,neighborhood,place";

export type FeatureV6 = {
  id?: string;
  properties?: {
    mapbox_id?: string;
    feature_type?: string;
    name?: string;
    place_formatted?: string;
    coordinates?: { longitude?: number; latitude?: number };
    /** Qué parte de lo que se pidió pudo hacer coincidir de verdad. */
    match_code?: { street?: string; address_number?: string; confidence?: string };
  };
};

export function urlMapbox(texto: string, extra: Record<string, string>): string | null {
  const token = tokenMapbox();
  if (!token) return null;

  const params = new URLSearchParams({
    q: texto,
    country: "cl",
    bbox: BBOX_ARICA,
    types: TIPOS,
    language: "es",
    access_token: token,
    ...extra,
  });
  return `${MAPBOX_GEOCODE}?${params}`;
}

// "Arica, Región de Arica y Parinacota 1000000, Chile" → "Arica, Región de
// Arica y Parinacota". El país y el código postal ocupan media línea en el
// teléfono y no distinguen una sugerencia de otra.
function detalleCorto(place: string | undefined): string | null {
  if (!place) return null;
  return place.replace(/,\s*Chile\s*$/i, "").replace(/\s+\d{5,}/g, "").trim() || null;
}

export function aSugerencia(f: FeatureV6, calleEscrita: string): SugerenciaDireccion[] {
  const p = f.properties ?? {};

  // Mapbox INTERPOLA el número de casa sobre cualquier calle que le suene
  // parecida, y no avisa. Para "Av. Diego Portales 2000" devolvió seis avenidas
  // distintas con el 2000 —Palza Corvacho, Capitán Ávalos, Linderos…— y ninguna
  // era Diego Portales. Mandar al conductor a esa dirección es mandarlo a otro
  // barrio con el paquete.
  //
  // Las delata su propio match_code: street "unmatched" significa que la calle
  // que devuelve NO es la que se pidió. Un resultado bueno trae "matched", y los
  // que son una calle sola (sin número) no traen match_code — esos se quedan.
  //
  // Pero Mapbox también marca "unmatched" calles que SÍ son la pedida, cuando la
  // calle tiene dos nombres en sus datos: "Alejandro Azolas 3391" vuelve con la
  // puerta exacta y street "unmatched" porque la avenida se llama además
  // "Avenida Alejandro Azola" (spec 016). Por eso la última palabra la tiene
  // nuestra comparación de nombres, no la de Mapbox.
  if (
    p.match_code?.street === "unmatched" &&
    !esLaCalleEscrita(calleEscrita, calleDeLaConsulta(p.name ?? ""))
  ) {
    return [];
  }

  const lat = p.coordinates?.latitude;
  const lng = p.coordinates?.longitude;
  const direccion = p.name?.trim();
  if (lat == null || lng == null || !direccion) return [];

  const soloCalle = p.feature_type === "street";
  const numero = p.match_code?.address_number;

  return [
    {
      id: p.mapbox_id ?? f.id ?? `${lat},${lng}`,
      direccion,
      detalle: detalleCorto(p.place_formatted),
      lat,
      lng,
      soloCalle,
      confianza: confianzaMapbox(p),
      // "plausible" NO es false. Mapbox devolvió el número que se le pidió —lo
      // que no tiene es la puerta— y marcarlo como false le pinta al conductor la
      // marca grave "otro número" (ver direccion-input) sobre una dirección que
      // está bien escrita, y además dispara la búsqueda cara de
      // completarNumeroEnCalles() para nada. null es lo que corresponde: el
      // proveedor no lo confirma.
      coincideNumero: numero == null || numero === "plausible" ? null : numero === "matched",
      fuente: "mapbox",
    },
  ];
}

/** Traduce el match_code de Mapbox a nuestra escala.
 *
 *  Se mira el TIPO de resultado y no solo el `confidence`: un barrio con
 *  confianza "exact" sigue siendo un barrio, y entregar en el centroide de un
 *  barrio no es entregar.
 *
 *  ⚠️ Y NO se decide por `confidence`. Esto se aprendió caro: Mapbox recalibró
 *  esa cifra y hoy contesta "low" para PRÁCTICAMENTE TODA dirección de Arica
 *  —medido, 23 de 23— porque la consulta no trae código postal, comuna ni
 *  región, y esos componentes pesan aunque nadie los haya pedido. Como acá
 *  "low" devolvía "baja", ubicarDireccion() dejaba `elegida` en null SIEMPRE y
 *  ningún pedido entraba a la ruta: el conductor veía "confírmala antes de salir"
 *  en cada dirección. Las pruebas seguían en verde porque los fixtures se
 *  habían capturado antes del cambio, que es exactamente el agujero que avisa
 *  pruebas/README.md.
 *
 *  Lo que sí siguió siendo confiable —verificado contra la API viva— son los
 *  COMPONENTES: dicen cosa por cosa qué se pudo hacer coincidir. Se decide con
 *  esos, y `confidence` no se lee. */
function confianzaMapbox(p: NonNullable<FeatureV6["properties"]>): Confianza {
  if (p.feature_type === "neighborhood" || p.feature_type === "place") return "baja";
  if (p.feature_type === "street") return "aproximada";

  // Acá ya no llega ningún street "unmatched": aSugerencia() los descarta antes
  // (ver el comentario de la interpolación allá arriba). Así que la calle es la
  // correcta y lo único en juego es la PUERTA:
  //
  //   "matched"    la puerta existe en los datos de Mapbox.
  //   "plausible"  el número cae en el rango de la cuadra pero la puerta no
  //                está: la posición es INTERPOLADA. Sirve para llegar a la
  //                cuadra, no a la puerta — que es la definición de
  //                "aproximada".
  //   sin dato     no se asume lo mejor: aproximada, que es lo que se sabe.
  return p.match_code?.address_number === "matched" ? "exacta" : "aproximada";
}

// Direcciones que Mapbox ofrece para lo que se escribió hasta ahora. Nunca
// lanza: quedarse sin sugerencias (sin señal, sin token, texto muy corto) tiene
// que dejar el campo funcionando como un campo de texto normal.
//
// "senal" corta la consulta cuando el conductor siguió escribiendo. Una consulta
// cancelada devuelve lista vacía, así que el llamador debe descartar la
// respuesta —no vaciar lo que ya mostraba— si su propia señal quedó abortada.

export async function sugerirDirecciones(
  texto: string,
  senal?: AbortSignal,
): Promise<SugerenciaDireccion[]> {
  // Un código no se le pregunta a ningún proveedor. Sale de acá sin tocar la
  // red, así que la sugerencia aparece mientras el conductor todavía escribe.
  const codigo = comoPlusCode(texto);
  if (codigo) return [codigo.sugerencia];

  // El largo mínimo se mide sobre lo ESCRITO y no sobre lo normalizado: si no,
  // escribir "Av." (que normaliza a "avenida") disparaba una consulta por una
  // abreviatura sola.
  if (texto.trim().length < MIN_CARACTERES) return [];
  const q = normalizarConsulta(texto);
  if (!q) return [];

  const url = urlMapbox(q, { limit: "6", autocomplete: "true" });
  if (!url) return [];

  try {
    const res = await fetch(url, { signal: senal });
    if (!res.ok) return [];
    const datos = (await res.json()) as { features?: FeatureV6[] };
    const sugerencias = (datos.features ?? []).flatMap((f) => aSugerencia(f, calleDeLaConsulta(q)));

    // Mapbox suele devolver la calle Y la puerta con el mismo texto: en la
    // lista se verían dos renglones idénticos.
    const vistas = new Set<string>();
    return sugerencias.filter((s) => {
      const clave = s.direccion.toLowerCase();
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
  } catch {
    return [];
  }
}

export async function conMapbox(direccion: string): Promise<SugerenciaDireccion[]> {
  // autocomplete=false: acá la dirección está completa, no es un prefijo que el
  // conductor esté tecleando.
  const url = urlMapbox(direccion, {
    limit: String(CANDIDATOS_POR_PROVEEDOR),
    autocomplete: "false",
  });
  if (!url) return [];

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const datos = (await res.json()) as { features?: FeatureV6[] };
    return (datos.features ?? []).flatMap((f) => aSugerencia(f, calleDeLaConsulta(direccion)));
  } catch {
    return [];
  }
}
