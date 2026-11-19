// Dónde volver al barrer la nómina (spec 036; dueño, 2026-11-16: «si me salté una OF que
// tengo que confirmar, que marque con un ícono hacia dónde se encuentra, en la cámara en
// vivo y no como texto»). Puro.
//
//   · Cada encargo tiene su lugar en la hoja: `ResultadoNomina.lista` ya va en ese orden.
//     Los encargos del cuadro dicen dónde está la cámara; lo que falta confirmar, o un
//     hueco, más arriba o más abajo de eso lleva una flecha ▲ o ▼ (la dibuja Android).
//   · Un hueco es un encargo que la cámara se saltó entero. Se ve en la separación entre
//     las filas de OF de un mismo cuadro: dos encargos seguidos de la hoja a casi dos
//     alturas de encargo (cabía otro), o una fila de OF justo debajo de uno que nunca se
//     volvió encargo. Con el celular tan cerca que entra un encargo por cuadro no hay pares,
//     y no sale ningún hueco. Va apagado (Diagnóstico → «Flechas a huecos») hasta medirlo.
//   · Un fantasma es una OF por confirmar que salió solo en el lugar de otra ya firme (justo
//     debajo de la misma, y nunca junto a ella): era una mala lectura suya. Es
//     `revisarParecidas` por lugar en vez de por dígitos. Apagado también («Botar fantasmas»).

import { formatoOf } from "../paquete";
import { aLoMas, DIGITOS_DE_ERROR } from "./bloques-nomina";
import type { CajaEncargo } from "./cajas-nomina";
import type { LineaListada, ResultadoNomina, VotosNomina } from "./tipos-nomina";

/** Cuántas separaciones se guardan por par de filas de OF (las últimas). */
const SEPARACIONES_POR_PAR = 8;
/** Con menos pares de encargos seguidos no se sabe cuánto mide uno: no hay huecos. */
const SEPARACIONES_MINIMAS = 5;
/** En encargos típicos: hasta aquí, seguidos y sin nada entre medio; desde aquí, cabía otro. */
const SEGUIDOS = 1.4;
const CABIA_OTRO = 1.6;
/** Una fila de OF suelta a esta separación de un encargo es la del que le sigue. */
const JUSTO_DEBAJO = { desde: 0.6, hasta: 1.4 };
/** Cuántas veces tiene que verse un hueco (o un fantasma en su lugar) para valer. */
const VECES = 2;

/** Anota, en un cuadro, qué fila de OF salió justo debajo de cuál y a cuántos altos de fila:
 *  los encargos enteros y las piezas juntos, de arriba abajo. */
export function sumarVecinos(v: VotosNomina, cajas: CajaEncargo[]): VotosNomina {
  const filas = [...cajas].sort((a, b) => a.y - b.y);
  if (filas.length < 2) return v;
  const vecinos = { ...v.vecinos };
  for (let i = 0; i + 1 < filas.length; i++) {
    const [a, b] = [filas[i], filas[i + 1]];
    if (a.of === b.of) continue;
    const alto = Math.max(1, (a.altoFila + b.altoFila) / 2);
    const separacion = Math.round(((b.y - a.y) / alto) * 10) / 10;
    const deA = { ...vecinos[a.of] };
    deA[b.of] = [...(deA[b.of] ?? []), separacion].slice(-SEPARACIONES_POR_PAR);
    vecinos[a.of] = deA;
  }
  return { ...v, vecinos };
}

/** Un encargo que la cámara se saltó: va entre el de lugar `despuesDe` y el que le sigue. */
type HuecoHoja = { despuesDe: number; motivo: "separados" | "filaSola" };

