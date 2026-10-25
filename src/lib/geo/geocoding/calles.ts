// El catálogo de calles de Arica (calles-arica.ts, sacado de OpenStreetMap): lo
// que permite corregir el nombre ANTES de preguntarle a Mapbox, sin red.
//
//   "Braulio Muniz"   → "Braulio Muñoz"                       (una letra)
//   "Santiago Arata"  → "Santiago Arata Gandolfo"             (falta un apellido)
//   "Humberto Arellano" → "Avenida Diputado Humberto Arellano Figueroa"
//
// Mapbox no corrige esto solo: con el nombre mal escrito contesta otra calle o
// nada, y con el nombre oficial encuentra la puerta. El catálogo se carga
// recién la primera vez que hace falta (son ~30 KB que la pantalla no necesita
// para arrancar).
import { coincidenciaCalle, compararCoincidencias, normalizar, type Coincidencia } from "./consulta";

type Calle = { nombre: string; largo: number; nombres: string[] };

let catalogo: Promise<Calle[]> | null = null;

function cargar(): Promise<Calle[]> {
  catalogo ??= import("./calles-arica").then(({ CALLES_ARICA }) =>
    CALLES_ARICA.split("\n")
      .filter(Boolean)
      .map((fila) => {
        const [nombre, largo, otros] = fila.split("|");
        return { nombre, largo: Number(largo), nombres: [nombre, ...(otros ? otros.split(";") : [])] };
      }),
  );
  return catalogo;
}

export type CalleParecida = Coincidencia & { nombre: string; largo: number };

/** Las calles del catálogo que pueden ser la escrita, la más parecida primero.
 *
 *  Solo el MEJOR grupo: si alguna calle calza sin corregir letras, las que
 *  necesitan corrección no se ofrecen. "Maipu" no puede traer "Maipo" si
 *  "Maipú" existe. */
export async function callesParecidas(escrito: string, maximo = 3): Promise<CalleParecida[]> {
  const parecidas: CalleParecida[] = [];
  for (const calle of await cargar()) {
    const mejor = calle.nombres
      .map((n) => coincidenciaCalle(escrito, n))
      .filter((c): c is Coincidencia => c !== null)
      .sort(compararCoincidencias)[0];
    if (mejor) parecidas.push({ ...mejor, nombre: calle.nombre, largo: calle.largo });
  }
  if (parecidas.length === 0) return [];
  const minimas = Math.min(...parecidas.map((p) => p.ediciones));
  return parecidas
    .filter((p) => p.ediciones === minimas)
    .sort((a, b) => compararCoincidencias(a, b) || a.nombre.length - b.nombre.length)
    .slice(0, maximo);
}

/** Cuánto mide la calle con ese nombre (todos sus tramos), o null si no está en
 *  el catálogo. */
export async function largoDeCalle(nombre: string): Promise<number | null> {
  const buscado = normalizar(nombre);
  const calle = (await cargar()).find((c) => c.nombres.some((n) => normalizar(n) === buscado));
  return calle ? calle.largo : null;
}
