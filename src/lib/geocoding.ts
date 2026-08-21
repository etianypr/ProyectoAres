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

// ----------------------------------------------------------------------------
// Normalizar la dirección ANTES de buscarla
// ----------------------------------------------------------------------------
//
// Lo que el chofer escribe y lo que un geocodificador entiende no son lo mismo.
// Tres arreglos, todos medidos contra direcciones reales de la operación:
//
//   1. Las abreviaturas. "Av. Chacabuco" y "Avda Chacabuco" son la misma calle,
//      pero Mapbox y Nominatim las puntúan distinto según cómo vengan escritas.
//   2. El "#" y el "N°" del número. "Chacabuco #500" le hace perder el número a
//      Nominatim, que lo trata como parte del nombre de la calle.
//   3. Lo que va DESPUÉS del número: "depto 42", "casa B", "block 3". Es
//      información que el chofer necesita para tocar el timbre correcto, pero
//      para el geocodificador es ruido que empuja el resultado a otra cuadra.
//
// OJO con el punto 3: se saca de la CONSULTA, no de la dirección guardada. El
// pedido conserva el texto entero — sin el "depto 42" el chofer llega al edificio
// y no sabe a qué puerta ir.

// OJO CON EL ORDEN DE `\b` Y EL PUNTO, que es donde esto se rompió una vez: el
// límite de palabra va ANTES del punto opcional, no después. Escrito al revés
// (`\bav\.?\b`), "Av." dejaba el punto sin consumir y quedaba "avenida.
// Chacabuco" — una consulta que ningún proveedor resuelve. Pasa porque entre "."
// y " " no hay límite de palabra, así que el motor prefiere no consumir el punto.
const ABREVIATURAS: [RegExp, string][] = [
  [/\bav(?:da|e)?\b\.?/gi, "avenida"],
  [/\bps?je\b\.?/gi, "pasaje"],
  [/\bpob(?:la?)?\b\.?/gi, "población"],
  [/\bvill\b\.?/gi, "villa"],
  [/\bcond\b\.?/gi, "condominio"],
  [/\bcje\b\.?/gi, "callejón"],
  // "N°", "Nº", "No." antes de un número: es "acá viene el número".
  [/\bn[°ºo]\.?\s*(?=\d)/gi, ""],
  // El "#" va aparte y SIN `\b`: "#" no es un carácter de palabra, así que entre
  // el espacio anterior y el "#" no hay ningún límite que anclar.
  [/#\s*(?=\d)/g, ""],
];

/** Lo que viene después del número y no ayuda a ubicar la puerta en el mapa. */
const UNIDAD_INTERIOR =
  /\s*[,-]?\s*\b(?:depto|dpto|depart(?:amento)?|depa|of(?:icina)?|blk|block|torre|casa|piso|local|km)\b.*$/i;

/** "S/N" es "sin número": dejarlo hace que el geocodificador busque una calle
 *  llamada "Los Aromos sn". */
const SIN_NUMERO = /\s*\bs\s*\/?\s*n\.?\s*$/i;

/** Prepara el texto para consultarlo. NO es lo que se guarda en el pedido: el
 *  pedido conserva lo que el chofer escribió, con el depto y todo. */
export function normalizarConsulta(texto: string): string {
  let t = texto.trim().replace(/\s+/g, " ");
  for (const [de, a] of ABREVIATURAS) t = t.replace(de, a);
  t = t.replace(UNIDAD_INTERIOR, "");
  t = t.replace(SIN_NUMERO, "");
  return t.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

/** Cuánto se puede confiar en que esa coordenada es la puerta del pedido.
 *
 *  Es lo que decide si la aplicación puede seguir sola o tiene que preguntarle
 *  al conductor. La constitución es explícita: ante ambigüedad, exponerla en vez
 *  de elegir en silencio una ubicación insegura (principio IV). */
export type Confianza =
  /** La puerta exacta, con su número, o un punto de interés que ES el destino. */
  | "exacta"
  /** La calle correcta, pero no la puerta: la parada queda a mitad de cuadra. */
  | "aproximada"
  /** El barrio o la ciudad. Sirve para orientarse, no para entregar. */
  | "baja";

/** Qué encontró la búsqueda de una dirección completa. */
export type TipoUbicacion =
  /** Una sola coincidencia y con número: se puede usar sin preguntar. */
  | "exacta"
  /** Varias coincidencias plausibles y separadas: TIENE que elegir el chofer. */
  | "ambigua"
  /** Se encontró la calle pero no el número. */
  | "solo_calle"
  /** Ningún proveedor la reconoció. */
  | "no_encontrada";


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
  /** Cuánto se puede confiar en esta coordenada. Se muestra en la lista: es la
   *  diferencia entre "andá tranquilo" y "confirmá antes de salir". */
  confianza: Confianza;
  /** Si el NÚMERO de casa que se pidió es el que devolvió el proveedor.
   *  null cuando no se pidió número o cuando el proveedor no lo informa. */
  coincideNumero: boolean | null;
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
      coincideNumero: numero == null ? null : numero === "matched",
      fuente: "mapbox",
    },
  ];
}