export type Hoja = {
  /** OF de la lista → su lugar en la lista. */
  lugar: Map<string, number>;
  ofs: string[];
  /** OF → dónde está en la hoja, para las flechas: una firme, su lugar en la lista; una que
   *  falta confirmar, justo después de la firme más baja que salió encima de ella en un
   *  cuadro (o justo antes de la más alta que salió debajo). Su lugar en la lista puede ser
   *  adivinado: la que se vio con encargos solo de un lado queda al final. */
  posicion: Map<string, number>;
  /** Lo que falta confirmar y tiene lugar en la hoja: se vio junto a una firme. Una vista
   *  sola sigue en la lista, sin flecha. */
  pendientes: { of: string; i: number }[];
  huecos: HuecoHoja[];
  /** Para Diagnóstico: encargos seguidos que nunca se vieron uno debajo del otro. */
  posibles: number;
  /** El alto típico de un encargo, en altos de fila (null: muy pocos pares para saberlo). */
  alto: number | null;
};

const faltaConfirmar = (l: LineaListada) => l.estado === "aMedias" || !l.ofFirme;

/** De qué OF de la lista es una lectura: la que dice `deLectura` (las lecturas de encargos
 *  enteros) o la misma OF. Una pieza mal leída no se ubica por parecido: con las OF de una
 *  misma serie, a 1 o 2 dígitos unas de otras, caía en otra OF (barridos inventados de 100
 *  OF: fantasmas que apuntaban a un encargo a seis de distancia). */
function ofExacta(lectura: string, deLectura: Record<string, string>, lugar: Map<string, number>): string | null {
  const dicha = deLectura[lectura];
  if (dicha != null && lugar.has(dicha)) return dicha;
  return lugar.has(lectura) ? lectura : null;
}

/** ¿Es una fila que nunca se volvió encargo? Ni es una OF de la lista ni se parece a
 *  ninguna (a DIGITOS_DE_ERROR o menos): no es una mala lectura de algo ya leído. */
function filaDeNadie(lectura: string, deLectura: Record<string, string>, lugar: Map<string, number>, ofs: string[]): boolean {
  return ofExacta(lectura, deLectura, lugar) == null && !ofs.some((of) => aLoMas(of, lectura, DIGITOS_DE_ERROR));
}

/** El valor del medio. */
function mediana(xs: number[]): number {
  const orden = [...xs].sort((a, b) => a - b);
  return orden[Math.floor(orden.length / 2)];
}

/** La hoja según lo decidido: el lugar de cada OF, lo que falta confirmar con lugar y, con
 *  `huecos`, los encargos que la cámara se saltó. Va con cada decisión. */
