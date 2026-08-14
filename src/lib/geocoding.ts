// Direcciones → coordenadas. Dos usos distintos:
//
//   sugerirDirecciones()    mientras el chofer ESCRIBE, para que elija la
//                           dirección de una lista y se sepa ahí mismo que
//                           existe (y con qué coordenadas exactas).
//   geocodificarDireccion() para una dirección ya escrita (la de la empresa, o
//                           un pedido cargado sin elegir sugerencia).
//
// Las dos corren en los DOS lados: en el servidor (panel admin) y en el
// navegador, desde la app del chofer.
//
// Se consulta a DOS proveedores, porque en Arica cada uno sabe cosas que el
// otro no. Medido con las direcciones reales de la empresa:
//
//   MAPBOX  tiene los NÚMEROS de casa ("Quinsachata 1749", "Chacabuco 500"), que
//           es lo que hace que la ruta llegue a la puerta. Es además el mismo
//           proveedor del mapa y de las indicaciones (ver lib/rutas.ts), así que
//           las coordenadas y el trazado vienen del mismo mundo. Pero no tiene
//           puntos de interés, y a veces devuelve OTRA calle: para
//           "Av. Diego Portales 2000" contestó "Avenida Senador Humberto Palza
//           Corvacho 2000".
//   OSM     tiene los puntos de interés y los nombres de población ("Terminal
//   (Nominatim) Rodoviario de Arica", "Población Nueva Esperanza") y los nombres de
//           calle correctos, pero casi no tiene números de casa en Arica. Y algo
//           que ningún otro proveedor puede dar: lo que la empresa MISMA corrige
//           en OpenStreetMap aparece acá en minutos.
//
// Por eso las sugerencias se muestran juntas (ver combinarSugerencias) en vez de
// elegir un proveedor: Mapbox primero, y debajo lo que OSM agrega.
//
// ⚠️ OJO con lo que se DIBUJA y con el CAMINO que elige la ruta: eso sale de las
// teselas y del grafo de calles de Mapbox, que se arman con OSM más fuentes
// propias y se refrescan cuando Mapbox los refresca. Una corrección hecha en
// OpenStreetMap NO aparece ahí al rato; Mapbox no publica cuánto tarda y no hay
// forma de apurarlo desde acá. Lo único que refleja OSM al instante es esta
// búsqueda de direcciones.
//
// OJO con el contrato de Mapbox: el geocodificador "temporal" —el que se usa
// acá, el que entra en el plan gratuito— permite mostrar y usar el resultado,
// pero no guardarlo indefinidamente. Nosotros SÍ guardamos lat/lng junto al
// pedido (es lo que hace que la ruta se pueda rearmar sin volver a consultar).
// Para quedar del lado limpio hay que activar "permanent geocoding" en la
// cuenta y agregarle "permanent=true" a la consulta; queda anotado acá para
// cuando la cuenta pase a plan pago.
const MAPBOX_GEOCODE = "https://api.mapbox.com/search/geocode/v6/forward";

// La empresa reparte en Arica: el recuadro ACOTA la búsqueda a la ciudad y su
// valle. Es lo que hace que escribir "colón 123" no ofrezca la Avenida Colón de
// Santiago. Es un filtro duro, a diferencia de "proximity", que solo empuja los
// resultados cercanos hacia arriba — probado contra la API: con proximity en
// Arica, el primer resultado de "colón 123" seguía siendo San Bernardo.
const RECUADRO_ARICA = "-70.45,-18.65,-70.10,-18.35";

// Qué se ofrece: la puerta exacta primero, la calle sola si todavía no escribió
// el número, y barrio/ciudad como último recurso. La v6 no tiene puntos de
// interés ("poi" es de la API de Búsqueda y acá devuelve error).
const TIPOS = "address,street,neighborhood,place";

/** Menos que esto no se consulta: con dos letras Mapbox devuelve cualquier
 *  cosa y se gastan consultas por cada tecla. */
const MIN_CARACTERES = 3;

// Nominatim. Uso muy bajo (~30 pedidos/día) — dentro de su política de uso justo
// (https://operations.osmfoundation.org/policies/nominatim/), que exige un
// User-Agent identificable y pone un máximo ABSOLUTO de una consulta por
// segundo. Desde el navegador ese User-Agent se descarta en silencio (es un
// header que no se deja fijar) y la política acepta el Referer que el navegador
// manda solo. Verificado: responde "access-control-allow-origin: *", así que la
// llamada desde el teléfono funciona.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "sistema-gestion-pucarani/1.0 (encomiendas; contacto: admin de la empresa)";

// El límite de una por segundo se respeta ACÁ, en el transporte, y no en cada
// pantalla que consulta: es la única forma de que nadie se lo pase por delante
// sin darse cuenta. Cada consulta toma turno en una fila y espera lo que le
// falte para cumplir el intervalo (antes esto estaba escrito a mano en
// generar-ruta.ts, que espaciaba sus reintentos con un sleep propio).
const MS_ENTRE_CONSULTAS_OSM = 1200;
let ultimaConsultaOsm = 0;
let filaOsm: Promise<void> = Promise.resolve();

