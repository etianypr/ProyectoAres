// Las lecturas de un barrido de la nómina → los encargos (bloques) y la OF de cada uno,
// dígito por dígito (spec 029; piezas, ruido y malas lecturas, 034). Puro. Aparte de
// barrido-nomina.ts, que lo usa, para no pasar de 400 líneas (A7).

import { elegirTexto, distancia, parecidos } from "./etiqueta/votos";
import type { LineaNomina } from "./barrido-nomina";

/** Cuántas veces tiene que salir igual cada dígito de la OF. */
export const VOTOS_PARA_FIRME = 3;
/** Hasta cuántos dígitos mal (o perdidos) se juntan con la lectura buena. */
export const DIGITOS_DE_ERROR = 2;
/** Cuántos cuadros antes o después de leer bien un encargo puede salir una mala lectura
 *  suya: ~2 s, lo que ese encargo sigue a la vista. */
const CUADROS_CERCA = 20;
/** Cuánto puede diferir la dirección de una mala lectura de la del encargo firme (40 % de
 *  las letras): más que eso es la dirección de otro encargo. */
const DIRECCION_MOVIDA = 0.4;

export type Lectura = {
  of: string;
  votos: number;
  /** Por posición, en cuántas de sus lecturas votó ese dígito. */
  digitos: number[];
  cuadros: Set<number>;
  orden: number;
  destinos: Record<string, number>;
  abiertos: Record<string, number>;
  destino: string | null;
};

export type Bloque = { semilla: Lectura; cuadros: Set<number>; lecturas: Lectura[] };
export type Decidido = LineaNomina & { orden: number; corregidas: number };

/** ¿Esta lectura es del bloque que empezó `semilla`? */
function delMismoBloque(semilla: Lectura, cuadros: Set<number>, lectura: Lectura): boolean {
  if (Math.abs(semilla.of.length - lectura.of.length) > DIGITOS_DE_ERROR) return false;
  if (distancia(semilla.of, lectura.of) > DIGITOS_DE_ERROR) return false;
  // Salieron en un mismo cuadro: son dos bloques de la hoja.
  for (const c of lectura.cuadros) if (cuadros.has(c)) return false;
  return !semilla.destino || !lectura.destino || parecidos(semilla.destino, lectura.destino);
}

/** Las lecturas juntadas por encargo. `ambiguas`: OF sueltas que calzaban con dos encargos
 *  y no votaron. `ruido`: números sin ninguna dirección vistos muy pocas veces. */
export function armarBloques(lecturas: Lectura[]): { bloques: Bloque[]; ambiguas: number; ruido: number } {
  // De la más leída a la menos: la lectura buena suele empezar el bloque y las
  // erradas se le suman.
  const bloques: Bloque[] = [];
  const sumarA = (bloque: Bloque, lectura: Lectura) => {
    bloque.lecturas.push(lectura);
    for (const c of lectura.cuadros) bloque.cuadros.add(c);
  };
  const ordenadas = [...lecturas].sort((a, b) => b.votos - a.votos || a.orden - b.orden);
  for (const lectura of ordenadas.filter((l) => l.destino)) {
    const bloque = bloques.find((b) => delMismoBloque(b.semilla, b.cuadros, lectura));
    if (bloque) sumarA(bloque, lectura);
    else bloques.push({ semilla: lectura, cuadros: new Set(lectura.cuadros), lecturas: [lectura] });
  }
  // Las que se leyeron sin dirección (la OF suelta de un cuadro movido) no tienen con
  // qué distinguirse de un encargo parecido: se suman solo si calzan con uno solo. Con
  // dos candidatos no votan, salvo que hayan salido tantas veces que son otra OF.
  let ambiguas = 0;
  for (const lectura of ordenadas.filter((l) => !l.destino)) {
    const candidatos = bloques.filter((b) => delMismoBloque(b.semilla, b.cuadros, lectura));
    if (candidatos.length === 1) sumarA(candidatos[0], lectura);
    else if (candidatos.length === 0 || lectura.votos >= VOTOS_PARA_FIRME)
      bloques.push({ semilla: lectura, cuadros: new Set(lectura.cuadros), lecturas: [lectura] });
    else ambiguas += 1;
  }
  // Un número que nunca salió con una dirección (ni cortada) y se vio menos de
  // VOTOS_PARA_FIRME veces es una fila mal leída, no un encargo a medias: una fila de OF
  // a la vista se lee muchas veces (terreno 2026-11-15: 15 OF y 18 «a medias» de ruido).
  const sinDireccion = (l: Lectura) => Object.keys(l.destinos).length + Object.keys(l.abiertos).length === 0;
  const utiles = bloques.filter((b) => !b.lecturas.every(sinDireccion) || b.lecturas.reduce((s, l) => s + l.votos, 0) >= VOTOS_PARA_FIRME);
  return { bloques: utiles, ambiguas, ruido: bloques.length - utiles.length };
}

