// Un extractor por campo de la etiqueta (spec 021). Puro.
//
// Regla de todos: un valor NUNCA cruza un salto de renglón por accidente. El
// lector de antes buscaba el teléfono con `\s`, que también es el salto, y a un
// «Tel: 9…» le pegaba el 0 de «0.33 Kg» del renglón de abajo (terreno
// 2026-11-07). Solo se mira el renglón siguiente cuando la palabra clave quedó
// sola (ML Kit las separa en bloques) o cuando el valor viene partido con guion.

import { normalizarTelefono } from "@/lib/comun/telefono";
import { ofValida } from "../../paquete";
import { CLAVES, CODIGO_IMPRESO, DIRECCION_AL_INICIO, OTRAS } from "./formatos";
import { comparable as comparableDe, palabra, type Renglon } from "./normalizar";
import type { Zona } from "./zonas";

/** ¿Es un renglón de la etiqueta y no la continuación de un valor? */
function esClave(r: Renglon): boolean {
  return OTRAS.test(r.comparable) || Object.values(CLAVES).some((c) => c.test(r.comparable));
}

/** Lo que sigue a la palabra clave en su renglón, sin el «:» ni los espacios. */
function despues(r: Renglon, clave: RegExp): string | null {
  const m = clave.exec(r.comparable);
  return m ? r.texto.slice(m.index + m[0].length).replace(/^[\s:.\-]+/, "") : null;
}

/** «CAMI-» + «LA ROJAS» → «CAMILA ROJAS»: termina en letra y guion. */
const PARTIDO = /\p{L}-$/u;

type Seguir = (r: Renglon, partido: boolean) => boolean;
/** Junta el valor partido con guion («CAMI-») con lo que sigue abajo. */
type Unir = (antes: string, despues: string) => string;

const juntar: Unir = (antes, despues) => antes.slice(0, -1) + despues;

/** Un valor que empieza en el renglón j y puede seguir hasta dos renglones más. */
function conLoQueSigue(lista: Renglon[], j: number, valor: string, seguir: Seguir, unir: Unir = juntar): string | null {
  for (let extra = 0; extra < 2 && lista[j + 1] && !esClave(lista[j + 1]); extra++) {
    const partido = PARTIDO.test(valor);
    if (!seguir(lista[j + 1], partido)) break;
    valor = partido ? unir(valor, lista[++j].texto) : `${valor} ${lista[++j].texto}`;
  }
  const limpio = valor.replace(/\s+/g, " ").replace(/^[\s:.-]+|[\s.,;:-]+$/g, "").trim();
  return limpio || null;
}

/** El valor de una palabra clave: en su renglón o, si quedó sola, en el de abajo. */
function valorDe(lista: Renglon[], i: number, clave: RegExp, seguir: Seguir, unir?: Unir): string | null {
  let valor = despues(lista[i], clave) ?? "";
  let j = i;
  if (!valor && lista[i + 1] && !esClave(lista[i + 1])) valor = lista[++j].texto;
  return conLoQueSigue(lista, j, valor, seguir, unir);
}

/** La Lion parte el nombre en el borde con guion, también entre dos palabras
 *  («JUANA-» / «PEREZ -»; así salía en las fotos del dueño, 2026-11-25). Dos pedazos
 *  que ya son palabras (≥ 4 y ≥ 5 letras) van con espacio; uno corto es media palabra
 *  y se junta («MA-» + «RIA», «JUA-» + «NA»). Es solo dónde va el espacio: las
 *  letras no se tocan. */
const unirNombre: Unir = (antes, despues) => {
  const ultima = /(\p{L}+)-$/u.exec(antes)?.[1] ?? "";
  const primera = /^\p{L}+/u.exec(despues)?.[0] ?? "";
  return ultima.length >= 4 && primera.length >= 5 ? `${antes.slice(0, -1)} ${despues}` : juntar(antes, despues);
};

