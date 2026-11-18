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
import { piezasNomina, totalDeBultos } from "./nomina";
import { alRango, rangoDelEscaneo } from "./rango-nomina";
import {
  armarBloques,
  CONFIANZA_ALTA,
  decidirGuardado,
  olvidarDecididos,
  ordenEnLaHoja,
  pesoDeConfianza,
  revisarParecidas,
  VOTOS_PARA_FIRME,
  type Lectura,
} from "./bloques-nomina";
import type { LineaListada, ReglaFirme, ResultadoNomina, VotosNomina } from "./tipos-nomina";

export { VOTOS_PARA_FIRME } from "./bloques-nomina";

/** Bajo esta confianza de ML Kit (0 a 1) un dígito no vota. A medir en terreno. */
export const CONFIANZA_MINIMA = 0.5;

export type { EstadoLista, LineaListada, LineaNomina, ReglaFirme, ResultadoNomina, VotosNomina, VotosOf } from "./tipos-nomina";

/** Lo que falta confirmar (a medias, o con el número sin firmar) y no vuelve a salir en
 *  este tiempo de cámara leyendo deja de estar (dueño, 2026-11-16: «a veces son inventadas
 *  y quedan molestando para siempre … aprox. 5 minutos»). Sus votos no se borran: si se
 *  vuelve a leer algo parecido, revive con lo que tenía. */
export const VENCE_MS = 5 * 60 * 1000;

/** Cuántas veces tiene que leerse igual el total de la boleta para valer. */
const LECTURAS_DEL_TOTAL = 2;

/** De las dos formas de juntar los renglones (por filas o como los entrega ML Kit),
 *  la que armó más encargos enteros. Antes ganaba la que confirmaba más OF, y eso
 *  premiaba a la que traía una OF repetida (terreno 2026-11-15: 16 de 15). */
export function mejorResultado(a: ResultadoNomina, b: ResultadoNomina): ResultadoNomina {
  return a.conteo.enteros >= b.conteo.enteros ? a : b;
}

export { lineasDelBarrido, conPorConfirmar, enOrdenDeLaNomina } from "./barrido-a-guia";
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
 *  en Diagnóstico.
 *  `vertical`: los números de este cuadro de arriba abajo, si el texto no viene en ese
 *  orden (los renglones como los entrega ML Kit); sin él vale el orden del texto.
 *  `reloj`: los ms de cámara leyendo hasta este cuadro; queda como `visto` de cada OF del
 *  cuadro (spec 036). `reglas`: anota también lo que necesitan las reglas que Diagnóstico
 *  compara con la de siempre (el peso de cada dígito; spec 036). */
