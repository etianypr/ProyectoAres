// La nómina de reparto barrida con la cámara en vivo → sus OF y sus destinos. Puro.
//
// La nómina es larga para sacarle fotos (dueño, 2026-11-11): antes de hacer una
// pantalla de carga se mide en Diagnóstico si pasando la cámara por ella salen sus
// líneas. Cada cuadro se lee con el lector de la nómina (`leerNomina`) y con el de la
// guía (`leerGuia`).
//
// ML Kit se equivoca en dígitos sueltos (primer barrido en terreno: 49 de 99 OF
// tenían otra con un dígito distinto), así que la OF no es la lectura más repetida
// sino que se decide dígito por dígito (dueño: «tiene que demorarse más en procesar
// cuál número es»):
//   · Las lecturas de un mismo bloque se juntan: números que difieren en hasta
//     DIGITOS_DE_ERROR dígitos, con la misma dirección y que nunca salieron en el
//     mismo cuadro (dos OF reales parecidas salen juntas en la hoja y no se mezclan).
//   · Cada dígito se vota aparte. La OF queda firme cuando cada dígito salió igual en
//     VOTOS_PARA_FIRME cuadros y en 2 de cada 3 lecturas; si no, queda por confirmar.
//   · Un dígito que ML Kit leyó con confianza bajo CONFIANZA_MINIMA no vota en su
//     posición (la APK manda la confianza de cada carácter de los números largos).

import { elegirTexto, distancia, parecidos } from "./etiqueta/votos";
import { leerGuia, type LineaGuia } from "./guia";
import { bloquesNomina, leerNomina, ofDeRenglon } from "./nomina";
import { LARGO_OF, ofValida } from "../paquete";

/** Cuántas veces tiene que salir igual cada dígito de la OF. */
export const VOTOS_PARA_FIRME = 3;
/** Hasta cuántos dígitos mal (o perdidos) se juntan con la lectura buena. */
const DIGITOS_DE_ERROR = 2;
/** Bajo esta confianza de ML Kit (0 a 1) un dígito no vota. A medir en terreno. */
export const CONFIANZA_MINIMA = 0.5;

/** Una palabra con 7 dígitos o más y la confianza de ML Kit en cada carácter (APK con
 *  los recuadros de la nómina; antes no viene). */
export type NumeroLeido = { texto: string; confianzas: number[] };

/** Un renglón con su caja, como lo da el escáner en vivo (`RenglonVivo`). */
export type RenglonCaja = { texto: string; x: number; y: number; ancho: number; alto: number; numeros?: NumeroLeido[] };

export type VotosNomina = {
  cuadros: number;
  /** Por número leído (cada lectura distinta aparte): los cuadros en que salió, en
   *  qué orden apareció, cada destino leído (en JSON, como en votos.ts) y, por
   *  posición, en cuántas lecturas votó ese dígito (las de poca confianza no). */
  ofs: Record<string, { cuadros: number[]; orden: number; destinos: Record<string, number>; digitos: number[] }>;
  /** Dígitos de OF leídos y cuántos con poca confianza: para ajustar CONFIANZA_MINIMA. */
  digitosLeidos: number;
  digitosDudosos: number;
  /** MONTO NETO leídos: en la guía es la cantidad de paquetes. */
  totales: Record<string, number>;
  /** Números de 7 a 10 dígitos de cada cuadro, estén o no en un bloque entero: si la
   *  nómina trae otro formato, aquí se ve que las OF sí se leen. */
  numeros: Record<string, number>;
  /** El último cuadro con texto y el último con un bloque entero (OF y dirección):
   *  dicen si la cámara está leyendo. -1 si ninguno. */
  ultimoConTexto: number;
  ultimoConLineas: number;
};

export type LineaNomina = {
  of: string;
  destino: string | null;
  /** Cuadros en que salió su bloque, con todas sus lecturas. */
  cuadros: number;
  /** Cada dígito salió igual en VOTOS_PARA_FIRME cuadros y en 2 de cada 3 lecturas. */
  firme: boolean;
  destinoFirme: boolean;
  /** Lecturas distintas del número que se juntaron aquí (errores del lector). */
  lecturas: number;
};

export type ResultadoNomina = {
  cuadros: number;
  /** Las OF vistas en 2 cuadros o más, firmes y por confirmar, en el orden de la nómina. */
  lineas: LineaNomina[];
  firmes: number;
  porConfirmar: number;
  /** Vistas en un solo cuadro: ruido o una que pasó muy rápido. */
  unaVez: number;
  /** Lecturas que traían algún dígito distinto de la OF que quedó. */
  lecturasCorregidas: number;
  total: number | null;
  numerosFirmes: number;
  /** De los dígitos de OF leídos con su confianza, cuántos no votaron (bajo
   *  CONFIANZA_MINIMA). 0 de 0 con una APK que no manda la confianza. */
  digitosLeidos: number;
  digitosDudosos: number;
  /** Cada número leído → la OF que quedó para su bloque: un cuadro que leyó mal un
   *  dígito de una OF confirmada la marca igual, con el número bueno. */
  deLectura: Record<string, string>;
};

