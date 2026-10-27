// Unir las listas de los proveedores y buscar el número escrito en la calle
// que se quiso decir ("Linderos 3536"; spec 016 con el catálogo de calles).

import { tope } from "@/lib/comun/tope";
import { callesParecidas } from "./calles";
import {
  coincidenciaCalle,
  compararCoincidencias,
  esLaCalleEscrita,
  normalizar,
  normalizarConsulta,
  partirCalleYNumero,
  type Coincidencia,
} from "./consulta";
import { aSugerencia, urlMapbox, type FeatureV6 } from "./mapbox";
import type { SugerenciaDireccion } from "./tipos";

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
// puerta aparece recién si el conductor escribe el nombre largo entero. Treinta
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
//   · no elige. Si el 3536 existe en las dos, salen las dos y elige el conductor.
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
 *  que el conductor tenía en la cabeza" y son consultas que se pagan. */
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
 *  Devuelve null cuando no se pudo preguntar (sin señal, sin token, o el conductor
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
    const res = await fetch(url, { signal: tope(8_000, senal) });
    if (!res.ok) return null;
    const datos = (await res.json()) as { features?: FeatureV6[] };
    const puertas = (datos.features ?? [])
      .flatMap((f) => aSugerencia(f, calle))
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

/** Las calles donde buscar el número: las que trajeron los proveedores y las
 *  del catálogo, que corrige el tipeo ("Braulio Muniz" → "Braulio Muñoz") y
 *  completa el nombre ("Santiago Arata" → "Santiago Arata Gandolfo"). Solo el
 *  grupo que menos letras hubo que corregir: si una calle calza tal cual, no se
 *  pregunta por las parecidas. La misma calle traída por dos lados va una vez. */
async function callesAProbar(calle: string, candidatos: SugerenciaDireccion[]): Promise<string[]> {
  const deProveedores = candidatos.map(nombreDeCalleDe).filter((n): n is string => !!n);
  const delCatalogo = (await callesParecidas(calle)).map((c) => c.nombre);
  const posibles: { nombre: string; c: Coincidencia; orden: number }[] = [];
  [...deProveedores, ...delCatalogo].forEach((nombre, orden) => {
    const c = coincidenciaCalle(calle, nombre);
    if (!c || posibles.some((p) => normalizar(p.nombre) === normalizar(nombre))) return;
    posibles.push({ nombre, c, orden });
  });
  if (posibles.length === 0) return [];
  const minimas = Math.min(...posibles.map((p) => p.c.ediciones));
  return posibles
    .filter((p) => p.c.ediciones === minimas)
    .sort((a, b) => compararCoincidencias(a.c, b.c) || a.orden - b.orden)
    .slice(0, MAX_CALLES_A_PROBAR)
    .map((p) => p.nombre);
}

export type PuertasEnCalles = {
  /** Las puertas que existen con ese número. Vacío si ninguna. */
  puertas: SugerenciaDireccion[];
  /** Las calles que se probaron y NO tienen ese número: las que el conductor
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

  const calles = await callesAProbar(partido.calle, candidatos);
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
