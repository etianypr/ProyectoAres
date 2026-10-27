// OpenStreetMap (Nominatim): nombres de calle y puntos de interés. Ver la
// cabecera de ./index.ts.

import { tope } from "@/lib/comun/tope";
import { esPlusCode } from "./codigo";
import { normalizarConsulta } from "./consulta";
import { BBOX_ARICA, CANDIDATOS_POR_PROVEEDOR, MIN_CARACTERES, type SugerenciaDireccion } from "./tipos";

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
  // Mientras esperaba el turno el conductor siguió escribiendo: esta consulta ya no
  // le importa a nadie.
  if (senal?.aborted) return null;

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: tope(10_000, senal),
    });
    if (!res.ok) return null;
    const datos = await res.json();
    return Array.isArray(datos) ? datos : null;
  } catch {
    return null;
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
    viewbox: BBOX_ARICA,
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

// La ciudad se agrega para desambiguar direcciones cortas ("Av. Colón 123")
// que sin ella podrían matchear en cualquier país.
export async function conNominatim(direccion: string): Promise<SugerenciaDireccion[]> {
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