/** Traduce el match_code de Mapbox a nuestra escala.
 *
 *  Se mira el TIPO de resultado y no solo el `confidence`: un barrio con
 *  confianza "exact" sigue siendo un barrio, y entregar en el centroide de un
 *  barrio no es entregar. */
function confianzaMapbox(p: NonNullable<FeatureV6["properties"]>): Confianza {
  if (p.feature_type === "neighborhood" || p.feature_type === "place") return "baja";
  if (p.feature_type === "street") return "aproximada";

  // Una dirección con número: manda lo que diga el proveedor de su propia
  // coincidencia. Sin match_code (pasa en algunos resultados) no se asume lo
  // mejor: queda como aproximada, que es lo que se sabe.
  switch (p.match_code?.confidence) {
    case "exact":
    case "high":
      return p.match_code?.address_number === "matched" ? "exacta" : "aproximada";
    case "medium":
      return "aproximada";
    case "low":
      return "baja";
    default:
      return "aproximada";
  }
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

  // Una calle sin número de casa deja la parada a mitad de cuadra. Un punto de
  // interés (un terminal, una plaza) no: ese ES el destino.
  const soloCalle = f.category === "highway" && !dir.house_number;

  return [
    {
      id: `osm-${f.osm_type ?? ""}${f.osm_id ?? f.place_id ?? `${lat},${lng}`}`,
      direccion,
      detalle,
      lat,
      lng,
      soloCalle,
      // Con número de casa, OSM da la puerta. Un punto de interés con nombre
      // también es un destino exacto. Una calle sola, no.
      confianza: dir.house_number || (!soloCalle && f.name) ? "exacta" : "aproximada",
      // Nominatim no informa si el número pedido coincide; que lo devuelva ya
      // dice que lo tiene, y eso es todo lo que se puede afirmar.
      coincideNumero: dir.house_number ? true : null,
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
  if (texto.trim().length < MIN_CARACTERES) return [];
  const q = normalizarConsulta(texto);
  if (!q) return [];

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

// Se piden VARIOS candidatos y no uno solo (antes era limit=1). Con uno solo no
// hay forma de saber que la dirección era ambigua: el proveedor devuelve el
// primero y la app lo acepta como si fuera el único, que es exactamente lo que
// el principio IV de la constitución prohibe.
const CANDIDATOS_POR_PROVEEDOR = 5;

async function conMapbox(direccion: string): Promise<SugerenciaDireccion[]> {
  // autocomplete=false: acá la dirección está completa, no es un prefijo que el
  // chofer esté tecleando.
  const url = urlMapbox(direccion, {
    limit: String(CANDIDATOS_POR_PROVEEDOR),
    autocomplete: "false",
  });
  if (!url) return [];

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const datos = (await res.json()) as { features?: FeatureV6[] };
    return (datos.features ?? []).flatMap(aSugerencia);
  } catch {
    return [];
  }
}

// La ciudad se agrega para desambiguar direcciones cortas ("Av. Colón 123")
// que sin ella podrían matchear en cualquier país.
async function conNominatim(direccion: string): Promise<SugerenciaDireccion[]> {
  const params = new URLSearchParams({
    q: `${direccion}, Arica, Chile`,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(CANDIDATOS_POR_PROVEEDOR),
    "accept-language": "es",
  });

  const filas = await pedirNominatim(params);
  if (!filas) return [];
  return (filas as FilaOsm[]).flatMap(aSugerenciaOsm);
}

// Dos coincidencias más separadas que esto son lugares DISTINTOS, no dos formas
// de escribir el mismo. Trescientos metros es más de una cuadra de Arica: por
// debajo de eso, elegir cualquiera deja al chofer en la puerta o en la de al
// lado; por encima, lo manda a otro barrio.
const METROS_AMBIGUEDAD = 300;

/** Distancia aproximada en metros. Alcanza de sobra para decidir si dos puntos
 *  son el mismo lugar: a esta escala la curvatura de la Tierra no cambia nada, y
 *  la app ya usa el mismo criterio para la navegación. */
function metrosEntre(a: Coordenada, b: Coordenada): number {
  const latMedia = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos(latMedia);
  return Math.hypot(dLat, dLng);
}

export type ResultadoUbicacion = {
  tipo: TipoUbicacion;
  /** Todas las coincidencias, la mejor primero. El chofer elige de acá cuando
   *  hay ambigüedad. */
  candidatos: SugerenciaDireccion[];
  /** La única que la aplicación se permite usar SIN preguntar. null cuando hay
   *  que preguntar, y ese null es la mitad del valor de esta función. */
  elegida: SugerenciaDireccion | null;
  /** Mostrable tal cual, o null si no hay nada que advertir. */
  advertencia: string | null;
};

/** Busca una dirección ya escrita y dice qué se encontró, SIN elegir por su
 *  cuenta cuando hay dudas.
 *
 *  Es la función que reemplaza al viejo "toma el primer resultado y seguí". La
 *  diferencia importa en un caso concreto y medido: "Los Aromos 120" existe en
 *  Arica y en el valle de Azapa, a nueve kilómetros. Tomando el primero, el
 *  chofer sale con el paquete hacia el lugar equivocado y no se entera hasta
 *  llegar.
 *
 *  Los dos proveedores se consultan SIEMPRE, no en cascada: se necesitan las dos
 *  listas para poder detectar que dos lugares distintos responden al mismo
 *  texto. Mapbox va primero porque tiene los números de casa (ver la cabecera). */
export async function ubicarDireccion(direccion: string): Promise<ResultadoUbicacion> {
  const q = normalizarConsulta(direccion);
  if (!q) {
    return { tipo: "no_encontrada", candidatos: [], elegida: null, advertencia: "La dirección está vacía." };
  }

  // En paralelo: son proveedores distintos y ninguno depende del otro. El
  // espaciado que pide OpenStreetMap lo garantiza su propia fila de turnos (ver
  // la cabecera), no una espera acá.
  const [deMapbox, deOsm] = await Promise.all([conMapbox(q), conNominatim(q)]);
  const candidatos = combinarSugerencias(deMapbox, deOsm);

  if (candidatos.length === 0) {
    return {
      tipo: "no_encontrada",
      candidatos: [],
      elegida: null,
      advertencia:
        "No encontramos esa dirección en el mapa. Revísala o marca el punto a mano.",
    };
  }

  // Ambigüedad de verdad: dos candidatos con el MISMO texto de dirección pero en
  // lugares separados. Dos textos distintos no son ambiguos — son dos opciones
  // entre las que el chofer ya puede distinguir leyendo.
  const mejor = candidatos[0];
  const gemelos = candidatos.filter(
    (c) => normalizar(c.direccion) === normalizar(mejor.direccion),
  );
  const lejano = gemelos.find((c) => metrosEntre(c, mejor) > METROS_AMBIGUEDAD);

  if (lejano) {
    return {
      tipo: "ambigua",
      candidatos,
      // A propósito null: la aplicación NO elige entre dos lugares distintos con
      // el mismo nombre.
      elegida: null,
      advertencia: `"${mejor.direccion}" aparece en más de un lugar. Elige cuál es.`,
    };
  }

  if (mejor.soloCalle || mejor.confianza !== "exacta") {
    return {
      tipo: mejor.soloCalle ? "solo_calle" : "ambigua",
      candidatos,
      elegida: null,
      advertencia: mejor.soloCalle
        ? "Encontramos la calle pero no el número: la parada queda a mitad de cuadra. Revisa el número o marca el punto."
        : "La ubicación encontrada no es exacta. Confírmala antes de salir.",
    };
  }

  return { tipo: "exacta", candidatos, elegida: mejor, advertencia: null };
}

/** La versión de siempre: solo las coordenadas, o null.
 *
 *  Se conserva porque hay dos usos en los que no hay nadie a quien preguntar y
 *  una coordenada aproximada es mejor que ninguna: la dirección de la EMPRESA
 *  (punto de partida de la ruta) y el reintento automático de ubicar pedidos al
 *  armarla.
 *
 *  Para un pedido que el chofer está mirando hay que usar ubicarDireccion(): esta
 *  se queda con la mejor coincidencia sin decir que había otra. */
export async function geocodificarDireccion(direccion: string): Promise<Coordenada | null> {
  const r = await ubicarDireccion(direccion);
  const punto = r.elegida ?? r.candidatos[0];
  return punto ? { lat: punto.lat, lng: punto.lng } : null;
}
