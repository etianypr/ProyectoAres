// OpenStreetMap (Nominatim): nombres de calle y puntos de interés. Ver la
// cabecera de ./index.ts.

import { desde } from "@/lib/comun/cronometro";
import { hastaAbortar } from "@/lib/comun/hasta-abortar";
import { tope } from "@/lib/comun/tope";
import { esPlusCode } from "./codigo";
import { normalizarConsulta } from "./consulta";
import { BBOX_ARICA, CANDIDATOS_POR_PROVEEDOR, MIN_CARACTERES, type SugerenciaDireccion } from "./tipos";

// Nominatim. Uso muy bajo (~100 pedidos/día) — dentro de su política de uso justo
// (https://operations.osmfoundation.org/policies/nominatim/), que exige un
// User-Agent identificable y pone un máximo ABSOLUTO de una consulta por
// segundo, desde un solo hilo. Desde el navegador ese User-Agent se descarta en
// silencio (es un header que no se deja fijar) y la política acepta el Referer que
// el navegador manda solo. Verificado: responde "access-control-allow-origin: *",
// así que la llamada desde el teléfono funciona.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "ares-dashund/1.0 (encomiendas; contacto: admin de la empresa)";

// El límite se respeta ACÁ, en el transporte, y no en cada pantalla que consulta:
// es la única forma de que nadie se lo pase por delante sin darse cuenta. Cada
// consulta toma turno en una fila (antes esto estaba escrito a mano en
// generar-ruta.ts, que espaciaba sus reintentos con un sleep propio).
//
// Spec 038: una sola consulta abierta a la vez. El turno siguiente se da cuando la
// anterior llegó (o se abortó) Y pasaron 1,2 s desde que empezó; antes solo se
// espaciaban los comienzos y una consulta lenta podía quedar abierta junto a la
// siguiente. Una consulta que se aborta antes de su turno sale de la fila sin
// gastarlo. El campo y la carga van antes que el adelanto de la revisión.
const MS_ENTRE_CONSULTAS_OSM = 1200;

/** "alta": el campo y la carga de la guía; "baja": el adelanto mientras se revisan las líneas. */
type PrioridadOsm = "alta" | "baja";

type Espera = { prioridad: PrioridadOsm; dar: () => void };
const enEspera: Espera[] = [];
let abierta = false;
let inicioUltima = 0;
let reloj: ReturnType<typeof setTimeout> | null = null;

/** Da el turno a la siguiente, la primera de prioridad alta si hay, cuando se puede. */
function despachar(): void {
  if (abierta || reloj || enEspera.length === 0) return;
  const falta = MS_ENTRE_CONSULTAS_OSM - (Date.now() - inicioUltima);
  if (falta > 0) {
    reloj = setTimeout(() => {
      reloj = null;
      despachar();
    }, falta);
    return;
  }
  const alta = enEspera.findIndex((e) => e.prioridad === "alta");
  const [siguiente] = enEspera.splice(alta >= 0 ? alta : 0, 1);
  abierta = true;
  inicioUltima = Date.now();
  siguiente.dar();
}

/** true con el turno (hay que soltarlo con soltarTurno); false si se abortó antes. */
function turnoOsm(espera: Espera, senal: AbortSignal): Promise<boolean> {
  if (senal.aborted) return Promise.resolve(false);
  return new Promise((listo) => {
    const alAbortar = () => {
      const i = enEspera.indexOf(espera);
      if (i >= 0) enEspera.splice(i, 1);
      listo(false);
    };
    espera.dar = () => {
      senal.removeEventListener("abort", alAbortar);
      listo(true);
    };
    senal.addEventListener("abort", alAbortar, { once: true });
    enEspera.push(espera);
    despachar();
  });
}

function soltarTurno(): void {
  abierta = false;
  despachar();
}

// Lo ya preguntado, durante el día (spec 038, como Google): «Optimizar ruta» volvía a pagar la
// fila por cada pedido sin ubicar, y el adelanto deja aquí lo que preguntará la carga. La clave
// es la consulta ENTERA (el recuadro, «bounded» y el límite cambian la respuesta). Solo se guarda
// lo que OSM contestó: un corte de señal o un error nunca. Son direcciones de destinatarios: se
// olvidan con el día (olvidarMemoriasDelDia).
const MAX_RECORDADAS = 1000;
const recordadas = new Map<string, unknown[]>();
/** La misma consulta pedida dos veces a la vez sale una sola vez a la red. */
type EnVuelo = { promesa: Promise<unknown[] | null>; interesados: number; control: AbortController; espera: Espera };
const enVuelo = new Map<string, EnVuelo>();
/** Sube al olvidar: una consulta que estaba en vuelo ya no se guarda. */
let generacion = 0;