export function sumarCuadroNomina(
  v: VotosNomina,
  texto: string,
  confianzas?: Map<string, number[]>,
  { piezas: conPiezas = false, vertical, reloj, reglas = false }: { piezas?: boolean; vertical?: string[]; reloj?: number; reglas?: boolean } = {},
): VotosNomina {
  const cuadro = v.cuadros;
  const guia = leerGuia(texto);
  const nomina = piezasNomina(texto.split(/\r?\n/));
  const conteo = { ...(v.conteo ?? { enteros: 0, sueltas: 0, abiertas: 0 }) };
  // Una OF tiene de 7 a 9 dígitos: el «1» de un encabezado que el lector de la
  // guía tomó por OF no lo es (primer barrido: 19 «OF» sin destino).
  const esOf = (of: string) => /^\d{7,9}$/.test(of);
  const delCuadro = new Map<string, { destino: string; abierta: string | null; bultos: number | null }>();
  for (const linea of [...nomina.bloques, ...guia.lineas]) {
    if (!esOf(linea.of) || delCuadro.has(linea.of)) continue;
    delCuadro.set(linea.of, { destino: linea.destino, abierta: null, bultos: "bultos" in linea && linea.bultos != null ? linea.bultos : null });
    conteo.enteros += 1;
  }
  for (const pieza of conPiezas ? nomina.piezas : []) {
    if (!esOf(pieza.of) || delCuadro.has(pieza.of)) continue;
    delCuadro.set(pieza.of, { destino: "", abierta: pieza.destino, bultos: null });
    if (pieza.destino) conteo.abiertas += 1;
    else conteo.sueltas += 1;
  }
  const ofs = { ...v.ofs };
  let digitosLeidos = v.digitosLeidos;
  let digitosDudosos = v.digitosDudosos;
  for (const [of, { destino, abierta, bultos }] of delCuadro) {
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
    const visto = reloj ?? antes.visto;
    // La columna BULTOS de su fila, si se leyó (spec 036).
    const conBultos = bultos != null ? { ...antes.bultos, [bultos]: (antes.bultos?.[bultos] ?? 0) + 1 } : antes.bultos;
    // Lo de las otras reglas, solo al medirlas (Diagnóstico): así el borrador no crece.
    const cero = () => of.split("").map(() => 0);
    const medir = reglas
      ? {
          pesos: (antes.pesos ?? cero()).map((p, i) => p + pesoDeConfianza(conConfianza ? conf[i] : null)),
          altos: (antes.altos ?? cero()).map((n, i) => n + (!conConfianza || conf[i] >= CONFIANZA_ALTA ? 1 : 0)),
        }
      : {};
    ofs[of] = {
      cuadros: [...antes.cuadros, cuadro],
      orden: antes.orden,
      destinos,
      digitos,
      abiertos,
      ...(visto != null ? { visto } : {}),
      ...(conBultos ? { bultos: conBultos } : {}),
      ...medir,
    };
  }
  // Quién va arriba de quién en la hoja, para ordenar el informe como el papel.
  const hoja = [...delCuadro.keys()];
  const deArribaAbajo = vertical ? vertical.filter((of) => delCuadro.has(of)) : hoja;
  const arriba = { ...v.arriba };
  deArribaAbajo.forEach((a, i) => {
    if (i === deArribaAbajo.length - 1) return;
    const abajo = { ...arriba[a] };
    for (const b of deArribaAbajo.slice(i + 1)) abajo[b] = (abajo[b] ?? 0) + 1;
    arriba[a] = abajo;
  });
  // El total de la boleta: el TOTAL BULTOS del pie de la nómina (spec 036) o el MONTO NETO
  // de la guía; una vez por cuadro.
  const totales = { ...v.totales };
  for (const total of new Set([guia.totalDeclarado, totalDeBultos(texto)])) {
    if (total != null) totales[total] = (totales[total] ?? 0) + 1;
  }
  const numeros = { ...v.numeros };
  for (const n of new Set(texto.match(/(?<!\d)\d{7,10}(?!\d)/g) ?? [])) numeros[n] = (numeros[n] ?? 0) + 1;
  return {
    cuadros: cuadro + 1,
    ofs,
    conteo,
    arriba,
    delUltimo: hoja,
    digitosLeidos,
    digitosDudosos,
    totales,
    numeros,
    ultimoConTexto: texto.trim() ? cuadro : v.ultimoConTexto,
    ultimoConLineas: delCuadro.size ? cuadro : v.ultimoConLineas,
    ...((reloj ?? v.reloj) != null ? { reloj: reloj ?? v.reloj } : {}),
    // Las anota sumarVecinos (rumbo-nomina.ts), con las cajas del cuadro: aquí siguen.
    ...(v.vecinos ? { vecinos: v.vecinos } : {}),
  };
}

/** Lo que sale de cada lectura sin cambiar entre una revisión y otra, por la identidad de
 *  sus votos (spec 036): `sumarCuadroNomina` copia solo las OF del cuadro, así que una
 *  lectura que no volvió a salir trae los mismos objetos. */
const DESTINO_DE = new WeakMap<Record<string, number>, string | null>();
const CUADROS_DE = new WeakMap<number[], Set<number>>();

function destinoDe(destinos: Record<string, number>): string | null {
  if (!DESTINO_DE.has(destinos)) DESTINO_DE.set(destinos, elegirTexto(destinos).valor as string | null);
  return DESTINO_DE.get(destinos)!;
}

function cuadrosDe(cuadros: number[]): Set<number> {
  let conjunto = CUADROS_DE.get(cuadros);
  if (!conjunto) {
    conjunto = new Set(cuadros);
    CUADROS_DE.set(cuadros, conjunto);
  }
  return conjunto;
}

/** Para las pruebas: decidir todo de cero, sin lo guardado de revisiones anteriores. */
export function vaciarCachesNomina(): void {
  olvidarDecididos();
}