const RUT_CLAVE = palabra("R.U.T", "RUT");
/** Un celular o un «(+56)» pegado al nombre (la «REFERENCIA»: «JUAN PEREZ . . (+56) 9…»). */
const TELEFONO_PEGADO = /\(\s*\+?\s*56\s*\)|\+\s?56(?!\d)|(?<!\d)\+?56\s?9[\s.]?\d{4}|(?<!\d)9[\s.]?\d{4}[\s.]?\d{4}(?!\d)|(?<!\d)\d{8,}(?!\d)/;

/** El nombre sin lo que viene a su lado en el mismo renglón: «Tel.», el RUT o un celular. */
function sinLoDeAlLado(nombre: string): string {
  const c = comparableDe(nombre);
  const cortes = [CLAVES.telefono.exec(c)?.index, RUT_CLAVE.exec(c)?.index, TELEFONO_PEGADO.exec(nombre)?.index].filter(
    (k): k is number => k != null && k > 0,
  );
  return cortes.length ? nombre.slice(0, Math.min(...cortes)).replace(/[\s.,;:()-]+$/, "") : nombre;
}

/** El nombre sigue abajo solo si venía partido con guion. */
export function destinatario(lista: Renglon[], zonasDe: Zona[]): string | null {
  const i = lista.findIndex((r, k) => zonasDe[k] === "destinatario" && CLAVES.destinatario.test(r.comparable));
  const nombre = i < 0 ? null : valorDe(lista, i, CLAVES.destinatario, (_, partido) => partido, unirNombre);
  return nombre ? sinLoDeAlLado(nombre) || null : null;
}

/** La dirección, solo si se lee clara: «DIRECCIÓN: …» al comienzo del renglón y
 *  con su valor ahí mismo (puede seguir hasta dos renglones: la Lion la parte en
 *  tres). Si «DIRECCIÓN» quedó sola, ML Kit dejó su valor en otra parte (la
 *  Starken normal, terreno 2026-11-08) y no se adivina: sin leer, y no se compara
 *  con la guía, así no hay falsas alarmas (el dueño: los datos bien antes que
 *  rápido). Solo sirve para compararla: nunca cambia la dirección sola. */
export function direccion(lista: Renglon[], zonasDe: Zona[]): string | null {
  const candidatas = lista.map((r, k) => k).filter((k) => zonasDe[k] !== "remitente" && DIRECCION_AL_INICIO.test(lista[k].comparable));
  const i = candidatas.find((k) => zonasDe[k] === "destinatario") ?? candidatas[0];
  const enSuRenglon = i === undefined ? null : despues(lista[i], DIRECCION_AL_INICIO);
  if (i === undefined || !enSuRenglon) return null;
  return conLoQueSigue(lista, i, enSuRenglon, (r) => !/^[\d\s.,+-]{5,}$/.test(r.texto));
}

/** Un número dentro de un renglón: dígitos sueltos o en grupos separados por un
 *  espacio, un punto o un guion. */
const NUMERO = /(?<!\d)\+?\d(?:\d|[ .-](?=\d))*(?!\d)/g;
/** Con su guion: sin él, 9 dígitos seguidos son también un celular. */
const RUT = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;

type Candidato = { e164: string; zona: Zona; trasClave: boolean };

/** Las OF que no pueden pasar por teléfono: la impresa y la del código impreso. */
export function ofsDelTexto(lista: Renglon[], ofImpresa: string | null): Set<string> {
  const ofs = new Set<string>(ofImpresa ? [ofImpresa] : []);
  for (const r of lista) {
    const codigo = CODIGO_IMPRESO.exec(r.texto.replace(/\s/g, ""))?.[0];
    const of = codigo ? ofValida(codigo.slice(14, 23)) : null;
    if (of) ofs.add(of);
  }
  return ofs;
}

