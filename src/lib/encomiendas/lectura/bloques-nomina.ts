// Las lecturas de un barrido de la nómina → los encargos (bloques) y la OF de cada uno,
// dígito por dígito (spec 029; piezas, ruido y malas lecturas, 034). Puro. Aparte de
// barrido-nomina.ts, que lo usa, para no pasar de 400 líneas (A7).

import { elegirTexto, distancia, parecidos } from "./etiqueta/votos";
import type { LineaNomina, ReglaFirme } from "./tipos-nomina";

/** Cuántas veces tiene que salir igual cada dígito de la OF. */
export const VOTOS_PARA_FIRME = 3;
/** Cuántas veces tiene que leerse igual la columna BULTOS de un encargo (y en 2 de cada 3
 *  lecturas de la columna) para valer (spec 036). */
export const VOTOS_BULTOS = 2;
/** Regla «confianza06» (spec 036, solo se mide): la confianza desde la que un dígito vota. */
export const CONFIANZA_ALTA = 0.6;
/** Regla «ponderada» (spec 036, solo se mide): el peso que tiene que juntar el dígito que
 *  gana, y cuántas veces más que el segundo. */
const PESO_FIRME = 2.5;
const VECES_EL_SEGUNDO = 2;

/** El peso de un dígito por la confianza de ML Kit (regla «ponderada»): sus log-odds, 0
 *  desde 0,5 hacia abajo y con tope en 0,97. Sin confianza (una APK anterior), como 0,85.
 *  Una OF con dos «8» leídos bien con 0,66 y mal («6», «0») con 0,54 (spec 034) pesa ~0,66
 *  contra ~0,16 por lectura: con la de siempre nunca llegaba a 2 de cada 3. */
export function pesoDeConfianza(confianza: number | null): number {
  const c = confianza == null ? 0.85 : Math.min(confianza, 0.97);
  return c <= 0.5 ? 0 : Math.log(c / (1 - c));
}
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
  /** La columna BULTOS → cuántas veces se leyó así. */
  bultos: Record<string, number>;
  /** Solo al medir otras reglas (Diagnóstico): por dígito, el peso de su confianza y las
   *  veces que salió con CONFIANZA_ALTA. */
  pesos?: number[];
  altos?: number[];
  /** El reloj del barrido en su último cuadro (para vencer lo que falta confirmar). */
  visto?: number;
  /** Los votos de donde salió (`VotosOf`): mientras sea el mismo objeto, la lectura no
   *  cambió (sumarCuadroNomina copia solo las del cuadro). Con él se guarda lo decidido. */
  fuente?: object;
};

export type Bloque = { semilla: Lectura; cuadros: Set<number>; lecturas: Lectura[] };
export type Decidido = LineaNomina & { orden: number; corregidas: number };

const CUENTAS = new Int32Array(10);

/** ¿A lo más `tope` dígitos de diferencia? Antes de la distancia, dos cotas que no cuestan:
 *  la diferencia de largo y la de cuántas veces sale cada dígito (cambiar, poner o quitar
 *  uno mueve a lo más dos de esas cuentas). Da lo mismo que comparar `distancia` y casi
 *  nunca la calcula (spec 036: con 100 OF hay unas 800 lecturas distintas). */
export function aLoMas(a: string, b: string, tope: number): boolean {
  if (Math.abs(a.length - b.length) > tope) return false;
  CUENTAS.fill(0);
  const digitos = /^\d*$/.test(a) && /^\d*$/.test(b);
  for (let i = 0; digitos && i < a.length; i++) CUENTAS[a.charCodeAt(i) - 48] += 1;
  for (let i = 0; digitos && i < b.length; i++) CUENTAS[b.charCodeAt(i) - 48] -= 1;
  if (digitos) {
    let suma = 0;
    for (let d = 0; d < 10; d++) suma += Math.abs(CUENTAS[d]);
    if (Math.ceil(suma / 2) > tope) return false;
  }
  return distancia(a, b) <= tope;
}

