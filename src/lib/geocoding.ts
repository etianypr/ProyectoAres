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
// El tercer camino, y el único que no le pregunta a nadie: un Plus Code se
// resuelve con aritmética. Ver el bloque de más abajo y lib/geo/plus-code.ts.
import { resolverPlusCode } from "@/lib/geo/plus-code";

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
  /** La calle es la correcta y el número cae en su cuadra, pero la puerta exacta
   *  no está en los datos del proveedor: la posición es INTERPOLADA. Se usa —el
   *  chofer llega a la cuadra— con la advertencia a la vista. */
  | "aproximada"
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
  fuente: Fuente;
};

export type Fuente = "mapbox" | "osm" | "plus_code";

/** Cómo se llama cada fuente en pantalla.
 *
 *  Es un Record sobre la unión a propósito, y no un `=== "osm" ? … : "Mapbox"`
 *  escrito en cada pantalla: así estaba antes, en dos archivos, y el `else`
 *  etiquetaba como "Mapbox" cualquier fuente nueva. Con esto, agregar una
 *  fuente sin ponerle nombre no compila. */
export const NOMBRE_FUENTE: Record<Fuente, string> = {
  mapbox: "Mapbox",
  osm: "OSM",
  plus_code: "Plus Code",
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
      // "plausible" NO es false. Mapbox devolvió el número que se le pidió —lo
      // que no tiene es la puerta— y marcarlo como false le pinta al chofer la
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
 *  ningún pedido entraba a la ruta: el chofer veía "confírmala antes de salir"
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
// ---------------------------------------------------------------------------
// Plus Codes: el camino corto
// ---------------------------------------------------------------------------
//
// Un Plus Code YA ES la ubicación. No hay nada que buscar, nada que consultar y
// nada sobre lo que dudar: se resuelve con aritmética, sin red, sin API key y
// siempre igual (ver lib/geo/plus-code.ts).
//
// Que esto exista en el campo de dirección es la respuesta al problema de fondo
// de Arica, y está medido: de 23 direcciones reales, Mapbox tiene la puerta
// exacta en 2 y estima el resto (npm run sondear). Para una casa sin número, un
// código dictado por teléfono —"GMCP+MX"— ubica mejor que cualquier dirección
// escrita, y ubica igual de bien mañana.
//
// Por eso corta antes que los proveedores en los tres caminos de entrada: no
// tiene sentido preguntarle a Mapbox por algo que ya sabemos.

/** Un código con este recuadro o menos apunta a la puerta. Diez dígitos dan
 *  ~14 m; once, ~3 m. Por encima de esto ya es la cuadra o el barrio y hay que
 *  decirlo. */
const METROS_PUERTA = 20;

/** ¿Lo escrito es un Plus Code? Se pregunta antes de normalizar: la
 *  normalización está pensada para direcciones y no tiene por qué respetar un
 *  código. */
export function esPlusCode(texto: string): boolean {
  return resolverPlusCode(texto) !== null;
}

/** El Plus Code escrito, ya como sugerencia, con el tamaño de su recuadro al
 *  lado: eso último no entra en SugerenciaDireccion y hace falta para poder
 *  decirle al chofer CUÁNTO cubre un código impreciso. null si no era código. */
function comoPlusCode(
  texto: string,
): { sugerencia: SugerenciaDireccion; precisionMetros: number } | null {
  const r = resolverPlusCode(texto);
  if (!r) return null;

  const sugerencia: SugerenciaDireccion = {
    id: `plus:${r.codigoCompleto}`,
    // Se guarda el código COMPLETO y no lo que se escribió: un código corto no
    // significa nada sin saber respecto de dónde se leyó, y lo que queda
    // guardado en el pedido tiene que valerse solo.
    direccion: r.codigoCompleto,
    detalle: `Plus Code · ±${r.precisionMetros} m`,
    lat: r.lat,
    lng: r.lng,
    soloCalle: false,
    confianza: r.precisionMetros <= METROS_PUERTA ? "exacta" : "aproximada",
    // No hay número de casa en juego: no es que no coincida, es que no aplica.
    coincideNumero: null,
    fuente: "plus_code",
  };

  return { sugerencia, precisionMetros: r.precisionMetros };
}

export async function sugerirDirecciones(
  texto: string,
  senal?: AbortSignal,
): Promise<SugerenciaDireccion[]> {
  // Un código no se le pregunta a ningún proveedor. Sale de acá sin tocar la
  // red, así que la sugerencia aparece mientras el chofer todavía escribe.
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
  // Los dos proveedores se consultan en paralelo desde la misma pantalla (ver
  // direccion-input): si el código ya salió por el otro lado, preguntar acá
  // sería gastar el turno de OpenStreetMap para traer ruido.
  if (esPlusCode(texto)) return [];
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

// ----------------------------------------------------------------------------
// El número que quedó colgando: "Linderos 3536"
// ----------------------------------------------------------------------------
//
// Caso medido en la operación, y de los que más tiempo hacen perder: la calle se
// llama "Avenida Linderos Poniente" y en la boleta dice "Linderos 3536". Los dos
// proveedores contestan la CALLE marcada "sin número" —el 3536 se pierde— y la
// puerta aparece recién si el chofer escribe el nombre largo entero. Treinta
// veces al día eso son tres palabras de más cada vez, o un pedido sin ubicar.
//
// La regla es simple y es la que pidió la operación: si TODO lo que escribió
// aparece, como palabra completa, en el nombre de una calle, entonces esa es la
// calle que tenía en la cabeza — y el número que puso al final hay que buscarlo
// ahí. Se toma el nombre OFICIAL de esa calle, se le pega el número, y se vuelve
// a preguntar:
//
//   escribe          "Linderos 3536"
//   contestan        "Avenida Linderos Poniente"   (sin número)
//                    "Avenida Linderos Oriente"    (sin número)
//   se pregunta      "Avenida Linderos Poniente 3536"
//                    "Avenida Linderos Oriente 3536"
//   queda            la o las que EXISTEN con ese número
//
// Tres cosas que esto NO hace, a propósito:
//
//   · no elige. Si el 3536 existe en las dos, salen las dos y elige el chofer.
//     Poniente y Oriente son avenidas distintas, no dos formas de escribir la
//     misma (principio IV: la ambigüedad se muestra, no se resuelve sola).
//   · no deja la que no sirve. Si el número existe en una sola, la otra SALE de
//     la lista: con el número escrito, una calle que no lo tiene dejó de ser una
//     opción, y ofrecerla —encima marcada "sin número"— es ofrecer justo la
//     equivocada.
//   · no adivina con palabras a medias. "Linder" no dispara nada: la palabra
//     tiene que estar entera. Es lo único que separa "es esta calle" de "se
//     parece a esta calle", que es el error que ya conocemos (ver más arriba el
//     número interpolado sobre otra calle).

/** Palabras que no distinguen una calle de otra: si lo único que coincide es
 *  "avenida" o "los", no coincidió nada.
 *
 *  OJO con lo que NO está en esta lista. "poniente", "oriente", "norte" y "sur"
 *  SÍ distinguen —son justamente lo que separa Linderos Poniente de Linderos
 *  Oriente—, así que escribir "Linderos Poniente" tiene que dejar la otra
 *  afuera. "San" y "Santa" tampoco están: San Marcos y Marcos Sanhueza son dos
 *  calles distintas de Arica. */
const PALABRAS_GENERICAS = new Set([
  "avenida",
  "av",
  "calle",
  "pasaje",
  "pje",
  "psje",
  "callejon",
  "camino",
  "poblacion",
  "villa",
  "condominio",
  "sector",
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "y",
]);

/** Las palabras de un texto, sin tildes y sin puntuación. */
function palabrasDe(texto: string): string[] {
  return normalizar(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** ¿Es esta calle la que se escribió? Lo es cuando TODAS las palabras que
 *  distinguen lo escrito están, enteras, en el nombre de la calle.
 *
 *  Se exige "todas" y no "alguna" para que escribir más sea siempre acotar más:
 *  "Linderos" acepta las dos avenidas, "Linderos Poniente" solo una. */
function esLaCalleEscrita(escrito: string, nombreCalle: string): boolean {
  const buscadas = palabrasDe(escrito).filter((p) => !PALABRAS_GENERICAS.has(p));
  if (buscadas.length === 0) return false;
  const enLaCalle = new Set(palabrasDe(nombreCalle));
  return buscadas.every((p) => enLaCalle.has(p));
}

/** Parte "Avenida Linderos Poniente 3536" en calle y número. null cuando el
 *  texto no termina en un número: ahí no hay ninguna puerta que buscar. */
function partirCalleYNumero(texto: string): { calle: string; numero: string } | null {
  // El `[^\d\s]` obliga a que la calle termine en algo que no sea un dígito: sin
  // eso, "21 de Mayo 500" se partía como calle "21 de" y número "Mayo 500".
  const m = /^(.*[^\d\s])\s+(\d{1,6})$/.exec(texto.trim());
  return m ? { calle: m[1].trim(), numero: m[2] } : null;
}

/** El nombre de calle de un candidato, para volver a preguntar por ella.
 *
 *  Una calle sola YA es su nombre. Una puerta con OTRO número ("Avenida Linderos
 *  Poniente 4200" cuando se pidió el 3536) lo trae pegado atrás y hay que
 *  sacárselo: esa es la misma calle, y es el otro síntoma del mismo problema.
 *  Una puerta cuyo número SÍ coincide no se toca — ya está resuelta. */
function nombreDeCalleDe(c: SugerenciaDireccion): string | null {
  if (c.soloCalle) return c.direccion.trim();
  if (c.coincideNumero === false) return partirCalleYNumero(c.direccion)?.calle ?? null;
  return null;
}

/** Cuántas calles se prueban con el número. Dos es el caso real (Linderos
 *  Poniente y Oriente) y la tercera es margen; más que eso ya no es "la calle
 *  que el chofer tenía en la cabeza" y son consultas que se pagan. */
const MAX_CALLES_A_PROBAR = 3;

/** Lo ya preguntado, mientras dure la pantalla. Escribiendo el número dígito a
 *  dígito la misma consulta vuelve a caer, y cada una se paga. */
const MAX_RECORDADAS = 60;
const yaPreguntado = new Map<string, SugerenciaDireccion[]>();

function recordar(clave: string, puertas: SugerenciaDireccion[]): void {
  if (yaPreguntado.size >= MAX_RECORDADAS) {
    const masVieja = yaPreguntado.keys().next();
    if (!masVieja.done) yaPreguntado.delete(masVieja.value);
  }
  yaPreguntado.set(clave, puertas);
}

/** Le pregunta a Mapbox por una puerta concreta —y solo a Mapbox: los números de
 *  casa de Arica los tiene él (ver la cabecera del archivo)—.
 *
 *  Devuelve null cuando no se pudo preguntar (sin señal, sin token, o el chofer
 *  siguió escribiendo). No es lo mismo que "ese número no existe ahí", y
 *  confundirlos borraría de la lista la única calle correcta por un corte de
 *  señal. */
async function puertaEnCalle(
  calle: string,
  numero: string,
  senal?: AbortSignal,
): Promise<SugerenciaDireccion[] | null> {
  const consulta = `${calle} ${numero}`;
  const clave = normalizar(consulta);
  const recordada = yaPreguntado.get(clave);
  if (recordada) return recordada;

  // autocomplete=false: esta consulta la armamos nosotros y está completa, no es
  // un prefijo a medio teclear.
  const url = urlMapbox(consulta, { limit: "2", autocomplete: "false" });
  if (!url) return null;

  try {
    const res = await fetch(url, { signal: senal });
    if (!res.ok) return null;
    const datos = (await res.json()) as { features?: FeatureV6[] };
    const puertas = (datos.features ?? [])
      .flatMap(aSugerencia)
      // El número tiene que ser EL QUE SE PIDIÓ y la calle, la que se preguntó.
      // Sin estos dos filtros volvemos al error de siempre: Mapbox interpola el
      // 3536 donde le parece y contesta con cara de resultado bueno.
      .filter((s) => s.coincideNumero === true && esLaCalleEscrita(calle, s.direccion));
    recordar(clave, puertas);
    return puertas;
  } catch {
    return null;
  }
}

export type PuertasEnCalles = {
  /** Las puertas que existen con ese número. Vacío si ninguna. */
  puertas: SugerenciaDireccion[];
  /** Las calles que se probaron y NO tienen ese número: las que el chofer
   *  descartó sin saberlo al escribirlo. */
  sinEseNumero: string[];
};

/** Busca el número escrito en las calles que se llaman como lo escrito.
 *
 *  Nunca lanza y no consulta nada cuando no hace falta: si el texto no termina
 *  en un número, o si alguien ya devolvió la puerta con ESE número, sale sin
 *  gastar una sola petición. Ese es el camino normal. */
export async function completarNumeroEnCalles(
  texto: string,
  candidatos: SugerenciaDireccion[],
  senal?: AbortSignal,
): Promise<PuertasEnCalles> {
  const nada: PuertasEnCalles = { puertas: [], sinEseNumero: [] };

  const partido = partirCalleYNumero(normalizarConsulta(texto));
  if (!partido) return nada;
  if (candidatos.some((c) => c.coincideNumero === true)) return nada;

  const calles: string[] = [];
  for (const c of candidatos) {
    const nombre = nombreDeCalleDe(c);
    if (!nombre || !esLaCalleEscrita(partido.calle, nombre)) continue;
    // La misma calle traída por los dos proveedores se pregunta una vez.
    if (calles.some((otra) => normalizar(otra) === normalizar(nombre))) continue;
    calles.push(nombre);
    if (calles.length === MAX_CALLES_A_PROBAR) break;
  }
  if (calles.length === 0) return nada;

  const respuestas = await Promise.all(
    calles.map((calle) => puertaEnCalle(calle, partido.numero, senal)),
  );

  const puertas: SugerenciaDireccion[] = [];
  const sinEseNumero: string[] = [];
  const vistas = new Set<string>();

  respuestas.forEach((deEstaCalle, i) => {
    if (deEstaCalle == null) return; // no se pudo preguntar: no se descarta nada
    if (deEstaCalle.length === 0) {
      sinEseNumero.push(calles[i]);
      return;
    }
    for (const p of deEstaCalle) {
      const clave = normalizar(p.direccion);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      puertas.push(p);
    }
  });

  return { puertas, sinEseNumero };
}

/** Mete las puertas encontradas arriba de la lista y saca las calles que no
 *  tienen ese número.
 *
 *  Si no apareció NINGUNA puerta no se saca nada: quedarse sin lista es peor que
 *  una lista imperfecta. */
export function aplicarPuertas(
  lista: SugerenciaDireccion[],
  { puertas, sinEseNumero }: PuertasEnCalles,
): SugerenciaDireccion[] {
  if (puertas.length === 0) return lista;
  const descartadas = new Set(sinEseNumero.map(normalizar));
  const resto = lista.filter((s) => !descartadas.has(normalizar(s.direccion)));
  // combinarSugerencias hace justo lo que hace falta acá: las puertas primero, y
  // de lo demás saca la calle sola cuyo nombre es el principio de una puerta ya
  // encontrada (ver su comentario).
  return combinarSugerencias(puertas, resto);
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
  // Un Plus Code no tiene ambigüedad que resolver: ES la ubicación. Se contesta
  // sin consultar a nadie, y por eso va antes que todo lo demás.
  const codigo = comoPlusCode(direccion);
  if (codigo) {
    const alaPuerta = codigo.sugerencia.confianza === "exacta";
    return {
      tipo: alaPuerta ? "exacta" : "aproximada",
      candidatos: [codigo.sugerencia],
      elegida: codigo.sugerencia,
      // Un código de pocos dígitos cubre media cuadra o el barrio entero. Se usa
      // igual —es lo que hay— pero con el tamaño a la vista, porque es la
      // diferencia entre llegar a la puerta y llegar a la esquina.
      advertencia: alaPuerta
        ? null
        : `Ese Plus Code cubre unos ${Math.round(codigo.precisionMetros)} m: apunta a la zona, no a la puerta.`,
    };
  }

  const q = normalizarConsulta(direccion);
  if (!q) {
    return { tipo: "no_encontrada", candidatos: [], elegida: null, advertencia: "La dirección está vacía." };
  }

  // En paralelo: son proveedores distintos y ninguno depende del otro. El
  // espaciado que pide OpenStreetMap lo garantiza su propia fila de turnos (ver
  // la cabecera), no una espera acá.
  const [deMapbox, deOsm] = await Promise.all([conMapbox(q), conNominatim(q)]);
  const primeraVuelta = combinarSugerencias(deMapbox, deOsm);

  // El número que quedó colgando de un nombre de calle a medias ("Linderos
  // 3536"). Va acá y no adentro de cada proveedor porque necesita las DOS
  // listas: OSM es el que tiene los nombres de calle correctos y Mapbox el que
  // tiene los números de casa.
  const completadas = await completarNumeroEnCalles(q, primeraVuelta);
  const candidatos = aplicarPuertas(primeraVuelta, completadas);

  if (candidatos.length === 0) {
    return {
      tipo: "no_encontrada",
      candidatos: [],
      elegida: null,
      advertencia:
        "No encontramos esa dirección en el mapa. Revísala o marca el punto a mano.",
    };
  }

  // Ese número existe en más de una calle que se llama como lo escrito: el
  // "Linderos 3536" que está en Linderos Poniente Y en Linderos Oriente. Acá la
  // aplicación no elige, aunque las dos coincidencias sean exactas y estén
  // lejísimo una de otra — son dos avenidas distintas y el único que sabe cuál
  // es el chofer.
  if (completadas.puertas.length > 1) {
    return {
      tipo: "ambigua",
      candidatos,
      elegida: null,
      advertencia:
        "Ese número existe en más de una calle que se llama así. Elige en cuál es.",
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

  // Solo la CALLE: no hay número que valga y no hay nada que interpolar. Sigue
  // sin elegirse sola.
  if (mejor.soloCalle) {
    return {
      tipo: "solo_calle",
      candidatos,
      elegida: null,
      advertencia:
        "Encontramos la calle pero no el número: la parada queda a mitad de cuadra. Revisa el número o marca el punto.",
    };
  }

  // La puerta está INTERPOLADA: calle correcta, número dentro de su cuadra,
  // pero el proveedor no tiene esa puerta. Entra a la ruta CON la advertencia a
  // la vista, y esto es una decisión medida y no una comodidad: Mapbox contesta
  // "plausible" en 10 de cada 23 direcciones de Arica. Dejarlas todas fuera es
  // lo que estuvo pasando —el chofer confirmaba a mano ruta por ruta— y nadie
  // confirma media ruta: se sale igual, o no se sale. Llegar a la cuadra
  // correcta con el cartel puesto es mejor que no llegar.
  if (mejor.confianza !== "exacta") {
    return {
      tipo: "aproximada",
      candidatos,
      elegida: mejor,
      advertencia:
        "La ubicación es aproximada: llegas a la cuadra, no a la puerta. Confirma el número al llegar.",
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