function candidatos(lista: Renglon[], zonasDe: Zona[], ofs: Set<string>): Candidato[] {
  const salida: Candidato[] = [];
  let pendiente: Zona | null = null;
  lista.forEach((r, i) => {
    const m = CLAVES.telefono.exec(r.comparable);
    const finClave = m ? m.index + m[0].length : -1;
    const zonaClave = pendiente;
    pendiente = null;
    let alguno = false;
    for (const n of r.texto.matchAll(NUMERO)) {
      const crudo = n[0];
      const idx = n.index ?? 0;
      const d = crudo.replace(/\D/g, "");
      const antes = r.texto.slice(0, idx).trimEnd();
      if (antes.endsWith("$") || RUT.test(crudo) || /^-[kK]/.test(r.texto.slice(idx + crudo.length))) continue;
      const trasClave = (finClave >= 0 && idx >= finClave) || zonaClave !== null;
      const celular = (d.length === 9 && d.startsWith("9")) || (d.length === 11 && d.startsWith("569"));
      const fijo = (d.length === 9 && d.startsWith("58")) || (d.length === 11 && d.startsWith("5658"));
      const sinNueve = d.length === 8 && trasClave && !crudo.startsWith("+");
      if (!(celular || fijo || sinNueve) || ofs.has(ofValida(d) ?? "")) continue;
      const t = normalizarTelefono(crudo);
      if (!t.ok) continue;
      alguno = true;
      salida.push({ e164: t.telefono.e164, zona: zonaClave ?? zonasDe[i], trasClave });
    }
    // «Tel.» sola en su renglón: el número viene en el de abajo.
    if (m && !alguno && !r.texto.slice(finClave).match(/\d/)) pendiente = zonasDe[i];
  });
  return salida;
}

/** El teléfono del destinatario, por prioridad: detrás de «Tel.» en su zona,
 *  cualquiera en su zona, detrás de «Tel.» en la general, cualquiera en la
 *  general. Nunca de la zona del remitente. Dos distintos en la misma prioridad:
 *  el primero, y queda por revisar. */
export function telefono(lista: Renglon[], zonasDe: Zona[], ofs: Set<string>): { telefono: string | null; dudoso: boolean } {
  const todos = candidatos(lista, zonasDe, ofs).filter((c) => c.zona !== "remitente");
  const prioridades = [
    (c: Candidato) => c.zona === "destinatario" && c.trasClave,
    (c: Candidato) => c.zona === "destinatario",
    (c: Candidato) => c.zona === "general" && c.trasClave,
    (c: Candidato) => c.zona === "general",
  ];
  for (const p of prioridades) {
    const distintos = [...new Set(todos.filter(p).map((c) => c.e164))];
    if (distintos.length) return { telefono: distintos[0], dudoso: distintos.length > 1 };
  }
  return { telefono: null, dudoso: true };
}

/** Un monto en pesos: los miles van con punto o con coma («5.700», «5,700»: la
 *  Starken normal imprime coma, y ML Kit confunde uno con otra), con un espacio
 *  de más a lo sumo. Antes la coma cortaba el número y «$5,700» quedaba en $5
 *  (terreno 2026-11-14). Un separador vale solo con 3 dígitos detrás: «5,70» o
 *  «5.7000» no se adivinan, quedan sin leer («monto por revisar»). */
const MONTO = String.raw`(\d{1,3}(?:[.,] ?\d{3})+|\d+)(?![.,]? ?\d)`;
const MONTO_EN_SU_RENGLON = new RegExp(String.raw`^:?\s*\$?\s*${MONTO}`);
const MONTO_SOLO = new RegExp(String.raw`^\$?\s*${MONTO}$`);
const MONTO_CON_SIGNO = new RegExp(String.raw`\$\s*${MONTO}`);

const pesos = (v: string | undefined) => (v ? Number(v.replace(/\D/g, "")) : null);

/** Sin el $ delante, un envío por pagar no llega a esto: es la OF. */
const MONTO_MAXIMO = 999_999;