/** `cerca`: calcula para Diagnóstico el encargo de número más parecido a cada uno (cuesta
 *  comparar todos contra todos; sin él, `cerca` va en null). `vencer: false`: lo que
 *  falta confirmar no vence (votosDeLoLeido lo necesita a la vista para botarlo).
 *  `regla`: cómo queda firme cada dígito; otra que la de siempre, solo en Diagnóstico. */
export function resultadoNomina(
  v: VotosNomina,
  { cerca: conCerca = false, vencer = true, regla = "dosDeTres" }: { cerca?: boolean; vencer?: boolean; regla?: ReglaFirme } = {},
): ResultadoNomina {
  const lecturas: Lectura[] = Object.entries(v.ofs).map(([of, o]) => ({
    of,
    votos: o.cuadros.length,
    digitos: o.digitos,
    cuadros: cuadrosDe(o.cuadros),
    orden: o.orden,
    destinos: o.destinos,
    abiertos: o.abiertos ?? {},
    destino: destinoDe(o.destinos),
    bultos: o.bultos ?? {},
    visto: o.visto,
    pesos: o.pesos,
    altos: o.altos,
    fuente: o,
  }));
  const armado = armarBloques(lecturas);
  // Spec 039: las OF del escaneo caen en un mismo rango; la que queda fuera por un «8» leído
  // «0» vuelve a él, o queda por confirmar (rango-nomina.ts).
  const sinRango = armado.bloques.map((b) => decidirGuardado(b, regla));
  const rango = rangoDelEscaneo(sinRango);
  const todos = sinRango.map((d) => alRango(d, rango));
  // Una mala lectura de un encargo que ya quedó firme no se lista: apunta al firme. Dos
  // firmes que parecen la misma fila quedan los dos, por confirmar.
  const parecidas = revisarParecidas(armado.bloques, todos);
  const { malas } = parecidas;
  const bloques = armado.bloques.filter((_, i) => !malas.has(i));
  const decididos = todos.filter((_, i) => !malas.has(i));
  const dobles = new Set([...parecidas.dobles].map((i) => todos[i]));
  const { ambiguas } = armado;
  // De qué encargo quedó cada número leído (también las malas lecturas), para ordenarlos
  // como van en la hoja.
  const lugar = new Map<number, number>();
  armado.bloques.forEach((_, i) => !malas.has(i) && lugar.set(i, lugar.size));
  const duenio = new Map<string, number>();
  armado.bloques.forEach((b, i) => {
    let k = i;
    for (let pasos = 0; malas.has(k) && pasos < 5; pasos++) k = malas.get(k)!;
    const j = lugar.get(k);
    if (j != null) for (const l of b.lecturas) duenio.set(l.of, j);
  });
  // Lo que falta confirmar (a medias o con el número sin firmar) y no volvió a salir en
  // VENCE_MS de cámara leyendo deja de estar: la lista, los conteos y la guía (spec 036).
  const vencidos = new Set<number>();
  if (vencer && v.reloj != null) {
    decididos.forEach((d, i) => {
      const visto = Math.max(...bloques[i].lecturas.map((l) => l.visto ?? -Infinity));
      const falta = d.cuadros < 2 || !d.destino || !d.firme;
      if (falta && visto > -Infinity && v.reloj! - visto > VENCE_MS) vencidos.add(i);
    });
  }
  const enLaHoja = ordenEnLaHoja(decididos.map((d) => d.orden), v.arriba ?? {}, duenio).filter((i) => !vencidos.has(i));
  const vistas = enLaHoja.map((i) => decididos[i]).filter((d) => d.cuadros >= 2);
  const deLectura: Record<string, string> = {};
  bloques.forEach((b, i) => {
    if (decididos[i].cuadros >= 2) for (const l of b.lecturas) deLectura[l.of] = decididos[i].of;
  });
  for (const [i, j] of malas) for (const l of armado.bloques[i].lecturas) deLectura[l.of] = todos[j].of;
  // El total vale leído igual dos veces, y sin empate con otro.
  const [total, otro] = Object.entries(v.totales).sort((a, b) => b[1] - a[1]);
  const totalFirme = total && total[1] >= LECTURAS_DEL_TOTAL && !(otro && otro[1] === total[1]) ? Number(total[0]) : null;
  // Las leídas (número firme, con dirección y sin doble): sus bultos son lo que se compara
  // con el total de la boleta. Sin la columna leída, una vale 1, como sin escanear.
  const leidas = vistas.filter((d) => d.firme && d.destino && !dobles.has(d));
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
  // Todo lo visto, en el orden de la hoja: lo que se vio en un solo cuadro o sin su
  // dirección ya no se pierde (spec 034).
  const lista = enLaHoja.map((i): LineaListada => {
      const d = decididos[i];
      const medida = { bultos: d.bultos, cuadros: d.cuadros, lecturas: d.lecturas, cerca: conCerca ? masCercano(i) : null };
      if (d.cuadros < 2) return { of: d.of, destino: d.destino, estado: "aMedias", motivo: "unaVez", ofFirme: false, ...medida };
      if (!d.destino) return { of: d.of, destino: null, estado: "aMedias", motivo: "sinDireccion", ofFirme: d.firme, ...medida };
      const firme = d.firme && d.destinoFirme && !dobles.has(d);
      return { of: d.of, destino: d.destino, estado: firme ? "firme" : "porConfirmar", ofFirme: d.firme, ...medida };
  });
  return {
    cuadros: v.cuadros,
    lista,
    lineas: vistas.map(({ of, destino, cuadros, firme, destinoFirme, lecturas: n, bultos }) => ({
      of,
      destino,
      cuadros,
      firme,
      destinoFirme,
      lecturas: n,
      bultos,
    })),
    // Sin dirección no está leída aunque el número esté firme: va «a medias» (spec 034).
    firmes: leidas.length,
    porConfirmar: vistas.filter((d) => (!d.firme || dobles.has(d)) && d.destino).length,
    unaVez: enLaHoja.length - vistas.length,
    ambiguas,
    ruido: armado.ruido,
    malLeidas: malas.size,
    dobles: dobles.size,
    vencidas: vencidos.size,
    conteo: v.conteo ?? { enteros: 0, sueltas: 0, abiertas: 0 },
    lecturasCorregidas: vistas.reduce((s, d) => s + d.corregidas, 0),
    total: totalFirme,
    bultos: {
      leidos: leidas.reduce((s, d) => s + (d.bultos ?? 1), 0),
      sinLeer: leidas.filter((d) => d.bultos == null).length,
    },
    numerosFirmes: Object.values(v.numeros).filter((n) => n >= VOTOS_PARA_FIRME).length,
    digitosLeidos: v.digitosLeidos,
    digitosDudosos: v.digitosDudosos,
    deLectura,
  };
}

