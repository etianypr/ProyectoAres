// Los lugares de una calle cuyo nombre está repetido en Arica (spec 035): «Pasaje 1» es una
// fila del catálogo que cubre 8 km; acá es cada pasaje por separado, con su punto, puntos de
// muestra (para saber su población) y las calles que lo cruzan. Sale de lugares-calles.ts,
// generado desde OpenStreetMap por scripts/generar-calles.mjs. Sin red.
import type { Coordenada } from "@/lib/geo/coordenada";
import { coincidenciaCalle, palabrasDe } from "./consulta";

export type LugarDeCalle = Coordenada & { nombre: string; muestras: Coordenada[]; cruces: string[] };

let catalogo: Promise<LugarDeCalle[]> | null = null;

const aPunto = (t: string): Coordenada => {
  const [lat, lng] = t.split(",").map(Number);
  return { lat, lng };
};

function cargar(): Promise<LugarDeCalle[]> {
  catalogo ??= import("./lugares-calles")
    .then(({ LUGARES_CALLES }) =>
      LUGARES_CALLES.split("\n")
        .filter(Boolean)
        .map((fila) => {
          const [nombre, punto, muestras, cruces] = fila.split("|");
          return {
            nombre,
            ...aPunto(punto),
            muestras: muestras ? muestras.split(";").map(aPunto) : [],
            cruces: cruces ? cruces.split(";") : [],
          };
        }),
    )
    .catch(() => {
      catalogo = null;
      return [];
    });
  return catalogo;
}

const NUMEROS: Record<string, string> = {
  uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
};
/** «Pasaje Uno» y «Pasaje 1» son el mismo nombre. */
const conDigitos = (t: string) => palabrasDe(t).map((p) => NUMEROS[p] ?? p).join(" ");

const TIPOS: Record<string, string> = {
  pasaje: "pasaje", pje: "pasaje", psje: "pasaje", pj: "pasaje", calle: "calle",
  avenida: "avenida", av: "avenida", avda: "avenida",
};
/** El tipo de vía con que empieza el nombre, o null. */
const tipoDe = (t: string): string | null => TIPOS[palabrasDe(t)[0] ?? ""] ?? null;

/** Los lugares de la calle escrita, si su nombre está repetido en Arica; [] si es una sola.
 *  Calza el nombre entero, sin palabras de más ni de menos: «Pasaje 1» no trae «Pasaje 1 Norte». */
export async function lugaresDeCalle(escrita: string): Promise<LugarDeCalle[]> {
  const buscada = conDigitos(escrita);
  if (!buscada) return [];
  const todos = await cargar();
  const tipoBuscado = tipoDe(buscada);
  const calzan = todos.filter((l) => {
    // «Pasaje 1» y «Calle 1» son calles distintas, aunque el tipo no distinga en el catálogo.
    const tipo = tipoDe(l.nombre);
    if (tipoBuscado && tipo && tipo !== tipoBuscado) return false;
    const c = coincidenciaCalle(buscada, conDigitos(l.nombre));
    return c !== null && c.ediciones === 0 && c.sobrantes === 0;
  });
  // «Pasaje 1» y «Pasaje Uno» son lugares del mismo nombre: van juntos.
  return calzan.length >= 2 ? calzan : [];
}

const GENERICAS = new Set(["pasaje", "pje", "psje", "calle", "avenida", "av", "avda", "de", "del", "la", "las", "los", "el"]);

/** ¿La referencia de la guía nombra una calle que cruza el lugar, aunque no diga «con»?
 *  «LINDEROS PROVIDENCI CALLE 2 …»: Providencia cruza a uno solo de los Calle 2. Cada palabra
 *  del cruce tiene que estar (entera o cortada al final, desde 5 letras) y una, al menos, ser
 *  un nombre de verdad (4 letras o más): «Pasaje 2» no se nombra con un «2» suelto. */
export function cruceNombrado(lugar: LugarDeCalle, referencia: string): boolean {
  const escritas = palabrasDe(referencia);
  if (escritas.length === 0) return false;
  return lugar.cruces.some((c) => {
    const palabras = palabrasDe(c).filter((p) => !GENERICAS.has(p));
    if (!palabras.some((p) => p.length >= 4 && !/\d/.test(p))) return false;
    return palabras.every((p) => escritas.some((e) => e === p || (e.length >= 5 && p.startsWith(e))));
  });
}

/** ¿Alguna de las calles que cruzan el lugar es la escrita? («con calle 5», «esq. Tucapel»). */
export function cruzaCon(lugar: LugarDeCalle, escrita: string): boolean {
  const buscada = conDigitos(escrita);
  return lugar.cruces.some((c) => {
    const m = coincidenciaCalle(buscada, conDigitos(c));
    return m !== null && m.sobrantes <= 1;
  });
}