/** ¿Es la OF y no plata? «Total Monto O.F.» sin monto deja debajo la OF impresa
 *  («200.000.789», que con sus puntos parece un monto) y POR PAGAR quedaba cobrando la OF
 *  completa (dueño, 2026-11-26). Igual a una OF de la etiqueta, o sin $ y de 7 cifras o
 *  más, no es un monto: queda «monto por revisar», nunca se adivina. */
function esOf(m: RegExpExecArray | null, ofs: ReadonlySet<string>): boolean {
  const n = pesos(m?.[1]);
  return n !== null && (ofs.has(String(n)) || (!m?.[0].includes("$") && n > MONTO_MAXIMO));
}

/** El monto de un renglón, si es plata y no la OF. */
const plata = (m: RegExpExecArray | null, ofs: ReadonlySet<string>) => (esOf(m, ofs) ? null : pesos(m?.[1]));

/** El número de «Total Monto O.F.» tal como está impreso, 0 incluido (en su
 *  renglón o en el de abajo), o null si no se ve ninguno. `ofs`: las OF de la
 *  etiqueta (ofsDelTexto), que no son monto. */
export function totalImpreso(lista: Renglon[], ofs: ReadonlySet<string> = new Set()): number | null {
  const i = lista.findIndex((r) => CLAVES.totalMonto.test(r.comparable));
  if (i < 0) return null;
  const resto = despues(lista[i], CLAVES.totalMonto) ?? "";
  if (/\d/.test(resto)) return plata(MONTO_EN_SU_RENGLON.exec(resto), ofs);
  return plata(MONTO_SOLO.exec(lista[i + 1]?.texto ?? ""), ofs);
}

/** «Total Monto O.F.» impreso sin ningún monto en la etiqueta (la Starken temporal,
 *  fotos del dueño 2026-11-25): no hay de dónde leerlo. Ni un $ con cifra en ningún
 *  renglón, ni una cifra en el suyo o sola en el de abajo (la OF no cuenta). Con POR
 *  PAGAR sigue «monto por revisar» (nunca $0); solo deja de esperar un monto que no viene. */
export function montoNoImpreso(lista: Renglon[], ofs: ReadonlySet<string> = new Set()): boolean {
  const i = lista.findIndex((r) => CLAVES.totalMonto.test(r.comparable));
  if (i < 0 || lista.some((r) => /\$\s*\d/.test(r.texto))) return false;
  const resto = despues(lista[i], CLAVES.totalMonto) ?? "";
  const enSuRenglon = /\d/.test(resto) && !esOf(MONTO_EN_SU_RENGLON.exec(resto), ofs);
  const abajo = MONTO_SOLO.exec(lista[i + 1]?.texto ?? "");
  return !enSuRenglon && !(abajo && !esOf(abajo, ofs));
}

/** Lo que hay que cobrar: «Total Monto O.F.» y, si no está, el $ del renglón de
 *  POR PAGAR o del siguiente. 0, nada o la OF → null: con POR PAGAR nunca se supone $0. */
export function monto(lista: Renglon[], ofs: ReadonlySet<string> = new Set()): number | null {
  const total = totalImpreso(lista, ofs);
  if (total !== null) return total > 0 ? total : null;
  const i = lista.findIndex((r) => CLAVES.porPagar.test(r.comparable));
  if (i < 0) return null;
  const resto = despues(lista[i], CLAVES.porPagar) ?? "";
  const n = plata(MONTO_CON_SIGNO.exec(resto) ?? MONTO_SOLO.exec(lista[i + 1]?.texto ?? ""), ofs);
  return n && n > 0 ? n : null;
}

/** «Bulto N° 001/002» → [1, 2]. ML Kit a veces lee la barra como «:», «|» o
 *  una I (terreno 2026-11-08: «001:001»). */
