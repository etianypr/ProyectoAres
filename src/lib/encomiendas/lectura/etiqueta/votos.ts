// Los cuadros de una misma etiqueta en el escáner en vivo (spec 028) → un solo
// resultado. Puro. El dueño: «es más importante que se demore más en procesar y
// que todos los datos importantes estén bien» (2026-11-08).
//
//   · Un dato queda firme cuando sale igual en IGUALES_PARA_FIRME cuadros y gana
//     sin empate. Visto una vez, se muestra pero queda por revisar; empatado, no
//     se muestra (con la plata nunca se adivina).
//   · La OF y el bulto salen solo del código de Starken del cuadro. Qué cuadro
//     cuenta para qué etiqueta lo decide quien llama (use-escaner-vivo.ts): un
//     cuadro con dos códigos de Starken distintos no cuenta (la caja del lado).
//   · El nombre y la dirección salen con pequeñas diferencias en cada cuadro (un
//     punto, una letra, 0 por O): las variantes parecidas son el mismo voto, y se
//     muestra la más parecida a todas (terreno 2026-11-08: si no, nunca quedaban
//     firmes). La OF impresa mal leída ya no bota el cuadro: solo deja de
//     confirmar.

import type { CodigoEtiqueta } from "../codigo-barras";
import type { LecturaEtiqueta } from "./index";

/** Cuántos cuadros tienen que coincidir para que un dato quede firme. */
export const IGUALES_PARA_FIRME = 2;

const CAMPOS = ["destinatario", "telefono", "direccion", "porPagar", "montoPorPagar", "bultosTotal", "ofImpresa"] as const;
type Campo = (typeof CAMPOS)[number];

export type Votos = {
  of: string;
  bulto: number | null;
  /** Cuadros con el código de esta etiqueta. */
  cuadros: number;
  /** Por campo, cuántas veces salió cada valor (en JSON, para que null no cuente). */
  conteo: Record<Campo, Record<string, number>>;
};

export type ResultadoVotos = {
  of: string;
  bulto: number | null;
  cuadros: number;
  /** La OF impresa firme coincide con la del código. */
  ofConfirmada: boolean;
  lectura: LecturaEtiqueta;
  /** Nombre, teléfono y pago (con su monto si se cobra) quedaron firmes. */
  listo: boolean;
};

function nuevos(codigo: CodigoEtiqueta): Votos {
  return { of: codigo.of, bulto: codigo.bulto, cuadros: 0, conteo: Object.fromEntries(CAMPOS.map((c) => [c, {}])) as Votos["conteo"] };
}

/** Suma un cuadro. Sin código de Starken en el cuadro no hay a qué etiqueta
 *  sumarlo; con otro código, se empieza de cero con esa etiqueta. */
export function sumarCuadro(votos: Votos | null, codigo: CodigoEtiqueta | null, lectura: LecturaEtiqueta | null): Votos | null {
  if (!codigo) return votos;
  const base = votos && votos.of === codigo.of ? votos : nuevos(codigo);
  const v: Votos = {
    ...base,
    bulto: base.bulto ?? codigo.bulto,
    cuadros: base.cuadros + 1,
    conteo: Object.fromEntries(CAMPOS.map((c) => [c, { ...base.conteo[c] }])) as Votos["conteo"],
  };
  if (!lectura) return v;
  for (const campo of CAMPOS) {
    // El monto vale solo en un cuadro que leyó POR PAGAR.
    if (campo === "montoPorPagar" && lectura.porPagar !== true) continue;
    const valor = lectura[campo];
    if (valor === null) continue;
    const clave = JSON.stringify(valor);
    v.conteo[campo][clave] = (v.conteo[campo][clave] ?? 0) + 1;
  }
  return v;
}

function elegir(conteo: Record<string, number>): { valor: unknown; firme: boolean } {
  const [primero, segundo] = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  if (!primero) return { valor: null, firme: false };
  if (segundo && segundo[1] === primero[1]) return { valor: null, firme: false };
  return { valor: JSON.parse(primero[0]), firme: primero[1] >= IGUALES_PARA_FIRME };
}

/** Para comparar textos leídos: mayúsculas, solo letras y espacios, y los
 *  cambios típicos de ML Kit (0→O, 1/L→I, 5→S). */