/** Borra lo recordado: son direcciones de destinatarios y las pruebas contestan distinto a la
 *  misma consulta. */
export function olvidarConsultasNominatim(): void {
  recordadas.clear();
  enVuelo.clear();
  generacion++;
}

function abrir(clave: string, params: URLSearchParams, prioridad: PrioridadOsm): EnVuelo {
  const control = new AbortController();
  const vuelo: EnVuelo = { promesa: Promise.resolve(null), interesados: 0, control, espera: { prioridad, dar: () => {} } };
  const deEstaGeneracion = generacion;
  vuelo.promesa = (async () => {
    // Nadie la espera ya (el conductor siguió escribiendo, la carga se cortó): sin turno.
    const finTurno = desde("osm.turno");
    if (!(await turnoOsm(vuelo.espera, control.signal))) return null;
    finTurno();
    try {
      // Sin la señal de ningún llamador: se corta solo si TODOS la dejan (ver pedirNominatim).
      const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: tope(10_000, control.signal),
      });
      if (!res.ok) return null;
      const datos = await res.json();
      if (!Array.isArray(datos)) return null;
      if (deEstaGeneracion === generacion) {
        if (recordadas.size >= MAX_RECORDADAS) recordadas.delete(recordadas.keys().next().value!);
        recordadas.set(clave, datos);
      }
      return datos;
    } catch {
      return null;
    } finally {
      soltarTurno();
    }
  })();
  void vuelo.promesa.finally(() => {
    if (enVuelo.get(clave) === vuelo) enVuelo.delete(clave);
  });
  enVuelo.set(clave, vuelo);
  return vuelo;
}

// Nunca lanza: sin OSM se sigue con lo que haya dado Google. null = no contestó.
async function pedirNominatim(
  params: URLSearchParams,
  senal?: AbortSignal,
  prioridad: PrioridadOsm = "alta",
): Promise<unknown[] | null> {
  const clave = params.toString();
  // Antes de la fila: lo ya contestado no gasta turno.
  const recordada = recordadas.get(clave);
  if (recordada) return recordada;
  if (senal?.aborted) return null;

  const vuelo = enVuelo.get(clave) ?? abrir(clave, params, prioridad);
  // La carga espera lo que el adelanto dejó en la fila: pasa adelante.
  if (prioridad === "alta") vuelo.espera.prioridad = "alta";
  vuelo.interesados++;
  const filas = await hastaAbortar(vuelo.promesa, senal);
  if (senal?.aborted) {
    // El último que la deja la corta: si todavía no tenía turno, no lo gasta.
    if (--vuelo.interesados === 0) {
      if (enVuelo.get(clave) === vuelo) enVuelo.delete(clave);
      vuelo.control.abort();
    }
    return null;
  }
  vuelo.interesados--;
  return filas;
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
// sugerirDirecciones y no dentro: Nominatim puede tardar el triple que Google,
// así que esperarlos juntos haría que la lista entera aparezca tarde. La pantalla pide este después, con más pausa, y agrega lo que traiga.
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
    // El recuadro de Arica, y "bounded" lo hace filtro duro: sin esto,
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
export async function conNominatim(direccion: string, senal?: AbortSignal): Promise<SugerenciaDireccion[]> {
  return (await preguntarANominatim(direccion, senal)) ?? [];
}

/** Lo mismo, pero null si no se pudo preguntar (sin señal, OSM caído): ubicar una
 *  guía sin señal se corta en vez de esperar dirección por dirección (spec 033).
 *  `prioridad` "baja" es el adelanto de la revisión de la guía (spec 038). */
export async function preguntarANominatim(
  direccion: string,
  senal?: AbortSignal,
  prioridad: PrioridadOsm = "alta",
): Promise<SugerenciaDireccion[] | null> {
  const params = new URLSearchParams({
    q: `${direccion}, Arica, Chile`,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(CANDIDATOS_POR_PROVEEDOR),
    "accept-language": "es",
  });

  const filas = await pedirNominatim(params, senal, prioridad);
  if (!filas) return null;
  return (filas as FilaOsm[]).flatMap(aSugerenciaOsm);
}