/** De las dos formas de juntar los renglones (por filas o como los entrega ML Kit),
 *  la que confirmó más OF. */
export function mejorResultado(a: ResultadoNomina, b: ResultadoNomina): ResultadoNomina {
  return a.firmes >= b.firmes ? a : b;
}

/** Lo barrido → las líneas de «Cargar la guía» (con su destino; una OF sin dirección no
 *  sirve para la ruta y no entra). Las que no quedaron firmes, de número o de
 *  dirección, van por confirmar: el conductor las mira con el papel. */
export function lineasDelBarrido(r: ResultadoNomina): { lineas: { of: string; destino: string }[]; porConfirmar: Set<string>; total: number | null } {
  const conDestino = r.lineas.filter((l) => l.destino);
  return {
    lineas: conDestino.map((l) => ({ of: l.of, destino: l.destino! })),
    porConfirmar: new Set(conDestino.filter((l) => !l.firme || !l.destinoFirme).map((l) => l.of)),
    total: r.total,
  };
}

/** Las líneas de «Cargar la guía» después de juntar lo que había (`antes`) con lo nuevo
 *  (`nuevas`, de fotos o de un barrido) en `unidas` (armarGuia, que no sabe de esto). Una
 *  OF queda por confirmar si ya lo estaba y lo nuevo no la trajo firme, o si llega por
 *  confirmar (`porConfirmar`) y antes no estaba firme. */
export function conPorConfirmar(
  unidas: LineaGuia[],
  antes: LineaGuia[],
  nuevas: { of: string }[],
  porConfirmar: Set<string> = new Set(),
): LineaGuia[] {
  const clave = (of: string) => ofValida(of) ?? of;
  const firmesAntes = new Set(antes.filter((l) => !l.porConfirmar).map((l) => clave(l.of)));
  const pendientesAntes = new Set(antes.filter((l) => l.porConfirmar).map((l) => clave(l.of)));
  const firmesNuevas = new Set(nuevas.map((l) => clave(l.of)).filter((of) => !porConfirmar.has(of)));
  return unidas.map((l) => {
    const of = clave(l.of);
    const pendiente = (pendientesAntes.has(of) && !firmesNuevas.has(of)) || (porConfirmar.has(of) && !firmesAntes.has(of));
    return pendiente ? { ...l, porConfirmar: true } : l;
  });
}

/** Un encargo en el cuadro: su caja (la de todos sus renglones juntos) y la OF que se
 *  leyó en este cuadro. `entero`: se vio de la fila de la OF hasta la dirección; si no,
 *  la caja es solo la fila de la OF, que va entrando a la cámara. */
export type CajaEncargo = { of: string; x: number; y: number; ancho: number; alto: number; entero: boolean };

/** Los encargos de un cuadro, para marcarlos sobre la cámara de a uno entero (dueño,
 *  2026-11-11: «si me marcas con rectángulos pequeños no entiendo qué estoy leyendo»). */
export function cajasDelCuadro(renglones: RenglonCaja[], filas = filasDe(renglones)): CajaEncargo[] {
  const caja = (desde: number, hasta: number, of: string, entero: boolean): CajaEncargo => {
    const cajas = filas.slice(desde, hasta + 1).flatMap((f) => f.indices.map((i) => renglones[i]));
    const x = Math.min(...cajas.map((r) => r.x));
    const y = Math.min(...cajas.map((r) => r.y));
    const ancho = Math.max(...cajas.map((r) => r.x + r.ancho)) - x;
    const alto = Math.max(...cajas.map((r) => r.y + r.alto)) - y;
    return { of, x, y, ancho, alto, entero };
  };
  const enEncargo = new Set<number>();
  const encargos: CajaEncargo[] = [];
  for (const b of bloquesNomina(filas.map((f) => f.texto))) {
    encargos.push(caja(b.filaOf, b.hasta, b.of, true));
    for (let i = b.filaOf; i <= b.hasta; i++) enEncargo.add(i);
  }
  filas.forEach((f, i) => {
    const of = enEncargo.has(i) ? null : ofDeRenglon(f.texto);
    if (of) encargos.push(caja(i, i, of, false));
  });
  return encargos;
}