/** Los votos de lo ya leído, sin lo que faltaba confirmar (dueño, 2026-11-15: «las OF falta
 *  confirmar perduran si salgo del barrido y vuelvo a entrar»). Al empezar otra pasada de
 *  la misma lectura quedan los encargos con el número firme y su dirección (siguen en
 *  verde, con sus malas lecturas apuntando a ellos); lo que estaba por confirmar o a medias
 *  parte de cero: si el encargo existe, se vuelve a leer; si era ruido, no vuelve. */
export function votosDeLoLeido(v: VotosNomina): VotosNomina {
  // Sin vencer: lo vencido también falta confirmar, y tiene que verse para botarlo.
  const r = resultadoNomina(v, { vencer: false });
  const pendientes = new Set(r.lista.filter((l) => l.estado === "aMedias" || !l.ofFirme).map((l) => l.of));
  const quedan = Object.entries(v.ofs)
    .filter(([of]) => r.deLectura[of] != null && !pendientes.has(r.deLectura[of]))
    .sort((a, b) => a[1].orden - b[1].orden);
  const sigue = new Set(quedan.map(([of]) => of));
  const entreLasQueSiguen = <T>(pares: Record<string, Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(pares)
        .filter(([a]) => sigue.has(a))
        .map(([a, abajo]) => [a, Object.fromEntries(Object.entries(abajo).filter(([b]) => sigue.has(b)))]),
    );
  const arriba = entreLasQueSiguen(v.arriba ?? {});
  // El orden se vuelve a numerar: una OF nueva toma el que sigue (sumarCuadroNomina).
  return {
    ...v,
    arriba,
    ...(v.vecinos ? { vecinos: entreLasQueSiguen(v.vecinos) } : {}),
    ofs: Object.fromEntries(quedan.map(([of, o], orden) => [of, { ...o, orden }])),
  };
}
