// Bajar el mapa de Arica para tenerlo sin conexión (spec 047): una vez al día, con
// conexión y con la ruta armada, y desde Diagnóstico a mano.
//
// Lo que se baja es una CAJA FIJA de la ciudad, no la zona de las paradas: así a
// OpenFreeMap no le llega nada nuevo (ni la ruta ni los puntos de nadie). Las
// teselas de OpenFreeMap llegan hasta el zoom 14 y de ahí el mapa las agranda, así
// que con el 14 de la ciudad se ven las calles a cualquier zoom de la navegación.
// Más las letras de los nombres y los íconos del estilo. Lo ya guardado no se
// vuelve a bajar (protocolo.ts: con la misma URL es lo mismo).
import { RECUADRO_ARICA, type Recuadro } from "@/lib/geo/coordenada";
import { ESTILO } from "@/lib/geo/estilo-mapa";
import { archivosGuardados, limpiarMapa, traer } from "./protocolo";

/** La ciudad, con el valle de Azapa bajo y la costa: donde se reparte. */
export const CAJA_CIUDAD: Recuadro = { sur: -18.56, oeste: -70.34, norte: -18.41, este: -70.24 };
const ZOOM_CIUDAD = [13, 14];
const ZOOM_ALREDEDORES = [10, 11, 12];
/** Los rangos de letras: el latino (con ñ y tildes) y la puntuación (’ «–»). */
const RANGOS_LETRAS = ["0-255", "8192-8447"];
const A_LA_VEZ = 4;
const CLAVE_DESCARGADO = "ares.mapa-descargado";

type Tesela = { z: number; x: number; y: number };

const columna = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const fila = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Las teselas que tocan la caja a ese zoom. Pura. */
export function teselasDeCaja(caja: Recuadro, z: number): Tesela[] {
  const teselas: Tesela[] = [];
  for (let x = columna(caja.oeste, z); x <= columna(caja.este, z); x++) {
    for (let y = fila(caja.norte, z); y <= fila(caja.sur, z); y++) teselas.push({ z, x, y });
  }
  return teselas;
}

/** Todas las que se bajan: la ciudad de cerca y los alrededores de lejos. Pura. */
export function teselasDeArica(): Tesela[] {
  return [
    ...ZOOM_ALREDEDORES.flatMap((z) => teselasDeCaja(RECUADRO_ARICA, z)),
    ...ZOOM_CIUDAD.flatMap((z) => teselasDeCaja(CAJA_CIUDAD, z)),
  ];
}

type EstiloMapa = {
  glyphs?: string;
  sprite?: string;
  sources?: Record<string, { type?: string; url?: string }>;
  layers?: { layout?: Record<string, unknown> }[];
};

/** Las letras de cada fuente que usa el estilo y sus íconos (normales y @2x). Pura. */
export function letrasYIconos(estilo: EstiloMapa): string[] {
  const fuentes = new Set<string>();
  for (const capa of estilo.layers ?? []) {
    const f = capa.layout?.["text-font"];
    if (Array.isArray(f)) for (const nombre of f) if (typeof nombre === "string") fuentes.add(nombre);
  }
  const letras = estilo.glyphs
    ? [...fuentes].flatMap((f) => RANGOS_LETRAS.map((r) => estilo.glyphs!.replace("{fontstack}", f).replace("{range}", r)))
    : [];
  const iconos = estilo.sprite ? ["", "@2x"].flatMap((d) => [`${estilo.sprite}${d}.json`, `${estilo.sprite}${d}.png`]) : [];
  return [...letras, ...iconos];
}

export type Descarga = { archivos: number; fallidas: number };

/** Baja (o confirma guardado) todo el mapa de Arica. `avance`: cuántos van de cuántos. */
export async function descargarMapa(avance?: (hechos: number, total: number) => void): Promise<Descarga> {
  const estilo = (await (await traer(ESTILO)).json()) as EstiloMapa;
  const vectorial = Object.values(estilo.sources ?? {}).find((s) => s.type === "vector" && s.url);
  const indice = vectorial?.url ? ((await (await traer(vectorial.url)).json()) as { tiles?: string[] }) : null;
  const plantilla = indice?.tiles?.[0];
  const urls = [
    ...(plantilla ? teselasDeArica().map((t) => plantilla.replace("{z}", `${t.z}`).replace("{x}", `${t.x}`).replace("{y}", `${t.y}`)) : []),
    ...letrasYIconos(estilo),
  ];
  let hechos = 0;
  let fallidas = plantilla ? 0 : 1;
  const cola = [...urls];
  const trabajar = async () => {
    for (let url = cola.shift(); url; url = cola.shift()) {
      try {
        const r = await traer(url);
        // Se lee para que quede entera en la copia antes de seguir.
        await r.arrayBuffer();
      } catch {
        fallidas++;
      }
      avance?.(++hechos, urls.length);
    }
  };
  await Promise.all(Array.from({ length: A_LA_VEZ }, trabajar));
  await limpiarMapa().catch(() => 0);
  if (fallidas === 0) marcarDescargado();
  return { archivos: urls.length, fallidas };
}

const hoy = () => new Date().toISOString().slice(0, 10);

function marcarDescargado(): void {
  try {
    localStorage.setItem(CLAVE_DESCARGADO, hoy());
  } catch {
    // Sin almacenamiento se vuelve a revisar mañana igual: lo guardado no se baja dos veces.
  }
}

/** El día de la última descarga completa (Diagnóstico). */
export function mapaDescargadoEl(): string | null {
  try {
    return localStorage.getItem(CLAVE_DESCARGADO);
  } catch {
    return null;
  }
}

let enCurso: Promise<Descarga> | null = null;

/** Una vez al día y con conexión: la pantalla del día la llama con la ruta armada.
 *  También si la copia desapareció (el sistema la borra si falta espacio): no basta
 *  con la fecha. */
export async function descargarSiHaceFalta(): Promise<Descarga | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  if (mapaDescargadoEl() === hoy() && (await archivosGuardados()) >= teselasDeArica().length) return null;
  enCurso ??= descargarMapa().finally(() => {
    enCurso = null;
  });
  return enCurso;
}