/** OF → la confianza de cada uno de sus dígitos, de las palabras con números largos
 *  de un cuadro. La OF se arma como en nomina.ts (`ofDeRenglon`): solo los dígitos,
 *  los primeros LARGO_OF (el TOTAL pegado sobra) y sin los ceros a la izquierda. */
export function confianzasDelCuadro(renglones: RenglonCaja[]): Map<string, number[]> {
  const porOf = new Map<string, number[]>();
  for (const r of renglones) {
    for (const n of r.numeros ?? []) {
      // Sin una confianza por carácter (otra cantidad) no se puede alinear: se ignora.
      if (n.confianzas.length !== n.texto.length) continue;
      const digitos = [...n.texto]
        .flatMap((c, i) => (/\d/.test(c) ? [{ c, confianza: n.confianzas[i] }] : []))
        .slice(0, LARGO_OF);
      const desde = digitos.findIndex((d) => d.c !== "0");
      if (desde < 0) continue;
      const of = digitos.slice(desde);
      porOf.set(
        of.map((d) => d.c).join(""),
        of.map((d) => d.confianza),
      );
    }
  }
  return porOf;
}

/** Los renglones agrupados por fila de la hoja: de arriba abajo y, en cada fila,
 *  de izquierda a derecha. ML Kit puede entregar una tabla por columnas (todas las
 *  OF y después todos los destinos), y así la OF no queda al lado de su destino.
 *  Cada fila dice qué renglones del cuadro la forman (para marcarlos en la cámara). */
export function filasDe(renglones: RenglonCaja[]): { texto: string; indices: number[] }[] {
  const filas: { centro: number; alto: number; indices: number[] }[] = [];
  const orden = renglones.map((r, i) => ({ r, i })).sort((a, b) => a.r.y + a.r.alto / 2 - (b.r.y + b.r.alto / 2));
  for (const { r, i } of orden) {
    const centro = r.y + r.alto / 2;
    const fila = filas.at(-1);
    if (fila && Math.abs(centro - fila.centro) <= Math.min(fila.alto, r.alto) / 2) fila.indices.push(i);
    else filas.push({ centro, alto: r.alto, indices: [i] });
  }
  return filas.map((f) => {
    const indices = f.indices.sort((a, b) => renglones[a].x - renglones[b].x);
    return { texto: indices.map((i) => renglones[i].texto).join(" "), indices };
  });
}

export function textoPorFilas(renglones: RenglonCaja[]): string {
  return filasDe(renglones)
    .map((f) => f.texto)
    .join("\n");
}

export function votosNominaVacios(): VotosNomina {
  return {
    cuadros: 0,
    ofs: {},
    digitosLeidos: 0,
    digitosDudosos: 0,
    totales: {},
    numeros: {},
    ultimoConTexto: -1,
    ultimoConLineas: -1,
  };
}

/** Suma lo que dio un cuadro. Cada número cuenta una vez por cuadro. Se lee con los
 *  dos formatos: la nómina de la sucursal (nomina.ts) y la guía «OF: … DESTINO: …».
 *  Con `confianzas` (confianzasDelCuadro), un dígito de poca confianza no vota; una
 *  OF sin su confianza (APK anterior, o todas en 0) vota con todos sus dígitos. */
export function sumarCuadroNomina(v: VotosNomina, texto: string, confianzas?: Map<string, number[]>): VotosNomina {
  const cuadro = v.cuadros;
  const guia = leerGuia(texto);
  const delCuadro = new Map<string, string>();
  for (const linea of [...leerNomina(texto), ...guia.lineas]) {
    // Una OF tiene de 7 a 9 dígitos: el «1» de un encabezado que el lector de la
    // guía tomó por OF no lo es (primer barrido: 19 «OF» sin destino).
    if (!/^\d{7,9}$/.test(linea.of) || delCuadro.has(linea.of)) continue;
    delCuadro.set(linea.of, linea.destino);
  }
  const ofs = { ...v.ofs };
  let digitosLeidos = v.digitosLeidos;
  let digitosDudosos = v.digitosDudosos;
  for (const [of, destino] of delCuadro) {
    const antes = ofs[of] ?? { cuadros: [], orden: Object.keys(ofs).length, destinos: {}, digitos: of.split("").map(() => 0) };
    const destinos = { ...antes.destinos };
    if (destino) {
      const clave = JSON.stringify(destino);
      destinos[clave] = (destinos[clave] ?? 0) + 1;
    }
    const conf = confianzas?.get(of);
    const conConfianza = conf != null && conf.length === of.length && conf.some((c) => c > 0);
    if (conConfianza) {
      digitosLeidos += conf.length;
      digitosDudosos += conf.filter((c) => c < CONFIANZA_MINIMA).length;
    }
    const digitos = antes.digitos.map((n, i) => n + (conConfianza && conf[i] < CONFIANZA_MINIMA ? 0 : 1));
    ofs[of] = { cuadros: [...antes.cuadros, cuadro], orden: antes.orden, destinos, digitos };
  }
  const totales = { ...v.totales };
  if (guia.totalDeclarado != null) totales[guia.totalDeclarado] = (totales[guia.totalDeclarado] ?? 0) + 1;
  const numeros = { ...v.numeros };
  for (const n of new Set(texto.match(/(?<!\d)\d{7,10}(?!\d)/g) ?? [])) numeros[n] = (numeros[n] ?? 0) + 1;
  return {
    cuadros: cuadro + 1,
    ofs,
    digitosLeidos,
    digitosDudosos,
    totales,
    numeros,
    ultimoConTexto: texto.trim() ? cuadro : v.ultimoConTexto,
    ultimoConLineas: delCuadro.size ? cuadro : v.ultimoConLineas,
  };
}