export function bultos(lista: Renglon[]): [number, number] | null {
  const par = (v: RegExpExecArray | null): [number, number] | null => (v ? [Number(v[1]), Number(v[2])] : null);
  for (const [i, r] of lista.entries()) {
    const m = CLAVES.bulto.exec(r.comparable);
    if (!m) continue;
    const resto = r.comparable.slice(m.index + m[0].length);
    const aqui = par(/^\s*N?\s*[°º*]?\s*(\d{1,3})\s*[/:|IL]\s*(\d{1,3})/.exec(resto));
    if (aqui) return aqui;
    // «BULTO N°» solo y el número abajo (la Starken normal lo imprime grande).
    const abajo = /^[\sN°º*.:]*$/.test(resto) ? par(/^(\d{1,3})\s*[/:|IL]\s*(\d{1,3})$/.exec(lista[i + 1]?.comparable ?? "")) : null;
    if (abajo) return abajo;
  }
  // ML Kit puede dejar «001/001» suelto, lejos de su palabra (terreno 2026-11-08).
  // Starken lo imprime siempre con 3 dígitos a cada lado: una fecha («14/10») no
  // calza.
  for (const r of lista) {
    const suelto = par(/^(\d{3})\s*[/:|]\s*(\d{3})$/.exec(r.comparable));
    if (suelto && suelto[0] >= 1 && suelto[0] <= suelto[1]) return suelto;
  }
  return null;
}

/** La OF impresa: los dígitos detrás de «O.F.» en su renglón, o en el de abajo
 *  si la palabra quedó sola y abajo hay solo un número corto (nunca los 26
 *  dígitos del código: la foto se rechazaría como de otro paquete). Sirve solo
 *  para rechazar la foto de otra etiqueta y para confirmar la lectura. */
/** Los dígitos de una OF impresa: seguidos, en grupos con espacio o, como la imprime la
 *  Starken normal, con puntos de miles («282.295.910»; antes el punto la cortaba). */
const OF_IMPRESA = String.raw`\d{1,3}(?:[.,]\d{3})+(?!\d)|\d[\d ]*\d(?!\d)`;
const OF_EN_SU_RENGLON = new RegExp(String.raw`^[\s:.]*(${OF_IMPRESA})`);
const OF_SOLA = new RegExp(String.raw`^(${OF_IMPRESA})$`);

export function ofImpresa(lista: Renglon[]): string | null {
  for (const [i, r] of lista.entries()) {
    const m = CLAVES.of.exec(r.comparable);
    // «Total Monto O.F.» y «Kg Peso O.F.» no son la OF: con los puntos de miles, un monto
    // de seis cifras abajo («119,680») pasaría por una.
    if (!m || CLAVES.totalMonto.test(r.comparable) || /PESO|VOL/.test(r.comparable)) continue;
    const resto = r.texto.slice(m.index + m[0].length);
    // «O.F. 200000002» sí; «Total Monto O.F. $ 12.990» no (el $ corta).
    const aqui = OF_EN_SU_RENGLON.exec(resto)?.[1];
    const abajo = !resto.trim().replace(/[:.]/g, "") ? OF_SOLA.exec(lista[i + 1]?.texto ?? "")?.[1] : undefined;
    const digitos = (aqui ?? abajo ?? "").replace(/\D/g, "");
    if (digitos.length >= 6 && digitos.length <= 13) return ofValida(digitos);
  }
  // Sin «O.F.» con número (la Lion la imprime de costado), la de los dígitos
  // 15–23 del código impreso bajo las barras (el dueño, 2026-11-08). Tiene que
  // calzar EXACTA con la del escáner: un dígito mal leído rechaza la foto (se
  // saca otra), nunca acepta la del paquete vecino, que puede tener la OF
  // siguiente.
  for (const r of lista) {
    const codigo = CODIGO_IMPRESO.exec(r.texto.replace(/\s/g, ""))?.[0];
    if (codigo) return ofValida(codigo.slice(14, 23));
  }
  return null;
}