export function hojaDelBarrido(r: ResultadoNomina, v: VotosNomina, { huecos: conHuecos = false }: { huecos?: boolean } = {}): Hoja {
  const ofs = r.lista.map((l) => l.of);
  const lugar = new Map(ofs.map((of, i) => [of, i]));
  const de = (lectura: string) => ofExacta(lectura, r.deLectura, lugar);
  // Lo que falta confirmar se ubica por las firmes que salieron con ella en un cuadro.
  const falta = new Set(r.lista.filter(faltaConfirmar).map((l) => l.of));
  const encima = new Map<string, number[]>();
  const debajo = new Map<string, number[]>();
  for (const [a, abajo] of Object.entries(v.arriba ?? {})) {
    for (const b of Object.keys(abajo)) {
      const [oa, ob] = [de(a), de(b)];
      if (!oa || !ob || oa === ob) continue;
      if (falta.has(ob) && !falta.has(oa)) encima.set(ob, [...(encima.get(ob) ?? []), lugar.get(oa)!]);
      if (falta.has(oa) && !falta.has(ob)) debajo.set(oa, [...(debajo.get(oa) ?? []), lugar.get(ob)!]);
    }
  }
  const posicion = new Map<string, number>();
  const pendientes: Hoja["pendientes"] = [];
  r.lista.forEach((l, i) => {
    if (!falta.has(l.of)) return void posicion.set(l.of, i);
    const sobre = encima.get(l.of);
    const bajo = debajo.get(l.of);
    const donde = sobre ? Math.max(...sobre) + 0.5 : bajo ? Math.min(...bajo) - 0.5 : null;
    if (donde == null) return;
    posicion.set(l.of, donde);
    pendientes.push({ of: l.of, i: donde });
  });
  const sinHuecos: Hoja = { lugar, ofs, posicion, pendientes, huecos: [], posibles: 0, alto: null };
  if (!conHuecos) return sinHuecos;

  // Las separaciones entre encargos: de una OF de la lista a la siguiente (o a una fila que
  // no es de ninguna).
  const entre = new Map<string, number[]>();
  const aSolas = new Map<number, number[]>();
  for (const [a, abajo] of Object.entries(v.vecinos ?? {})) {
    const oa = de(a);
    if (oa == null) continue;
    const i = lugar.get(oa)!;
    for (const [b, separaciones] of Object.entries(abajo)) {
      const ob = de(b);
      if (ob === oa) continue;
      if (ob != null) {
        if (lugar.get(ob)! === i + 1) entre.set(oa, [...(entre.get(oa) ?? []), ...separaciones]);
      } else if (filaDeNadie(b, r.deLectura, lugar, ofs)) aSolas.set(i, [...(aSolas.get(i) ?? []), ...separaciones]);
    }
  }
  const todas = [...entre.values()].flat();
  if (todas.length < SEPARACIONES_MINIMAS) return sinHuecos;
  const alto = mediana(todas);
  const huecos: HuecoHoja[] = [];
  let posibles = 0;
  ofs.forEach((of, i) => {
    const seps = entre.get(of) ?? [];
    const seguidos = seps.some((s) => s <= SEGUIDOS * alto);
    if (seguidos) return;
    if (seps.filter((s) => s >= CABIA_OTRO * alto).length >= VECES) huecos.push({ despuesDe: i, motivo: "separados" });
    else if ((aSolas.get(i) ?? []).filter((s) => s >= JUSTO_DEBAJO.desde * alto && s <= JUSTO_DEBAJO.hasta * alto).length >= VECES) {
      huecos.push({ despuesDe: i, motivo: "filaSola" });
    } else if (i + 1 < ofs.length && seps.length === 0) posibles += 1;
  });
  return { ...sinHuecos, huecos, posibles, alto };
}

type FlechaHoja = { sentido: "arriba" | "abajo"; tipo: "falta" | "hueco"; etiqueta: string };
type CajaHueco = { x: number; y: number; ancho: number; alto: number };

/** Las flechas de un cuadro: la pendiente o el hueco más cercano hacia arriba de lo que se ve
 *  (▲) y hacia abajo (▼), a lo más una por sentido, con cuántos encargos hay hasta ahí. Un
 *  hueco a la vista se marca entre sus dos encargos (`cajasHueco`). `dentro`: si la caja se
 *  ve en el recuadro (sin saberlo, todas); `esperar`: una pendiente que recién salió de la
 *  vista todavía no lleva flecha. `visibles`: las OF que se ven, para eso. */
