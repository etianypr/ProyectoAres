// Las poblaciones de Arica (spec 035), del Plano de Poblaciones municipal (poblaciones-arica.ts):
// en qué población cae un punto y qué población nombra el texto de una guía. Sin red: el
// archivo viaja en el código y se carga recién la primera vez que hace falta (~70 KB).
//
// Para qué: «Pasaje 1» está en muchos lugares de Arica. La guía suele traer la población
// («LINDEROS … PASAJE 1 …»), y con ella se sabe cuál es. Sin ella, la opción se muestra con su
// población, que el conductor reconoce.
import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { distanciaEdicion, palabrasDe } from "./consulta";

type Poblacion = { nombre: string; punto: Coordenada; poligono: Coordenada[] | null };

/** Sin polígono que contenga el punto, la etiqueta más cercana vale hasta esto: menos que
 *  una población chica de Arica. */
const METROS_ETIQUETA = 250;

let catalogo: Promise<Poblacion[]> | null = null;

const aPunto = (t: string): Coordenada => {
  const [lat, lng] = t.split(",").map(Number);
  return { lat, lng };
};

function cargar(): Promise<Poblacion[]> {
  catalogo ??= import("./poblaciones-arica")
    .then(({ POBLACIONES_ARICA }) =>
      POBLACIONES_ARICA.split("\n")
        .filter(Boolean)
        .map((fila) => {
          const [nombre, punto, poligono] = fila.split("|");
          return { nombre, punto: aPunto(punto), poligono: poligono ? poligono.split(";").map(aPunto) : null };
        }),
    )
    // Sin señal la primera vez el archivo no baja: se sigue sin poblaciones (como calles.ts).
    .catch(() => {
      catalogo = null;
      return [];
    });
  return catalogo;
}

function dentro(p: Coordenada, poligono: Coordenada[]): boolean {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      adentro = !adentro;
    }
  }
  return adentro;
}

/** La población de un punto: la del polígono que lo contiene o, si no cae en ninguno, la
 *  etiqueta más cercana (≤ 250 m). null si no hay ninguna cerca. */
function poblacionEn(p: Coordenada, todas: Poblacion[]): string | null {
  const contiene = todas.find((x) => x.poligono && dentro(p, x.poligono));
  if (contiene) return contiene.nombre;
  let mejor: Poblacion | null = null;
  let metros = METROS_ETIQUETA;
  for (const x of todas) {
    const d = distanciaMetros(p, x.punto);
    if (d <= metros) [mejor, metros] = [x, d];
  }
  return mejor?.nombre ?? null;
}

/** Las poblaciones por donde pasa un lugar (sus puntos de muestra), sin repetir: la más
 *  frecuente primero. */
export async function poblacionesDe(puntos: Coordenada[]): Promise<string[]> {
  const todas = await cargar();
  const cuenta = new Map<string, number>();
  for (const p of puntos) {
    const n = poblacionEn(p, todas);
    if (n) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/** Lo que no distingue una población de otra: «CONJ HAB», «C H», «COND»… */
const PREFIJOS = new Set(["conj", "hab", "c", "h", "ch", "cond", "condominio", "condominios", "coop", "villa", "poblacion", "pob", "loteo", "agrupacion"]);
const ROMANO = /^(i{1,3}|iv|v|vi{1,3}|ix|x|xi{1,3})$/;
/** Palabras que aparecen en cualquier dirección: solas no nombran una población. */
const DEMASIADO_COMUNES = new Set(["arica", "chile", "centro", "norte", "sur", "oriente", "poniente", "pacifico", "puerto", "universidad", "municipalidad", "mall"]);

/** Las palabras que nombran a la población, sin prefijos. */
function nucleo(nombre: string): string[] {
  return palabrasDe(nombre).filter((p) => !PREFIJOS.has(p));
}

/** Las poblaciones que nombra un texto (la referencia de la guía, sin la calle ni el número).
 *  Calzan cuando cada palabra de su nombre está en el texto, con el tipeo acotado de las calles
 *  («PROVIDENCI» es «Providencia»). Si la guía no trae el número romano («TUCAPEL» para
 *  «Tucapel IV»), calzan todas las de ese nombre. */
export async function poblacionesEscritas(texto: string): Promise<string[]> {
  if (!texto.trim()) return [];
  const todas = await cargar();
  const escritas = palabrasDe(texto);
  const calzan = new Set<string>();
  const sinRomano = new Set<string>();
  for (const x of todas) {
    const palabras = nucleo(x.nombre);
    // «Conj. Hab. Arica» o «Centro» calzarían con cualquier dirección que diga «ARICA».
    if (palabras.every((p) => DEMASIADO_COMUNES.has(p) || ROMANO.test(p))) continue;
    if (todasEstan(palabras, escritas)) calzan.add(x.nombre);
    const base = palabras.filter((p) => !ROMANO.test(p) && !/^\d+$/.test(p));
    if (base.length > 0 && base.length < palabras.length && todasEstan(base, escritas)) sinRomano.add(x.nombre);
  }
  return calzan.size > 0 ? [...calzan] : [...sinRomano];
}

/** Cada palabra del nombre está en el texto: igual, cortada al final («PROVIDENCI») o, si es
 *  larga, con una letra cambiada. Más estricto que las calles: «Aroca» no es «Arica». */
function todasEstan(nombre: string[], escritas: string[]): boolean {
  return nombre.every((p) =>
    escritas.some(
      (e) =>
        e === p ||
        (e.length >= 5 && p.startsWith(e)) ||
        (p.length >= 7 && Math.abs(p.length - e.length) <= 1 && distanciaEdicion(p, e) <= 1),
    ),
  );
}

const MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "a", "al"]);

/** Cómo se muestra: «Pob. Linderos», «Conj. Hab. Santa Clara II», «Villa España». */
export function nombrePoblacion(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/);
  const titulo = (p: string, i: number) =>
    ROMANO.test(p.toLowerCase()) || /\d/.test(p)
      ? p.toUpperCase()
      : i > 0 && MENORES.has(p.toLowerCase())
        ? p.toLowerCase()
        : p.charAt(0) + p.slice(1).toLowerCase();
  let prefijo = "Pob. ";
  let resto = palabras;
  if (/^(CONJ|C)$/.test(palabras[0]) && /^(HAB|H)$/.test(palabras[1] ?? "")) [prefijo, resto] = ["Conj. Hab. ", palabras.slice(2)];
  else if (palabras[0] === "CH") [prefijo, resto] = ["Conj. Hab. ", palabras.slice(1)];
  else if (palabras[0] === "COND") [prefijo, resto] = ["Cond. ", palabras.slice(1)];
  else if (/^(VILLA|CONDOMINIO|CONDOMINIOS|COOP|LOTEO|ZONA|AGRUPACION|AMPLIACION|CERRO)$/.test(palabras[0])) prefijo = "";
  return prefijo + resto.map(titulo).join(" ");
}