function turnoOsm(): Promise<void> {
  const proximo = filaOsm.then(async () => {
    const falta = MS_ENTRE_CONSULTAS_OSM - (Date.now() - ultimaConsultaOsm);
    if (falta > 0) await new Promise((listo) => setTimeout(listo, falta));
    ultimaConsultaOsm = Date.now();
  });
  filaOsm = proximo;
  return proximo;
}

// Nunca lanza: sin OSM se sigue con lo que haya dado Mapbox.
async function pedirNominatim(
  params: URLSearchParams,
  senal?: AbortSignal,
): Promise<unknown[] | null> {
  await turnoOsm();
  // Mientras esperaba el turno el chofer siguió escribiendo: esta consulta ya no
  // le importa a nadie.
  if (senal?.aborted) return null;

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: senal,
    });
    if (!res.ok) return null;
    const datos = await res.json();
    return Array.isArray(datos) ? datos : null;
  } catch {
    return null;
  }
}

export type Coordenada = { lat: number; lng: number };

/** Una dirección ofrecida al chofer mientras escribe. Trae ya las coordenadas:
 *  elegirla de la lista es a la vez confirmar que existe y ubicarla, sin una
 *  segunda consulta. */
export type SugerenciaDireccion = {
  id: string;
  /** Lo que queda escrito en el campo al elegirla ("Avenida Chacabuco 1234"). */
  direccion: string;
  /** Renglón de abajo, más chico ("Arica, Región de Arica y Parinacota"). */
  detalle: string | null;
  lat: number;
  lng: number;
  /** true cuando el resultado es la CALLE y no una puerta concreta: el chofer
   *  todavía no escribió el número y hay que avisarle. */
  soloCalle: boolean;
  /** De dónde salió. Se muestra en la lista: es lo que le permite a la empresa
   *  ver que una corrección que hizo en OpenStreetMap ya está llegando a la app
   *  (Mapbox tarda lo suyo en incorporarlas, ver la cabecera). */
  fuente: "mapbox" | "osm";
};

