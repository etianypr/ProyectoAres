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
import { leerGuia } from "./guia";
import { piezasNomina } from "./nomina";
import { armarBloques, decidir, revisarParecidas, VOTOS_PARA_FIRME, type Lectura } from "./bloques-nomina";

export { VOTOS_PARA_FIRME } from "./bloques-nomina";

/** Bajo esta confianza de ML Kit (0 a 1) un dígito no vota. A medir en terreno. */
export const CONFIANZA_MINIMA = 0.5;

/** `abiertos`: direcciones que llegaron al borde del cuadro sin cerrarse (pueden venir
 *  cortadas): solo cuentan si se parecen a una cerrada, o si nunca hubo otra (spec 034). */
export type VotosOf = {
  cuadros: number[];
  orden: number;
  destinos: Record<string, number>;
  digitos: number[];
  abiertos?: Record<string, number>;
};

export type VotosNomina = {
  cuadros: number;
  /** Por número leído (cada lectura distinta aparte): los cuadros en que salió, en
   *  qué orden apareció, cada destino leído (en JSON, como en votos.ts) y, por
   *  posición, en cuántas lecturas votó ese dígito (las de poca confianza no). */
  ofs: Record<string, VotosOf>;
  /** Cuántos encargos enteros, OF sueltas y direcciones sin cerrar se leyeron (spec 034):
   *  dice cuánto del barrido llega por piezas. No viene en votos guardados antes. */
  conteo?: { enteros: number; sueltas: number; abiertas: number };
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

/** Una OF del barrido para la lista y para «Cargar la guía» (spec 034). `aMedias`: se vio
 *  pero no entera, y antes se perdía en silencio: sin su dirección (`sinDireccion`) o en un
 *  solo cuadro (`unaVez`). `porConfirmar`: número o dirección sin firmar. */
export type EstadoLista = "firme" | "porConfirmar" | "aMedias";
export type LineaListada = {
  of: string;
  destino: string | null;
  estado: EstadoLista;
  motivo?: "sinDireccion" | "unaVez";
  /** El número quedó firme (la dirección puede seguir dudosa): no hay que volver a pasar. */
  ofFirme: boolean;
  /** Cifras para Diagnóstico, sin datos: en cuántos cuadros salió, cuántas lecturas
   *  distintas se juntaron y cómo es el encargo de número más parecido (un duplicado se
   *  ve como pocos dígitos de diferencia, nunca en el mismo cuadro). */
  cuadros: number;
  lecturas: number;
  cerca: { digitos: number; mismoCuadro: boolean; mismaDireccion: boolean | null } | null;
};

export type ResultadoNomina = {
  cuadros: number;
  /** Las OF vistas en 2 cuadros o más, firmes y por confirmar, en el orden de la nómina. */
  lineas: LineaNomina[];
  /** Todo lo visto en el orden de la nómina, con lo «a medias» (spec 034, ideas B y D). */
  lista: LineaListada[];
  firmes: number;
  porConfirmar: number;
  /** Vistas en un solo cuadro: ruido o una que pasó muy rápido. */
  unaVez: number;
  /** OF sueltas (sin dirección) que calzaban con dos encargos y no votaron por ninguno. */
  ambiguas: number;
  /** Números sin ninguna dirección vistos menos de VOTOS_PARA_FIRME veces: no se listan. */
  ruido: number;
  /** Encargos que eran una mala lectura de otro ya firme: no se listan. */
  malLeidas: number;
  /** Firmes que parecen la misma fila leída de dos formas: quedan por confirmar. */
  dobles: number;
  conteo: { enteros: number; sueltas: number; abiertas: number };
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
 *  la que armó más encargos enteros. Antes ganaba la que confirmaba más OF, y eso
 *  premiaba a la que traía una OF repetida (terreno 2026-11-15: 16 de 15). */
export function mejorResultado(a: ResultadoNomina, b: ResultadoNomina): ResultadoNomina {
  return a.conteo.enteros >= b.conteo.enteros ? a : b;
}

export { lineasDelBarrido, conPorConfirmar } from "./barrido-a-guia";
export { cajasDelCuadro, confianzasDelCuadro, filasDe, textoPorFilas } from "./cajas-nomina";
export type { CajaEncargo, NumeroLeido, RenglonCaja } from "./cajas-nomina";

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
 *  OF sin su confianza (APK anterior, o todas en 0) vota con todos sus dígitos.
 *  Con `piezas`, una OF que entró al cuadro sin su dirección entera también vota sus
 *  dígitos. **Apagadas** (spec 034, medido el 2026-11-15 con una nómina de 15): las
 *  piezas se leen en el borde del cuadro, con más dígitos mal, y dieron 14 firmes y 3
 *  por confirmar donde los encargos enteros solos dieron 15 y 1. Quedan para medir
 *  en Diagnóstico. */
export function sumarCuadroNomina(
  v: VotosNomina,
  texto: string,
  confianzas?: Map<string, number[]>,
  { piezas: conPiezas = false }: { piezas?: boolean } = {},
): VotosNomina {
  const cuadro = v.cuadros;
  const guia = leerGuia(texto);
  const nomina = piezasNomina(texto.split(/\r?\n/));
  const conteo = { ...(v.conteo ?? { enteros: 0, sueltas: 0, abiertas: 0 }) };
  // Una OF tiene de 7 a 9 dígitos: el «1» de un encabezado que el lector de la
  // guía tomó por OF no lo es (primer barrido: 19 «OF» sin destino).
  const esOf = (of: string) => /^\d{7,9}$/.test(of);
  const delCuadro = new Map<string, { destino: string; abierta: string | null }>();
  for (const linea of [...nomina.bloques, ...guia.lineas]) {
    if (!esOf(linea.of) || delCuadro.has(linea.of)) continue;
    delCuadro.set(linea.of, { destino: linea.destino, abierta: null });
    conteo.enteros += 1;
  }
  for (const pieza of conPiezas ? nomina.piezas : []) {
    if (!esOf(pieza.of) || delCuadro.has(pieza.of)) continue;
    delCuadro.set(pieza.of, { destino: "", abierta: pieza.destino });
    if (pieza.destino) conteo.abiertas += 1;
    else conteo.sueltas += 1;
  }
  const ofs = { ...v.ofs };
  let digitosLeidos = v.digitosLeidos;
  let digitosDudosos = v.digitosDudosos;
  for (const [of, { destino, abierta }] of delCuadro) {
    const antes = ofs[of] ?? { cuadros: [], orden: Object.keys(ofs).length, destinos: {}, digitos: of.split("").map(() => 0) };
    const destinos = { ...antes.destinos };
    if (destino) {
      const clave = JSON.stringify(destino);
      destinos[clave] = (destinos[clave] ?? 0) + 1;
    }
    const abiertos = { ...antes.abiertos };
    if (abierta) {
      const clave = JSON.stringify(abierta);
      abiertos[clave] = (abiertos[clave] ?? 0) + 1;
    }
    const conf = confianzas?.get(of);
    const conConfianza = conf != null && conf.length === of.length && conf.some((c) => c > 0);
    if (conConfianza) {
      digitosLeidos += conf.length;
      digitosDudosos += conf.filter((c) => c < CONFIANZA_MINIMA).length;
    }
    const digitos = antes.digitos.map((n, i) => n + (conConfianza && conf[i] < CONFIANZA_MINIMA ? 0 : 1));
    ofs[of] = { cuadros: [...antes.cuadros, cuadro], orden: antes.orden, destinos, digitos, abiertos };
  }
  const totales = { ...v.totales };
  if (guia.totalDeclarado != null) totales[guia.totalDeclarado] = (totales[guia.totalDeclarado] ?? 0) + 1;
  const numeros = { ...v.numeros };
  for (const n of new Set(texto.match(/(?<!\d)\d{7,10}(?!\d)/g) ?? [])) numeros[n] = (numeros[n] ?? 0) + 1;
  return {
    cuadros: cuadro + 1,
    ofs,
    conteo,
    digitosLeidos,
    digitosDudosos,
    totales,
    numeros,
    ultimoConTexto: texto.trim() ? cuadro : v.ultimoConTexto,
    ultimoConLineas: delCuadro.size ? cuadro : v.ultimoConLineas,
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
    abiertos: o.abiertos ?? {},
    destino: elegirTexto(o.destinos).valor as string | null,
  }));
  const armado = armarBloques(lecturas);
  const todos = armado.bloques.map(decidir);
  // Una mala lectura de un encargo que ya quedó firme no se lista: apunta al firme. Dos
  // firmes que parecen la misma fila quedan los dos, por confirmar.
  const parecidas = revisarParecidas(armado.bloques, todos);
  const { malas } = parecidas;
  const bloques = armado.bloques.filter((_, i) => !malas.has(i));
  const decididos = todos.filter((_, i) => !malas.has(i));
  const dobles = new Set([...parecidas.dobles].map((i) => todos[i]));
  const { ambiguas } = armado;
  const vistas = decididos.filter((d) => d.cuadros >= 2).sort((a, b) => a.orden - b.orden);
  const deLectura: Record<string, string> = {};
  bloques.forEach((b, i) => {
    if (decididos[i].cuadros >= 2) for (const l of b.lecturas) deLectura[l.of] = decididos[i].of;
  });
  for (const [i, j] of malas) for (const l of armado.bloques[i].lecturas) deLectura[l.of] = todos[j].of;
  const [total] = Object.entries(v.totales).sort((a, b) => b[1] - a[1]);
  // Para Diagnóstico: el encargo de número más parecido a cada uno, sin ningún dato.
  const masCercano = (i: number): LineaListada["cerca"] => {
    let mejor: { j: number; digitos: number } | null = null;
    decididos.forEach((o, j) => {
      const digitos = j === i ? Infinity : distancia(decididos[i].of, o.of);
      if (digitos < (mejor?.digitos ?? Infinity)) mejor = { j, digitos };
    });
    if (!mejor) return null;
    const { j, digitos } = mejor as { j: number; digitos: number };
    const [a, b] = [decididos[i].destino, decididos[j].destino];
    return {
      digitos,
      mismoCuadro: [...bloques[i].cuadros].some((c) => bloques[j].cuadros.has(c)),
      mismaDireccion: a && b ? parecidos(a, b) : null,
    };
  };
  // Todo lo visto, en el orden de la nómina: lo que se vio en un solo cuadro o sin su
  // dirección ya no se pierde (spec 034).
  const lista = decididos
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.orden - b.d.orden)
    .map(({ d, i }): LineaListada => {
      const medida = { cuadros: d.cuadros, lecturas: d.lecturas, cerca: masCercano(i) };
      if (d.cuadros < 2) return { of: d.of, destino: d.destino, estado: "aMedias", motivo: "unaVez", ofFirme: false, ...medida };
      if (!d.destino) return { of: d.of, destino: null, estado: "aMedias", motivo: "sinDireccion", ofFirme: d.firme, ...medida };
      const firme = d.firme && d.destinoFirme && !dobles.has(d);
      return { of: d.of, destino: d.destino, estado: firme ? "firme" : "porConfirmar", ofFirme: d.firme, ...medida };
    });
  return {
    cuadros: v.cuadros,
    lista,
    lineas: vistas.map(({ of, destino, cuadros, firme, destinoFirme, lecturas: n }) => ({
      of,
      destino,
      cuadros,
      firme,
      destinoFirme,
      lecturas: n,
    })),
    // Sin dirección no está leída aunque el número esté firme: va «a medias» (spec 034).
    firmes: vistas.filter((d) => d.firme && d.destino && !dobles.has(d)).length,
    porConfirmar: vistas.filter((d) => (!d.firme || dobles.has(d)) && d.destino).length,
    unaVez: decididos.length - vistas.length,
    ambiguas,
    ruido: armado.ruido,
    malLeidas: malas.size,
    dobles: dobles.size,
    conteo: v.conteo ?? { enteros: 0, sueltas: 0, abiertas: 0 },
    lecturasCorregidas: vistas.reduce((s, d) => s + d.corregidas, 0),
    total: total ? Number(total[0]) : null,
    numerosFirmes: Object.values(v.numeros).filter((n) => n >= VOTOS_PARA_FIRME).length,
    digitosLeidos: v.digitosLeidos,
    digitosDudosos: v.digitosDudosos,
    deLectura,
  };
}