/** ¿Esta lectura es del bloque que empezó `semilla`? */
function delMismoBloque(semilla: Lectura, cuadros: Set<number>, lectura: Lectura): boolean {
  if (!aLoMas(semilla.of, lectura.of, DIGITOS_DE_ERROR)) return false;
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

/** Las lecturas de un bloque → su OF, dígito por dígito. `regla`: la de siempre, salvo
 *  que Diagnóstico mida otra (spec 036). */
export function decidir({ lecturas }: Bloque, regla: ReglaFirme = "dosDeTres"): Decidido {
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
    const pesos = new Map<string, number>();
    for (const l of delLargo) {
      // «confianza06» cuenta solo los leídos con CONFIANZA_ALTA (sin ese dato, como siempre).
      const seguro = regla === "confianza06" && l.altos ? l.altos[i] : l.digitos[i];
      conConfianza.set(l.of[i], (conConfianza.get(l.of[i]) ?? 0) + seguro);
      todos.set(l.of[i], (todos.get(l.of[i]) ?? 0) + l.votos);
      if (l.pesos) pesos.set(l.of[i], (pesos.get(l.of[i]) ?? 0) + l.pesos[i]);
    }
    const votosPosicion = [...conConfianza.values()].reduce((s, n) => s + n, 0);
    if (regla === "ponderada" && pesos.size > 0) {
      // Gana el de más peso: firme si junta PESO_FIRME, VECES_EL_SEGUNDO más que el segundo
      // y VOTOS_PARA_FIRME votos con confianza.
      const [[digito, peso], segundo] = [...pesos].sort((a, b) => b[1] - a[1]);
      of += digito;
      if (peso < PESO_FIRME || (segundo && peso < VECES_EL_SEGUNDO * segundo[1]) || (conConfianza.get(digito) ?? 0) < VOTOS_PARA_FIRME) firme = false;
      continue;
    }
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
  // Los BULTOS del encargo (spec 036): el valor más leído, si salió VOTOS_BULTOS veces y en
  // 2 de cada 3 lecturas de la columna; si no, no se sabe.
  const porBultos = new Map<string, number>();
  for (const l of lecturas) for (const [b, n] of Object.entries(l.bultos)) porBultos.set(b, (porBultos.get(b) ?? 0) + n);
  const votosBultos = [...porBultos.values()].reduce((s, n) => s + n, 0);
  const [masLeido] = [...porBultos].sort((a, b) => b[1] - a[1]);
  const bultos = masLeido && masLeido[1] >= VOTOS_BULTOS && 3 * masLeido[1] >= 2 * votosBultos ? Number(masLeido[0]) : null;
  return {
    of,
    destino: destino.valor as string | null,
    cuadros: total,
    firme,
    destinoFirme: destino.firme,
    lecturas: lecturas.length,
    bultos,
    orden: Math.min(...lecturas.map((l) => l.orden)),
    corregidas: total - (lecturas.find((l) => l.of === of)?.votos ?? 0),
  };
}

const IDS = new WeakMap<object, number>();
let siguienteId = 1;
function idDe(o: object): number {
  let id = IDS.get(o);
  if (id === undefined) {
    id = siguienteId++;
    IDS.set(o, id);
  }
  return id;
}

/** Lo decidido de cada encargo, por la identidad de sus lecturas y en su orden (spec 036).
 *  Un encargo cuyas lecturas no salieron en cuadros nuevos no se vuelve a decidir: con 100
 *  OF, decidir todo de nuevo tomaba ~120 ms en el PC, casi todo en la dirección. */
const DECIDIDOS = new Map<string, Decidido>();
const TOPE_DECIDIDOS = 5000;

export function decidirGuardado(bloque: Bloque, regla: ReglaFirme = "dosDeTres"): Decidido {
  const { lecturas } = bloque;
  if (lecturas.some((l) => !l.fuente)) return decidir(bloque, regla);
  const clave = `${regla}|${lecturas.map((l) => `${l.of}:${idDe(l.fuente!)}`).join(",")}`;
  const guardado = DECIDIDOS.get(clave);
  if (guardado) return guardado;
  const decidido = decidir(bloque, regla);
  if (DECIDIDOS.size >= TOPE_DECIDIDOS) DECIDIDOS.clear();
  DECIDIDOS.set(clave, decidido);
  return decidido;
}

/** Para las pruebas: decidir todo de cero. */
export function olvidarDecididos(): void {
  DECIDIDOS.clear();
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
  // Los cuadros de cada encargo en orden: «a la vista» se responde recorriendo las dos
  // listas una vez, no cada cuadro contra todos los del otro (spec 036).
  const ordenados = bloques.map((b) => [...b.cuadros].sort((x, y) => x - y));
  const aLaVista = (i: number, k: number) => {
    const [suyos, delOtro] = [ordenados[i], ordenados[k]];
    if (delOtro.length === 0) return suyos.length === 0;
    let j = 0;
    for (const c of suyos) {
      while (j < delOtro.length - 1 && delOtro[j + 1] <= c) j++;
      const cerca = Math.abs(delOtro[j] - c) <= CUADROS_CERCA || (j + 1 < delOtro.length && delOtro[j + 1] - c <= CUADROS_CERCA);
      if (!cerca) return false;
    }
    return true;
  };
  decididos.forEach((d, i) => {
    // Una lectura de uno o dos cuadros puede venir con un dígito más de error.
    const tolerancia = d.cuadros <= 2 ? DIGITOS_DE_ERROR + 1 : DIGITOS_DE_ERROR;
    decididos.forEach((o, k) => {
      if (k === i || malas.has(i) || !o.firme) return;
      if (!aLoMas(o.of, d.of, tolerancia)) return;
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
