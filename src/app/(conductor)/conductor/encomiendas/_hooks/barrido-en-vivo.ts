// Lo que se ve del barrido de la nómina mientras la cámara lee (use-barrido-nomina.ts): la
// vista de React (estado, conteos, bultos y lo que falta confirmar) y los recuadros que
// dibuja Android sobre cada encargo (MarcasEscaner.java). Aparte del hook para no pasar de
// 400 líneas (A7; spec 036).

import type { VotosBarrido } from "@/lib/encomiendas/lectura/barrido-a-guia";
import { votosNominaVacios, type CajaEncargo, type VotosNomina } from "@/lib/encomiendas/lectura/barrido-nomina";
import { medidaReglasVacia, type MedidaReglas } from "@/lib/encomiendas/lectura/reglas-nomina";
import { flechasDelCuadro, hojaDelBarrido, type Hoja } from "@/lib/encomiendas/lectura/rumbo-nomina";
import { elegirVotosDelBarrido, resultadoDelBarrido } from "@/lib/encomiendas/lectura/votos-barrido";
import { formatoOf } from "@/lib/encomiendas/paquete";
import type { CuadroVivo, FlechaViva, MarcaViva, ZonaViva } from "@/lib/nativo/escaner-vivo";
import type { EstadoBarrido, VistaBarrido } from "../_componentes/camara-barrido";

/** Cuadros sin texto (o sin ninguna OF) para avisar que no está leyendo: ~1 s. */
const CUADROS_SIN_LEER = 12;

/** Lo leído en un barrido. */
export type Barrido = VotosBarrido & {
  inicio: number;
  msTotal: number;
  conTexto: number;
  /** Cuadros de esta pasada (los votos pueden venir de una anterior). */
  cuadros: number;
  /** Los cuadros por segundo fijos que puso la cámara (0: exposición automática). */
  cuadrosFijos: number;
  /** Solo en Diagnóstico: los mismos cuadros contando también las piezas (las OF que
   *  entran al cuadro sin su dirección; apagadas, spec 034), para seguir midiéndolas. */
  conPiezas: VotosNomina | null;
  /** El cuadro con más renglones, por filas: la muestra de «Copiar anonimizado». */
  muestra: { texto: string; renglones: number };
  /** Para Diagnóstico (spec 036): lo que tarda la web con cada cuadro y en cada decisión,
   *  en ms. */
  tiempos: { cuadro: number[]; decidir: number[] };
  /** Para Diagnóstico (spec 036, desde la APK de la 036): lo que tarda ML Kit y armar cada
   *  cuadro, el estado térmico y la memoria nativa más altos, cuántos cuadros llegaron
   *  desordenados y cuántos se leen a la vez. */
  nativo: { lector: number[]; armar: number[]; termicoMax: number; memoriaMaxMB: number; desordenados: number; enVuelo: number };
  /** Solo en Diagnóstico: lo que decide cada regla que se compara (reglas-nomina.ts). */
  reglas: MedidaReglas | null;
};

/** Un barrido que empieza: con los votos de una pasada anterior, si los hay. */
export const barridoNuevo = (votos: VotosBarrido | null = null, comparar = false): Barrido => ({
  inicio: Date.now(),
  msTotal: 0,
  conTexto: 0,
  cuadros: 0,
  cuadrosFijos: 0,
  porFilas: votos?.porFilas ?? votosNominaVacios(),
  comoLlegan: votos?.comoLlegan ?? votosNominaVacios(),
  conPiezas: comparar ? votosNominaVacios() : null,
  muestra: { texto: "", renglones: 0 },
  tiempos: { cuadro: [], decidir: [] },
  nativo: { lector: [], armar: [], termicoMax: -1, memoriaMaxMB: 0, desordenados: 0, enVuelo: 1 },
  reglas: comparar ? medidaReglasVacia() : null,
});

export const votosDe = (b: Barrido): VotosBarrido => ({ porFilas: b.porFilas, comoLlegan: b.comoLlegan });

/** Lo que manda la APK de la spec 036 sobre cada cuadro, para Diagnóstico. `ultimoN`: el
 *  número del último cuadro que marcó (uno menor llegó desordenado). */