type Lectura = {
  of: string;
  votos: number;
  /** Por posición, en cuántas de sus lecturas votó ese dígito. */
  digitos: number[];
  cuadros: Set<number>;
  orden: number;
  destinos: Record<string, number>;
  destino: string | null;
};

/** ¿Esta lectura es del bloque que empezó `semilla`? */
function delMismoBloque(semilla: Lectura, cuadros: Set<number>, lectura: Lectura): boolean {
  if (Math.abs(semilla.of.length - lectura.of.length) > DIGITOS_DE_ERROR) return false;
  if (distancia(semilla.of, lectura.of) > DIGITOS_DE_ERROR) return false;
  // Salieron en un mismo cuadro: son dos bloques de la hoja.
  for (const c of lectura.cuadros) if (cuadros.has(c)) return false;
  return !semilla.destino || !lectura.destino || parecidos(semilla.destino, lectura.destino);
}

/** Las lecturas de un bloque → su OF, dígito por dígito. */
function decidir(lecturas: Lectura[]): LineaNomina & { orden: number; corregidas: number } {
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
  for (const l of lecturas) for (const [k, n] of Object.entries(l.destinos)) destinos[k] = (destinos[k] ?? 0) + n;
  const destino = elegirTexto(destinos);
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

export function resultadoNomina(v: VotosNomina): ResultadoNomina {
  const lecturas: Lectura[] = Object.entries(v.ofs).map(([of, o]) => ({
    of,
    votos: o.cuadros.length,
    digitos: o.digitos,
    cuadros: new Set(o.cuadros),
    orden: o.orden,
    destinos: o.destinos,
    destino: elegirTexto(o.destinos).valor as string | null,
  }));
  // De la más leída a la menos: la lectura buena suele empezar el bloque y las
  // erradas se le suman.
  const bloques: { semilla: Lectura; cuadros: Set<number>; lecturas: Lectura[] }[] = [];
  for (const lectura of lecturas.sort((a, b) => b.votos - a.votos || a.orden - b.orden)) {
    const bloque = bloques.find((b) => delMismoBloque(b.semilla, b.cuadros, lectura));
    if (bloque) {
      bloque.lecturas.push(lectura);
      for (const c of lectura.cuadros) bloque.cuadros.add(c);
    } else {
      bloques.push({ semilla: lectura, cuadros: new Set(lectura.cuadros), lecturas: [lectura] });
    }
  }
  const decididos = bloques.map((b) => decidir(b.lecturas));
  const vistas = decididos.filter((d) => d.cuadros >= 2).sort((a, b) => a.orden - b.orden);
  const deLectura: Record<string, string> = {};
  bloques.forEach((b, i) => {
    if (decididos[i].cuadros >= 2) for (const l of b.lecturas) deLectura[l.of] = decididos[i].of;
  });
  const [total] = Object.entries(v.totales).sort((a, b) => b[1] - a[1]);
  return {
    cuadros: v.cuadros,
    lineas: vistas.map(({ of, destino, cuadros, firme, destinoFirme, lecturas: n }) => ({
      of,
      destino,
      cuadros,
      firme,
      destinoFirme,
      lecturas: n,
    })),
    firmes: vistas.filter((d) => d.firme).length,
    porConfirmar: vistas.filter((d) => !d.firme).length,
    unaVez: decididos.length - vistas.length,
    lecturasCorregidas: vistas.reduce((s, d) => s + d.corregidas, 0),
    total: total ? Number(total[0]) : null,
    numerosFirmes: Object.values(v.numeros).filter((n) => n >= VOTOS_PARA_FIRME).length,
    digitosLeidos: v.digitosLeidos,
    digitosDudosos: v.digitosDudosos,
    deLectura,
  };
}