type FeatureV6 = {
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

function urlMapbox(texto: string, extra: Record<string, string>): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams({
    q: texto,
    country: "cl",
    bbox: RECUADRO_ARICA,
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

function aSugerencia(f: FeatureV6): SugerenciaDireccion[] {
  const p = f.properties ?? {};

  // Mapbox INTERPOLA el número de casa sobre cualquier calle que le suene
  // parecida, y no avisa. Para "Av. Diego Portales 2000" devolvió seis avenidas
  // distintas con el 2000 —Palza Corvacho, Capitán Ávalos, Linderos…— y ninguna
  // era Diego Portales. Mandar al chofer a esa dirección es mandarlo a otro
  // barrio con el paquete.
  //
  // Las delata su propio match_code: street "unmatched" significa que la calle
  // que devuelve NO es la que se pidió. Un resultado bueno trae "matched", y los
  // que son una calle sola (sin número) no traen match_code — esos se quedan.
  if (p.match_code?.street === "unmatched") return [];

  const lat = p.coordinates?.latitude;
  const lng = p.coordinates?.longitude;
  const direccion = p.name?.trim();
  if (lat == null || lng == null || !direccion) return [];

  return [
    {
      id: p.mapbox_id ?? f.id ?? `${lat},${lng}`,
      direccion,
      detalle: detalleCorto(p.place_formatted),
      lat,
      lng,
      soloCalle: p.feature_type === "street",
      fuente: "mapbox",
    },
  ];
}

/** Una fila de Nominatim en formato jsonv2 (que llama "category" a lo que el
 *  formato viejo llamaba "class"). */
type FilaOsm = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  name?: string;
  display_name?: string;
  address?: {
    road?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
  };
};

function aSugerenciaOsm(f: FilaOsm): SugerenciaDireccion[] {
  const lat = Number(f.lat);
  const lng = Number(f.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const dir = f.address ?? {};
  // Orden chileno: primero la calle y después el número.
  const conNumero = dir.road && dir.house_number ? `${dir.road} ${dir.house_number}` : null;
  const direccion = (
    conNumero ??
    f.name ??
    dir.road ??
    f.display_name?.split(",")[0] ??
    ""
  ).trim();
  if (!direccion) return [];

  const detalle =
    [dir.neighbourhood ?? dir.suburb, dir.city ?? dir.town].filter(Boolean).join(", ") || null;

  return [
    {
      id: `osm-${f.osm_type ?? ""}${f.osm_id ?? f.place_id ?? `${lat},${lng}`}`,
      direccion,
      detalle,
      lat,
      lng,
      // Una calle sin número de casa deja la parada a mitad de cuadra. Un punto
      // de interés (un terminal, una plaza) no: ese ES el destino.
      soloCalle: f.category === "highway" && !dir.house_number,
      fuente: "osm",
    },
  ];
}

// Direcciones que Mapbox ofrece para lo que se escribió hasta ahora. Nunca
// lanza: quedarse sin sugerencias (sin señal, sin token, texto muy corto) tiene
// que dejar el campo funcionando como un campo de texto normal.
//
// "senal" corta la consulta cuando el chofer siguió escribiendo. Una consulta
// cancelada devuelve lista vacía, así que el llamador debe descartar la
// respuesta —no vaciar lo que ya mostraba— si su propia señal quedó abortada.
export async function sugerirDirecciones(
  texto: string,
  senal?: AbortSignal,
): Promise<SugerenciaDireccion[]> {
  const q = texto.trim();
  if (q.length < MIN_CARACTERES) return [];

  const url = urlMapbox(q, { limit: "6", autocomplete: "true" });
  if (!url) return [];

  try {
    const res = await fetch(url, { signal: senal });
    if (!res.ok) return [];
    const datos = (await res.json()) as { features?: FeatureV6[] };
    const sugerencias = (datos.features ?? []).flatMap(aSugerencia);

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

// Lo mismo, pero preguntándole a OpenStreetMap. Va SEPARADO de
// sugerirDirecciones y no dentro: Mapbox contesta en ~150 ms y Nominatim puede
// tardar el triple, así que esperarlos juntos haría que la lista entera aparezca
// tarde. La pantalla pide este después, con más pausa, y agrega lo que traiga.
//
// Ojo con qué esperar de acá: Nominatim NO completa palabras a medias
// ("chacab" devuelve vacío), así que esto aporta cuando la palabra ya está
// escrita. Por eso mismo conviene pedirlo con una espera más larga que el otro.
export async function sugerirEnOsm(
  texto: string,
  senal?: AbortSignal,
): Promise<SugerenciaDireccion[]> {
  const q = texto.trim();
  if (q.length < MIN_CARACTERES) return [];

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "4",
    countrycodes: "cl",
    // Mismo recuadro que Mapbox, y "bounded" lo hace filtro duro: sin esto,
    // "Chacabuco 500" trae el de Santiago o el de Concepción.
    viewbox: RECUADRO_ARICA,
    bounded: "1",
    "accept-language": "es",
  });

  const filas = await pedirNominatim(params, senal);
  if (!filas) return [];

  // Nominatim devuelve un resultado por TRAMO de calle: "Avenida Diego Portales"
  // puede venir cuatro veces, una por cada trozo con distinto tipo de vía.
  const vistas = new Set<string>();
  return (filas as FilaOsm[]).flatMap(aSugerenciaOsm).filter((s) => {
    const clave = s.direccion.toLowerCase();
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes
    .replace(/\s+/g, " ")
    .trim();
}

// Une las dos listas sin repetir: primero las de Mapbox —que son las que traen
// número de casa— y debajo las de OSM que aportan algo nuevo.
//
// Se descarta la calle de OSM cuando Mapbox ya dio "esa misma calle + número":
// sería un renglón peor justo debajo del bueno, y encima marcado "sin número".
export function combinarSugerencias(
  deMapbox: SugerenciaDireccion[],
  deOsm: SugerenciaDireccion[],
): SugerenciaDireccion[] {
  const yaEstan = deMapbox.map((s) => normalizar(s.direccion));
  const extras = deOsm.filter((s) => {
    const clave = normalizar(s.direccion);
    return !yaEstan.some((otra) => otra === clave || otra.startsWith(`${clave} `));
  });
  return [...deMapbox, ...extras];
}

async function conMapbox(direccion: string): Promise<Coordenada | null> {
  // autocomplete=false: acá la dirección está completa, no es un prefijo que el
  // chofer esté tecleando.
  const url = urlMapbox(direccion, { limit: "1", autocomplete: "false" });
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const datos = (await res.json()) as { features?: FeatureV6[] };
    const primera = (datos.features ?? []).flatMap(aSugerencia)[0];
    return primera ? { lat: primera.lat, lng: primera.lng } : null;
  } catch {
    return null;
  }
}

// La ciudad se agrega para desambiguar direcciones cortas ("Av. Colón 123")
// que sin ella podrían matchear en cualquier país.
async function conNominatim(direccion: string): Promise<Coordenada | null> {
  const params = new URLSearchParams({
    q: `${direccion}, Arica, Chile`,
    format: "json",
    limit: "1",
  });

  const filas = (await pedirNominatim(params)) as { lat: string; lon: string }[] | null;
  const primero = filas?.[0];
  if (!primero) return null;

  const lat = Number(primero.lat);
  const lng = Number(primero.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function geocodificarDireccion(direccion: string): Promise<Coordenada | null> {
  return (await conMapbox(direccion)) ?? (await conNominatim(direccion));
}
