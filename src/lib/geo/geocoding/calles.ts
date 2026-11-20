// El catálogo de calles de Arica (calles-arica.ts, sacado de OpenStreetMap): lo
// que permite corregir el nombre ANTES de preguntarle a un buscador, sin red.
//
//   "Braulio Muniz"   → "Braulio Muñoz"                       (una letra)
//   "Santiago Arata"  → "Santiago Arata Gandolfo"             (falta un apellido)
//   "Humberto Arellano" → "Avenida Diputado Humberto Arellano Figueroa"
//
// Los buscadores no corrigen esto solos: con el nombre mal escrito contestan otra calle o
// nada, y con el nombre oficial encuentran la puerta. El catálogo se carga
// recién la primera vez que hace falta (son ~30 KB que la pantalla no necesita
// para arrancar).
import {
  coincidenciaPartida,
  compararCoincidencias,
  normalizar,
  palabrasDe,
  partirEscrito,
  type Coincidencia,
} from "./consulta";

/** `palabras`: cada nombre ya partido (palabrasDe), una sola vez al cargar y no en cada
 *  consulta (spec 038). */
type Calle = { nombre: string; largo: number; nombres: string[]; palabras: string[][] };

let catalogo: Promise<Calle[]> | null = null;

function cargar(): Promise<Calle[]> {
  catalogo ??= import("./calles-arica")
    .then(({ CALLES_ARICA }) =>
      CALLES_ARICA.split("\n")
        .filter(Boolean)
        .map((fila) => {
          const [nombre, largo, otros] = fila.split("|");
          const nombres = [nombre, ...(otros ? otros.split(";") : [])];
          return { nombre, largo: Number(largo), nombres, palabras: nombres.map(palabrasDe) };
        }),
    )
    // Sin señal la primera vez, el archivo no baja: se busca sin catálogo y se
    // vuelve a intentar la próxima. Guardar el error rompía ubicar (y «Armar la
    // ruta») hasta reiniciar la app (auditoría del día real, 2026-11-10).
    .catch(() => {
      catalogo = null;
      return [];
    });
  return catalogo;
}

type CalleParecida = Coincidencia & { nombre: string; largo: number };

/** Las calles del catálogo que pueden ser la escrita, la más parecida primero.
 *
 *  Solo el MEJOR grupo: si alguna calle calza sin corregir letras, las que
 *  necesitan corrección no se ofrecen. "Maipu" no puede traer "Maipo" si
 *  "Maipú" existe. */
export async function callesParecidas(escrito: string, maximo = 3): Promise<CalleParecida[]> {
  const parecidas: CalleParecida[] = [];
  // Lo escrito se parte una vez para todo el catálogo (spec 038).
  const partido = partirEscrito(escrito);
  for (const calle of await cargar()) {
    // La mejor de sus nombres; ante un empate, la primera (lo que daba el sort estable de antes).
    let mejor: Coincidencia | null = null;
    for (const palabras of calle.palabras) {
      const c = coincidenciaPartida(partido, palabras);
      if (c && (!mejor || compararCoincidencias(c, mejor) < 0)) mejor = c;
    }
    if (mejor) parecidas.push({ ...mejor, nombre: calle.nombre, largo: calle.largo });
  }
  if (parecidas.length === 0) return [];
  const minimas = Math.min(...parecidas.map((p) => p.ediciones));
  return parecidas
    .filter((p) => p.ediciones === minimas)
    .sort((a, b) => compararCoincidencias(a, b) || a.nombre.length - b.nombre.length)
    .slice(0, maximo);
}

/** Las palabras de todos los nombres del catálogo, sin tildes. */
let vocabulario: Promise<Set<string>> | null = null;

function palabrasDelCatalogo(): Promise<Set<string>> {
  vocabulario ??= cargar().then((calles) => {
    const palabras = new Set(calles.flatMap((c) => c.palabras.flat()));
    // Sin señal el catálogo no bajó: se vuelve a intentar la próxima vez (como cargar).
    if (palabras.size === 0) vocabulario = null;
    return palabras;
  });
  return vocabulario;
}

const soloLetras = (p: string) => /^\p{L}+$/u.test(p);

/** Lo que la cámara rompió y solo el catálogo sabe arreglar (spec 044), sobre la consulta ya
 *  limpia (normalizarConsulta):
 *   · la palabra partida por el salto de renglón de la nómina: «SIMON MOL INARES» → «SIMON
 *     MOLINARES», «Nac imiento» → «Nacimiento». Se unen dos pedazos cuando juntos son una
 *     palabra del catálogo y alguno de los dos no lo es (dos palabras de verdad no se tocan);
 *   · un código corto que no es palabra de ninguna calle, antes del número del final: el depto
 *     mal leído («PORTAL EL ALWA ODK 97» → «PORTAL EL ALWA»). Solo si queda una palabra que
 *     distingue la calle: «CALLE ARO 12» se queda.
 *  Sin catálogo (sin señal la primera vez), la consulta va tal cual. */
export async function corregirConCatalogo(consulta: string): Promise<string> {
  const vocab = await palabrasDelCatalogo();
  if (vocab.size === 0 || !consulta) return consulta;
  const palabras = consulta.split(" ");
  for (let i = 0; i + 1 < palabras.length; i++) {
    const a = normalizar(palabras[i]);
    const b = normalizar(palabras[i + 1]);
    if (!soloLetras(a) || !soloLetras(b) || !vocab.has(a + b) || (vocab.has(a) && vocab.has(b))) continue;
    palabras.splice(i, 2, palabras[i] + palabras[i + 1]);
    i--;
  }
  const n = palabras.length;
  if (n >= 3 && /^\d{1,6}$/.test(palabras[n - 1])) {
    const codigo = normalizar(palabras[n - 2]);
    const resto = palabras.slice(0, n - 2);
    const esCodigo = /^[\p{L}\d]{2,3}$/u.test(codigo) && /\p{L}/u.test(codigo) && !vocab.has(codigo);
    if (esCodigo && partirEscrito(resto.join(" ")).buscadas.length > 0) return resto.join(" ");
  }
  return palabras.join(" ");
}

/** Cuánto mide la calle con ese nombre (todos sus tramos), o null si no está en
 *  el catálogo. */
export async function largoDeCalle(nombre: string): Promise<number | null> {
  const buscado = normalizar(nombre);
  const calle = (await cargar()).find((c) => c.nombres.some((n) => normalizar(n) === buscado));
  return calle ? calle.largo : null;
}