export function flechasDelCuadro(
  cajas: CajaEncargo[],
  hoja: Hoja,
  deLectura: Record<string, string>,
  { dentro = () => true, esperar = () => false }: { dentro?: (c: CajaEncargo) => boolean; esperar?: (of: string) => boolean } = {},
): { flechas: FlechaHoja[]; visibles: string[]; cajasHueco: CajaHueco[] } {
  const ubicadas = cajas.flatMap((c) => {
    const of = ofExacta(c.of, deLectura, hoja.lugar);
    const i = of != null ? hoja.posicion.get(of) : undefined;
    return of != null && i != null ? [{ caja: c, of, i }] : [];
  });
  const vistas = ubicadas.filter((u) => dentro(u.caja));
  if (vistas.length === 0) return { flechas: [], visibles: [], cajasHueco: [] };
  const lugares = vistas.map((u) => u.i);
  const [primero, ultimo] = [Math.min(...lugares), Math.max(...lugares)];
  type Candidata = { tipo: FlechaHoja["tipo"]; distancia: number; texto: string };
  const arriba: Candidata[] = [];
  const abajo: Candidata[] = [];
  // Cuántos encargos hay que subir o bajar: una que falta va a medio camino entre dos.
  const hasta = (desde: number, a: number) => Math.ceil(Math.abs(desde - a));
  for (const p of hoja.pendientes) {
    if (esperar(p.of)) continue;
    if (p.i < primero) arriba.push({ tipo: "falta", distancia: hasta(primero, p.i), texto: formatoOf(p.of) });
    else if (p.i > ultimo) abajo.push({ tipo: "falta", distancia: hasta(p.i, ultimo), texto: formatoOf(p.of) });
  }
  const cajasHueco: CajaHueco[] = [];
  for (const h of hoja.huecos) {
    // El hueco va entre el encargo `despuesDe` y el siguiente.
    const donde = h.despuesDe + 0.5;
    if (donde < primero) arriba.push({ tipo: "hueco", distancia: hasta(primero, donde), texto: "?" });
    else if (donde > ultimo) abajo.push({ tipo: "hueco", distancia: hasta(donde, ultimo), texto: "?" });
    else {
      // A la vista: el recuadro va entre la caja del encargo de arriba y la del de abajo.
      const a = ubicadas.find((u) => u.i === h.despuesDe)?.caja;
      const b = ubicadas.find((u) => u.i === h.despuesDe + 1)?.caja;
      if (a && b && b.y > a.y + a.alto) {
        const x = Math.min(a.x, b.x);
        cajasHueco.push({ x, y: a.y + a.alto, ancho: Math.max(a.x + a.ancho, b.x + b.ancho) - x, alto: b.y - (a.y + a.alto) });
      }
    }
  }
  const masCerca = (lista: Candidata[]) =>
    lista.sort((x, y) => x.distancia - y.distancia || (x.tipo === "falta" ? -1 : 1) - (y.tipo === "falta" ? -1 : 1))[0];
  const flechas: FlechaHoja[] = [];
  for (const [sentido, lista] of [["arriba", arriba], ["abajo", abajo]] as const) {
    const c = masCerca(lista);
    if (c) flechas.push({ sentido, tipo: c.tipo, etiqueta: `${c.texto} · ${c.distancia}` });
  }
  return { flechas, visibles: vistas.map((u) => u.of), cajasHueco };
}

/** Lo decidido sin los fantasmas: una OF por confirmar que salió justo debajo de A (o justo
 *  encima de B) en cuadros sin la otra, cuando después A y B salieron seguidas, a un alto de
 *  encargo, VECES o más, con las dos firmes. Era una mala lectura de la que ocupa ese
 *  lugar: sus lecturas pasan a ella (`deLectura`) y deja la lista. `fantasmas`: cuántas. */