export function anotarNativo(b: Barrido, c: CuadroVivo, ultimoN: number): void {
  if (c.msLector != null) anotarTiempo(b.nativo.lector, c.msLector);
  if (c.msArmar != null) anotarTiempo(b.nativo.armar, c.msArmar);
  if (c.termico != null) b.nativo.termicoMax = Math.max(b.nativo.termicoMax, c.termico);
  if (c.nativoMB != null) b.nativo.memoriaMaxMB = Math.max(b.nativo.memoriaMaxMB, c.nativoMB);
  if (c.n != null && c.n < ultimoN) b.nativo.desordenados += 1;
}

/** Lo que necesitan los recuadros y las flechas de cada cuadro; se actualiza con cada
 *  decisión. `hoja`: dónde va cada OF en la nómina (rumbo-nomina.ts, spec 036). */
export type Marcado = Pick<VistaBarrido, "deLectura" | "confirmadas"> & { aMedias: Set<string>; hoja: Hoja | null };

export const marcadoVacio = (): Marcado => ({ confirmadas: new Set(), aMedias: new Set(), deLectura: {}, hoja: null });

/** Lo leído hasta ahora → la vista y lo que marcan los recuadros y las flechas. `cuadros`:
 *  los de esta pasada (los votos pueden venir de una anterior). `huecos` y `fantasmas`:
 *  los interruptores de Diagnóstico (apagados hasta medirlos, spec 036). */
export function leerBarrido(
  b: VotosBarrido & { cuadros: number },
  { huecos = false, fantasmas = false }: { huecos?: boolean; fantasmas?: boolean } = {},
): { vista: VistaBarrido; marcado: Marcado } {
  const r = resultadoDelBarrido(b, { fantasmas });
  const ultimo = b.porFilas.cuadros - 1;
  const conLineas = Math.max(b.porFilas.ultimoConLineas, b.comoLlegan.ultimoConLineas);
  const estado: EstadoBarrido =
    b.cuadros === 0 || ultimo - b.porFilas.ultimoConTexto > CUADROS_SIN_LEER
      ? "sinTexto"
      : ultimo - conLineas > CUADROS_SIN_LEER
        ? "sinBloques"
        : "leyendo";
  // Leída = número firme y con dirección. Se barre de arriba abajo: la última
  // confirmada es la más abajo en la nómina.
  const leidas = r.lineas.filter((l) => l.firme && l.destino);
  const ultima = leidas.at(-1) ?? null;
  const enMedias = r.lista.filter((l) => l.estado === "aMedias").map((l) => l.of);
  const vista: VistaBarrido = {
    estado,
    firmes: r.firmes,
    porConfirmar: r.porConfirmar,
    total: r.total,
    bultos: r.bultos.leidos,
    ultima: ultima ? { of: ultima.of, destino: ultima.destino } : null,
    confirmadas: new Set(leidas.map((l) => l.of)),
    deLectura: r.deLectura,
    // Lo que hay que volver a pasar: el número sin firmar o el encargo a medias. Una
    // dirección dudosa con el número firme no: se confirma en la revisión, con el papel.
    faltan: r.lista.filter((l) => l.estado === "aMedias" || !l.ofFirme).map((l) => l.of),
    aMedias: enMedias.length,
  };
  const hoja = hojaDelBarrido(r, elegirVotosDelBarrido(b), { huecos });
  return { vista, marcado: { confirmadas: vista.confirmadas, aMedias: new Set(enMedias), deLectura: r.deLectura, hoja } };
}

/** ¿La fila de la OF de esta caja se ve dentro de la zona libre del recuadro? Con dónde cae
 *  el cuadro en la pantalla (lo dice Android al marcar) y la zona (la mide la pantalla).
 *  Sin alguna de las dos, todas cuentan: es lo de antes. */
export function dentroDeLaZona(c: Pick<CuadroVivo, "ancho" | "alto">, pantalla: ZonaViva | null, zona: ZonaViva | null) {
  return (caja: CajaEncargo): boolean => {
    if (!pantalla || !zona || c.ancho <= 0 || c.alto <= 0) return true;
    const x = pantalla.x + ((caja.x + caja.ancho / 2) / c.ancho) * pantalla.ancho;
    const y = pantalla.y + ((caja.y + caja.altoFila / 2) / c.alto) * pantalla.alto;
    return x >= zona.x && x <= zona.x + zona.ancho && y >= zona.y && y <= zona.y + zona.alto;
  };
}