/** La dirección de un encargo. Una leída sin cerrar (el cuadro terminó ahí y puede venir
 *  cortada) suma solo si se parece a la cerrada; si nunca se leyó cerrada, se muestra la
 *  abierta pero no queda firme: el conductor la confirma con el papel (spec 034). */
function elegirDestino(destinos: Record<string, number>, abiertos: Record<string, number>): ReturnType<typeof elegirTexto> {
  const cerrado = elegirTexto(destinos);
  if (typeof cerrado.valor === "string") {
    const juntos = { ...destinos };
    for (const [k, n] of Object.entries(abiertos)) {
      if (parecidos(JSON.parse(k) as string, cerrado.valor)) juntos[k] = (juntos[k] ?? 0) + n;
    }
    const conAbiertos = elegirTexto(juntos);
    return conAbiertos.valor == null ? cerrado : { valor: cerrado.valor, firme: cerrado.firme || conAbiertos.firme };
  }
  if (Object.keys(destinos).length > 0) return cerrado;
  return { valor: elegirTexto(abiertos).valor, firme: false };
}

/** Las lecturas de un bloque → su OF, dígito por dígito. */
export function decidir({ lecturas }: Bloque): Decidido {
  const total = lecturas.reduce((s, l) => s + l.votos, 0);
  // El largo más leído; las lecturas de otro largo (un dígito perdido) cuentan en contra.
  const porLargo = new Map<number, number>();
  for (const l of lecturas) porLargo.set(l.of.length, (porLargo.get(l.of.length) ?? 0) + l.votos);
  const [largo, votosLargo] = [...porLargo].sort((a, b) => b[1] - a[1])[0];
  const delLargo = lecturas.filter((l) => l.of.length === largo);
  let of = "";
  let firme = votosLargo >= VOTOS_PARA_FIRME && 3 * votosLargo >= 2 * total;
  for (let i = 0; i < largo; i++) {
    // Votan solo las lecturas en que ese dígito salió con confianza; si ninguna, se
    // muestra el más leído pero la OF no queda firme.
    const conConfianza = new Map<string, number>();
    const todos = new Map<string, number>();
    for (const l of delLargo) {
      conConfianza.set(l.of[i], (conConfianza.get(l.of[i]) ?? 0) + l.digitos[i]);
      todos.set(l.of[i], (todos.get(l.of[i]) ?? 0) + l.votos);
    }
    const votosPosicion = [...conConfianza.values()].reduce((s, n) => s + n, 0);
    const conteo = votosPosicion > 0 ? conConfianza : todos;
    const [digito, n] = [...conteo].sort((a, b) => b[1] - a[1])[0];
    of += digito;
    if (votosPosicion === 0 || n < VOTOS_PARA_FIRME || 3 * n < 2 * votosPosicion) firme = false;
  }
  const destinos: Record<string, number> = {};
  const abiertos: Record<string, number> = {};
  for (const l of lecturas) {
    for (const [k, n] of Object.entries(l.destinos)) destinos[k] = (destinos[k] ?? 0) + n;
    for (const [k, n] of Object.entries(l.abiertos)) abiertos[k] = (abiertos[k] ?? 0) + n;
  }
  const destino = elegirDestino(destinos, abiertos);
  return {
    of,
    destino: destino.valor as string | null,
    cuadros: total,
    firme,
    destinoFirme: destino.firme,
    lecturas: lecturas.length,
    orden: Math.min(...lecturas.map((l) => l.orden)),
    corregidas: total - (lecturas.find((l) => l.of === of)?.votos ?? 0),
  };
}

/** Cada encargo se compara con los que ya quedaron firmes (dueño, 2026-11-15: «estar
 *  constantemente preguntándose si una OF que no es igual a las demás era un fallo de
 *  lectura»; una nómina de 15 OF daba 16 y nueve por confirmar que no existían, casi todas
 *  a un dígito de una firme). Dos números parecidos son **la misma fila de la hoja** si
 *  nunca salieron en el mismo cuadro (dos filas a la vista se leen juntas) y uno se leyó
 *  mientras el otro estaba a la vista. La dirección casi no decide: un cuadro movido la
 *  lee mal o toma la del encargo de al lado. Solo son dos encargos si las dos direcciones
 *  quedaron firmes, son bien distintas y la del más débil no es la de una fila vecina
 *  (con el celular muy cerca entra una sola fila por cuadro, y dos OF seguidas de
 *  verdad nunca saldrían juntas).
 *   · `malas`: la lectura más débil (sin firmar y con menos cuadros, o firme con un tercio
 *     o menos) → el índice del encargo firme. No se lista.
 *   · `dobles`: los dos quedaron firmes con cuadros parecidos y no se sabe cuál dígito es:
 *     se dejan los dos, por confirmar con el papel. No se bota nada a ciegas. */