export function sinFantasmas(r: ResultadoNomina, v: VotosNomina): { resultado: ResultadoNomina; fantasmas: number } {
  const hoja = hojaDelBarrido(r, v, { huecos: true });
  const nada = { resultado: r, fantasmas: 0 };
  if (hoja.alto == null) return nada;
  const alto = hoja.alto;
  const firmes = new Set(r.lista.filter((l) => l.estado === "firme").map((l) => l.of));
  const cuadros = new Map(r.lista.map((l) => [l.of, l.cuadros]));
  const de = (lectura: string) => ofExacta(lectura, r.deLectura, hoja.lugar);
  // Quién salió justo debajo de quién, con sus separaciones. Lo que dice que una firme va
  // justo debajo (o encima) de otra sale solo de lecturas que son esas OF tal cual: una
  // lectura de otro encargo que se juntó con una de ellas (OF a 1 o 2 dígitos, la misma
  // calle) ponía a la firme en un lugar que no es el suyo y botaba un encargo de verdad.
  // `debajo`: las dos firmes exactas; `bajoExacta`: la de arriba exacta y la de abajo
  // cualquier lectura suya; `sobreExacta`: al revés.
  type Pares = Map<string, Map<string, number[]>>;
  const [debajo, bajoExacta, sobreExacta]: Pares[] = [new Map(), new Map(), new Map()];
  const anotar = (pares: Pares, a: string, b: string, seps: number[]) => {
    const deA = pares.get(a) ?? new Map<string, number[]>();
    deA.set(b, [...(deA.get(b) ?? []), ...seps]);
    pares.set(a, deA);
  };
  for (const [a, abajo] of Object.entries(v.vecinos ?? {})) {
    const oa = de(a);
    if (!oa) continue;
    for (const [b, seps] of Object.entries(abajo)) {
      const ob = de(b);
      if (!ob || ob === oa) continue;
      if (a === oa && b === ob) anotar(debajo, oa, ob, seps);
      if (a === oa) anotar(bajoExacta, oa, ob, seps);
      if (b === ob) anotar(sobreExacta, oa, ob, seps);
    }
  }
  const juntas = new Set<string>();
  for (const [a, abajo] of Object.entries(v.arriba ?? {})) {
    for (const b of Object.keys(abajo)) {
      const [oa, ob] = [de(a), de(b)];
      if (oa && ob) juntas.add(`${oa}|${ob}`).add(`${ob}|${oa}`);
    }
  }
  const justoDebajo = (a: string, b: string, pares: Pares = debajo) =>
    (pares.get(a)?.get(b) ?? []).filter((s) => s >= JUSTO_DEBAJO.desde * alto && s <= JUSTO_DEBAJO.hasta * alto).length;
  // La que ocupa el lugar tiene que estar firme, haber salido ahí VECES o más, nunca junto
  // al fantasma, y más veces que él: un encargo de verdad que no termina de firmar (la OF con
  // dos «8») sale muchas veces y no se bota por esto.
  const ocupa = (de: string, g: string) => firmes.has(de) && !juntas.has(`${g}|${de}`) && (cuadros.get(de) ?? 0) > (cuadros.get(g) ?? 0);
  const fantasmas = new Map<string, string>();
  for (const l of r.lista.filter(faltaConfirmar)) {
    const g = l.of;
    // g salió justo debajo de una firme A, en el lugar de la firme B que sale justo debajo de A.
    for (const [a, deA] of debajo) {
      if (fantasmas.has(g) || a === g || !firmes.has(a) || justoDebajo(a, g, bajoExacta) === 0) continue;
      const b = [...deA.keys()].find((b) => b !== g && justoDebajo(a, b) >= VECES && ocupa(b, g));
      if (b) fantasmas.set(g, b);
    }
    if (fantasmas.has(g)) continue;
    // O justo encima de una firme B, en el lugar de la firme A que sale justo encima de B.
    for (const b of sobreExacta.get(g)?.keys() ?? []) {
      if (!firmes.has(b) || justoDebajo(g, b, sobreExacta) === 0) continue;
      const a = [...debajo.keys()].find((a) => a !== g && justoDebajo(a, b) >= VECES && ocupa(a, g));
      if (a) {
        fantasmas.set(g, a);
        break;
      }
    }
  }
  if (fantasmas.size === 0) return nada;
  const deLectura = { ...r.deLectura };
  for (const [lectura, of] of Object.entries(r.deLectura)) if (fantasmas.has(of)) deLectura[lectura] = fantasmas.get(of)!;
  for (const [g, b] of fantasmas) deLectura[g] = b;
  const lista = r.lista.filter((l) => !fantasmas.has(l.of));
  const quitadas = r.lista.filter((l) => fantasmas.has(l.of));
  return {
    resultado: {
      ...r,
      lista,
      lineas: r.lineas.filter((l) => !fantasmas.has(l.of)),
      porConfirmar: r.porConfirmar - quitadas.filter((l) => l.estado === "porConfirmar").length,
      unaVez: r.unaVez - quitadas.filter((l) => l.motivo === "unaVez").length,
      deLectura,
    },
    fantasmas: fantasmas.size,
  };
}