/** Los recuadros de un cuadro: uno por encargo, con su OF escrita arriba (dueño,
 *  2026-11-11: «si me marcas con rectángulos pequeños no entiendo qué estoy leyendo»).
 *  Verde con ✓ **mientras la OF esté confirmada** (dueño, 2026-11-14, spec 034: se saltó
 *  una OF y tuvo que recorrer la nómina de nuevo; lo que no está verde es lo que falta).
 *  Punteado con «…» si se está leyendo, y con ⚠ si quedó a medias (sin dirección o vista
 *  una vez): nunca depende solo del color. Un cuadro que leyó mal un dígito de una OF
 *  confirmada la marca igual (`deLectura`). `cajas`: las de `cajasDelCuadro`. */
export function marcasDe(cajas: CajaEncargo[], marcado: Marcado): MarcaViva[] {
  return cajas.map((e): MarcaViva => {
    const of = marcado.deLectura[e.of] ?? e.of;
    const caja = { x: e.x, y: e.y, ancho: e.ancho, alto: e.alto };
    if (marcado.confirmadas.has(of)) return { ...caja, tipo: "confirmada", etiqueta: `✓ ${formatoOf(of)}` };
    const marca = marcado.aMedias.has(of) ? "⚠" : "…";
    return { ...caja, tipo: "leyendo", etiqueta: `${marca} ${formatoOf(of)}` };
  });
}

/** ¿Hay que redibujar? Las confirmadas no se comparan: crecen solo cuando crece `firmes`. */
export const igual = (a: VistaBarrido | null, b: VistaBarrido) =>
  a != null &&
  a.estado === b.estado &&
  a.firmes === b.firmes &&
  a.porConfirmar === b.porConfirmar &&
  a.aMedias === b.aMedias &&
  a.faltan.join() === b.faltan.join() &&
  a.total === b.total &&
  a.bultos === b.bultos &&
  a.ultima?.of === b.ultima?.of &&
  a.ultima?.destino === b.ultima?.destino;

/** Una pendiente que recién salió de la vista espera estos cuadros antes de llevar flecha
 *  (se acaba de pasar por ella: no es que se haya saltado), y sin nada conocido a la vista
 *  (entre dos encargos) la última flecha sigue estos cuadros. */
const ESPERA_CUADROS = 6;
const SIGUE_CUADROS = 4;

/** Lo que recuerdan las flechas de un cuadro al siguiente. */
export type MemoriaFlechas = { vistaEn: Map<string, number>; ultimas: { flechas: FlechaViva[]; cuadro: number } };

export const memoriaFlechasVacia = (): MemoriaFlechas => ({ vistaEn: new Map(), ultimas: { flechas: [], cuadro: -Infinity } });

/** Las flechas y los huecos a la vista de un cuadro (spec 036; rumbo-nomina.ts). `cuadro`:
 *  el número de cuadro de esta pasada; `dentro`: si una caja se ve en el recuadro. */
export function flechasEnVivo(
  cajas: CajaEncargo[],
  marcado: Marcado,
  cuadro: number,
  dentro: (c: CajaEncargo) => boolean,
  memoria: MemoriaFlechas,
): { flechas: FlechaViva[]; huecos: MarcaViva[] } {
  if (!marcado.hoja) return { flechas: [], huecos: [] };
  const esperar = (of: string) => cuadro - (memoria.vistaEn.get(of) ?? -Infinity) < ESPERA_CUADROS;
  const r = flechasDelCuadro(cajas, marcado.hoja, marcado.deLectura, { dentro, esperar });
  for (const of of r.visibles) memoria.vistaEn.set(of, cuadro);
  const huecos = r.cajasHueco.map((h): MarcaViva => ({ ...h, tipo: "hueco", etiqueta: "?" }));
  if (r.visibles.length > 0) {
    memoria.ultimas = { flechas: r.flechas, cuadro };
    return { flechas: r.flechas, huecos };
  }
  return { flechas: cuadro - memoria.ultimas.cuadro <= SIGUE_CUADROS ? memoria.ultimas.flechas : [], huecos };
}

/** La hora y un cronómetro, fuera del componente: corren en el callback de cada cuadro de
 *  la cámara y en las decisiones, nunca al dibujar. */
export const horaMs = (): number => Date.now();

export function cronometro(): () => number {
  const inicio = performance.now();
  return () => performance.now() - inicio;
}

/** Guarda una medida de tiempo para Diagnóstico, sin crecer sin fin. */
export function anotarTiempo(lista: number[], ms: number): void {
  lista.push(ms);
  if (lista.length > 2000) lista.splice(0, lista.length - 2000);
}