export function revisarParecidas(bloques: Bloque[], decididos: Decidido[]): { malas: Map<number, number>; dobles: Set<number> } {
  const malas = new Map<number, number>();
  const dobles = new Set<number>();
  const juntas = (i: number, k: number) => [...bloques[i].cuadros].some((c) => bloques[k].cuadros.has(c));
  const aLaVista = (i: number, k: number) => {
    const delOtro = [...bloques[k].cuadros];
    return [...bloques[i].cuadros].every((c) => delOtro.some((f) => Math.abs(f - c) <= CUADROS_CERCA));
  };
  decididos.forEach((d, i) => {
    // Una lectura de uno o dos cuadros puede venir con un dígito más de error.
    const tolerancia = d.cuadros <= 2 ? DIGITOS_DE_ERROR + 1 : DIGITOS_DE_ERROR;
    decididos.forEach((o, k) => {
      if (k === i || malas.has(i) || !o.firme) return;
      if (Math.abs(o.of.length - d.of.length) > tolerancia || distancia(o.of, d.of) > tolerancia) return;
      if (juntas(i, k) || !aLaVista(i, k)) return;
      if (d.destinoFirme && o.destinoFirme && d.destino && o.destino && !parecidos(d.destino, o.destino, DIRECCION_MOVIDA)) {
        const suya = d.destino;
        const deUnaVecina = decididos.some((m, j) => j !== i && j !== k && m.destino && juntas(j, k) && parecidos(suya, m.destino));
        if (!deUnaVecina) return;
      }
      if (d.firme ? 3 * d.cuadros <= o.cuadros : d.cuadros < o.cuadros) malas.set(i, k);
      else if (d.firme) dobles.add(i).add(k);
    });
  });
  for (const i of malas.keys()) dobles.delete(i);
  return { malas, dobles };
}

/** Los encargos en el orden en que van en la hoja (dueño, 2026-11-15: el informe de lo leído
 *  en el orden de la boleta, para compararlo con el papel). El orden en que se vio cada
 *  número no alcanza: un encargo que se saltó y se leyó al repasar quedaba al final. Aquí
 *  manda la posición: en cada cuadro se anotó quién estaba arriba de quién (`arriba`, por
 *  número leído; `duenio` dice de qué encargo es cada número), y un encargo va antes que
 *  otro si salió arriba de él más veces que abajo. Entre dos que nunca se vieron juntos, o
 *  si las posiciones se contradicen, decide cuál se vio primero (`primeroVisto`). */
export function ordenEnLaHoja(primeroVisto: number[], arriba: Record<string, Record<string, number>>, duenio: Map<string, number>): number[] {
  const n = primeroVisto.length;
  const veces = Array.from({ length: n }, () => new Map<number, number>());
  for (const [a, abajo] of Object.entries(arriba)) {
    const i = duenio.get(a);
    if (i == null) continue;
    for (const [b, cuantas] of Object.entries(abajo)) {
      const j = duenio.get(b);
      if (j != null && j !== i) veces[i].set(j, (veces[i].get(j) ?? 0) + cuantas);
    }
  }
  // i va antes que j si salió arriba de j más veces que abajo.
  const siguen: number[][] = Array.from({ length: n }, () => []);
  const adelante = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (const [j, cuantas] of veces[i]) {
      if (cuantas > (veces[j].get(i) ?? 0)) {
        siguen[i].push(j);
        adelante[j] += 1;
      }
    }
  }
  const faltan = new Set(primeroVisto.map((_, i) => i));
  const orden: number[] = [];
  while (faltan.size > 0) {
    const libres = [...faltan].filter((i) => adelante[i] === 0);
    const sigue = (libres.length > 0 ? libres : [...faltan]).sort((a, b) => primeroVisto[a] - primeroVisto[b])[0];
    orden.push(sigue);
    faltan.delete(sigue);
    for (const j of siguen[sigue]) adelante[j] -= 1;
  }
  return orden;
}