function comparable(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/[1L]/g, "I")
    .replace(/5/g, "S")
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function distancia(a: string, b: string): number {
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i];
    for (let j = 1; j <= b.length; j++) {
      nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    fila = nueva;
  }
  return fila[b.length];
}

/** ¿La misma palabra leída con alguna diferencia? Hasta un 15 % de letras. */
function parecidos(a: string, b: string): boolean {
  const x = comparable(a);
  const y = comparable(b);
  return distancia(x, y) <= Math.max(1, Math.floor(Math.max(x.length, y.length) * 0.15));
}

/** Como `elegir`, pero las variantes parecidas suman juntas (nombre, dirección).
 *  Gana el grupo con más votos; se muestra la variante más parecida a todas. */
function elegirTexto(conteo: Record<string, number>): { valor: unknown; firme: boolean } {
  const variantes = Object.entries(conteo).map(([k, n]) => [JSON.parse(k) as string, n] as const);
  const grupos: { variantes: (readonly [string, number])[]; votos: number }[] = [];
  for (const variante of [...variantes].sort((a, b) => b[1] - a[1])) {
    const grupo = grupos.find((g) => parecidos(g.variantes[0][0], variante[0]));
    if (grupo) {
      grupo.variantes.push(variante);
      grupo.votos += variante[1];
    } else {
      grupos.push({ variantes: [variante], votos: variante[1] });
    }
  }
  const [primero, segundo] = grupos.sort((a, b) => b.votos - a.votos);
  if (!primero || (segundo && segundo.votos === primero.votos)) return { valor: null, firme: false };
  const costo = (v: string) =>
    primero.variantes.reduce((suma, [otra, n]) => suma + n * distancia(comparable(v), comparable(otra)), 0) -
    primero.variantes.find(([x]) => x === v)![1] * 0.5;
  const valor = primero.variantes.map(([v]) => v).sort((a, b) => costo(a) - costo(b) || b.length - a.length)[0];
  return { valor, firme: primero.votos >= IGUALES_PARA_FIRME };
}

/** Cuántos de los tres datos que suenan en el escáner (nombre, teléfono y pago,
 *  con su monto si se cobra) quedaron firmes: un tic por cada uno (spec 028). */
export function datosFirmes(r: ResultadoVotos): number {
  const d = r.lectura.dudosos;
  const pago = !d.includes("pago") && !d.includes("montoPorPagar");
  return [!d.includes("destinatario"), !d.includes("telefono"), pago].filter(Boolean).length;
}

export function resultadoVotos(v: Votos): ResultadoVotos {
  const e = Object.fromEntries(
    CAMPOS.map((c) => [c, c === "destinatario" || c === "direccion" ? elegirTexto(v.conteo[c]) : elegir(v.conteo[c])]),
  ) as Record<Campo, ReturnType<typeof elegir>>;
  const porPagar = e.porPagar.valor as boolean | null;
  const montoPorPagar = porPagar === true ? (e.montoPorPagar.valor as number | null) : null;
  const destinatario = e.destinatario.valor as string | null;

  const dudosos = new Set<string>();
  if (!e.destinatario.firme || !destinatario || /\d/.test(destinatario)) dudosos.add("destinatario");
  if (!e.telefono.firme) dudosos.add("telefono");
  if (!e.direccion.firme) dudosos.add("direccion");
  if (!e.porPagar.firme) dudosos.add("pago");
  if (porPagar === true && !e.montoPorPagar.firme) dudosos.add("montoPorPagar");

  const lectura: LecturaEtiqueta = {
    ofImpresa: e.ofImpresa.valor as string | null,
    bulto: v.bulto,
    bultosTotal: e.bultosTotal.valor as number | null,
    destinatario,
    telefono: e.telefono.valor as string | null,
    direccion: e.direccion.valor as string | null,
    porPagar,
    montoPorPagar,
    dudosos: [...dudosos],
  };
  const imprescindibles = ["destinatario", "telefono", "pago", "montoPorPagar"];
  return {
    of: v.of,
    bulto: v.bulto,
    cuadros: v.cuadros,
    ofConfirmada: e.ofImpresa.firme && e.ofImpresa.valor === v.of,
    lectura,
    listo: !imprescindibles.some((d) => dudosos.has(d)),
  };
}
