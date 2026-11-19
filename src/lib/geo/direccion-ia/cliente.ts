// Corregir con IA en lote (spec 040; antes una conversación por dirección, spec 018), del lado del
// teléfono: arma el lote con lo que ya devolvieron los buscadores, se lo pasa al servidor, busca de
// nuevo lo que la IA pidió (ronda 2) y valida lo que eligió. Ver contrato.ts.

import { anotarTiempo } from "@/lib/comun/cronometro";
import { tope } from "@/lib/comun/tope";
import { callesParecidas } from "../geocoding/calles";
import { normalizarConsulta } from "../geocoding/consulta";
import { conGoogle } from "../geocoding/google";
import { conNominatim } from "../geocoding/nominatim";
import { calleYNumero } from "../geocoding/referencias";
import { sectorDe } from "../sectores-arica";
import type { SugerenciaDireccion } from "../geocoding/tipos";
import { consultaOsmDe, ubicarDireccion, type ResultadoUbicacion } from "../geocoding/ubicar";
import {
  CALLES_POR_DIRECCION,
  CANDIDATOS_POR_DIRECCION,
  type CandidatoEnLote,
  type CandidatoIA,
  type ConfianzaIA,
  type Lote,
  type RespuestaLote,
  type ResultadoEnLote,
  type ResultadoIA,
  type ZonaDelDia,
} from "./contrato";

export class IANoDisponible extends Error {}

/** Anthropic limitó la tasa (429, spec 038): la IA existe, pero no contestó esta vez. */
export class IAOcupada extends Error {}

/** Lo que se puede reemplazar en las pruebas. */
type DependenciasLote = {
  /** Una llamada al servidor con el lote. */
  pedir: (lote: Lote) => Promise<RespuestaLote>;
  /** Los candidatos de una dirección: ubicarDireccion, que los tiene en la caché del día. */
  ubicar: (direccion: string, senal?: AbortSignal) => Promise<ResultadoUbicacion>;
  /** Lo que la IA pidió buscar en la ronda 1. */
  buscar: (consulta: string, senal?: AbortSignal) => Promise<SugerenciaDireccion[]>;
  calles: (nombre: string) => Promise<{ nombre: string; largo: number }[]>;
};

async function pedirAlServidor(lote: Lote): Promise<RespuestaLote> {
  const res = await fetch("/api/direccion-ia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lote }),
    // La ruta da 90 s (un lote de 15 tarda ~15-20 s).
    signal: tope(95_000),
  });
  const datos = (await res.json().catch(() => null)) as (RespuestaLote & { error?: string }) | null;
  if (res.status === 503 && /no está configurada/.test(datos?.error ?? "")) throw new IANoDisponible();
  if (res.status === 429) throw new IAOcupada(datos?.error ?? "La IA está ocupada.");
  if (!res.ok || !datos || !Array.isArray(datos.resultados)) {
    throw new Error(datos?.error ?? "La IA no respondió.");
  }
  // Diagnóstico «Tiempos» (spec 038): ¿la caché de prompt se lee?
  if (datos.uso) anotarTiempo("ia.cache", datos.uso.cacheLeidos);
  return datos;
}

/** Los dos buscadores a la vez, sin repetidos (spec 019: sin Mapbox). Google solo si hay clave. */
async function buscarEnTodos(consulta: string, senal?: AbortSignal): Promise<SugerenciaDireccion[]> {
  const q = normalizarConsulta(consulta);
  const listas = await Promise.all([conNominatim(q, senal).catch(() => []), conGoogle(q, senal).catch(() => [])]);
  return sinRepetidos(listas.flat());
}

const PREDETERMINADAS: DependenciasLote = {
  pedir: pedirAlServidor,
  ubicar: (direccion, senal) => ubicarDireccion(direccion, senal),
  buscar: buscarEnTodos,
  calles: async (nombre) =>
    (await callesParecidas(nombre, CALLES_POR_DIRECCION)).map((c) => ({ nombre: c.nombre, largo: Math.round(c.largo) })),
};

/** La misma dirección en el mismo punto (4 decimales, ~11 m) va una sola vez. */
function sinRepetidos(lista: SugerenciaDireccion[]): SugerenciaDireccion[] {
  const vistas = new Set<string>();
  return lista.filter((s) => {
    const clave = `${s.direccion.toLowerCase()}|${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/** Lo que la app sabe de una dirección antes de preguntarle a la IA. */
export type EntradaLote = {
  escrita: string;
  candidatos: SugerenciaDireccion[];
  calles: { nombre: string; largo: number }[];
};

/** El candidato como lo lee la IA. Con el sector de su punto, para cruzarlo con la zona del día, y en
 *  una calle repetida, las calles que cruzan el lugar y si calzó con la referencia de la guía. */
const enLote = (c: CandidatoIA, s: SugerenciaDireccion): CandidatoEnLote => ({
  id: c.id,
  direccion: c.direccion,
  detalle: c.detalle,
  confianza: c.confianza,
  numero_coincide: c.coincideNumero,
  solo_calle: c.soloCalle,
  fuente: c.fuente,
  punto: `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`,
  sector: sectorDe(c),
  ...(s.sector ? { cruces: (s.cruces ?? []).slice(0, 3).map((x) => x.slice(0, 80)), calza_con_la_guia: s.calza === true } : {}),
});

/** El lote de una ronda: direcciones «d1»… con sus candidatos «d1c1»…, y por cada dirección sus
 *  candidatos completos (con el punto exacto), que es contra lo que se valida la respuesta. Pura. */
export function armarLote(
  entradas: EntradaLote[],
  ronda: 1 | 2,
  zona: ZonaDelDia,
): { lote: Lote; candidatosDe: Map<string, Map<string, CandidatoIA>> } {
  const candidatosDe = new Map<string, Map<string, CandidatoIA>>();
  const direcciones = entradas.map((e, i) => {
    const id = `d${i + 1}`;
    const propios = new Map<string, CandidatoIA>();
    const candidatos = sinRepetidos(e.candidatos)
      .slice(0, CANDIDATOS_POR_DIRECCION)
      .map((s, k) => {
        const c: CandidatoIA = {
          id: `${id}c${k + 1}`,
          direccion: s.direccion.slice(0, 200),
          detalle: s.detalle?.slice(0, 200) ?? null,
          lat: s.lat,
          lng: s.lng,
          confianza: s.confianza,
          coincideNumero: s.coincideNumero,
          soloCalle: s.soloCalle,
          fuente: s.fuente,
        };
        propios.set(c.id, c);
        return enLote(c, s);
      });
    candidatosDe.set(id, propios);
    return {
      id,
      escrita: e.escrita.trim().slice(0, 200),
      candidatos,
      calles_parecidas: e.calles.slice(0, CALLES_POR_DIRECCION).map((c) => ({ nombre: c.nombre.slice(0, 120), largo_m: c.largo })),
    };
  });
  return { lote: { ronda, zona, direcciones }, candidatosDe };
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
const CONFIANZAS: ConfianzaIA[] = ["alta", "media", "baja"];

/** Lo que propuso la IA para UNA dirección, contrastado con los candidatos de esa misma dirección:
 *  un id que no es de ella no sirve, y la confianza nunca supera a la del candidato. Pura. */
export function interpretar(input: Record<string, unknown>, candidatos: Map<string, CandidatoIA>): ResultadoIA {
  const motivo = texto(input.motivo) || "Sin explicación.";
  const id = typeof input.candidato === "string" ? input.candidato : null;
  const candidato = id ? candidatos.get(id) : undefined;
  if (!candidato) return { tipo: "sin_arreglo", motivo };
  let confianza: ConfianzaIA = CONFIANZAS.includes(input.confianza as ConfianzaIA) ? (input.confianza as ConfianzaIA) : "baja";
  // Un barrio no es una puerta, y un número que no coincide tampoco.
  if (candidato.confianza === "baja") confianza = "baja";
  else if (confianza === "alta" && (candidato.confianza !== "exacta" || candidato.coincideNumero === false)) {
    confianza = "media";
  }
  return { tipo: "propuesta", candidato, direccion: texto(input.direccion) || candidato.direccion, confianza, motivo };
}

const deLaRespuesta = (r: ResultadoEnLote, candidatos: Map<string, CandidatoIA>) =>
  interpretar({ candidato: r.candidato, direccion: r.direccion_corregida, confianza: r.confianza, motivo: r.motivo }, candidatos);

/**
 * La IA decide todas las direcciones del lote, en una o dos rondas (spec 040):
 *   1. todas, con sus candidatos: la IA elige uno, o pide buscar un texto corregido;
 *   2. solo las que pidieron buscar, con lo que trajo esa búsqueda (y lo de antes).
 * Devuelve un resultado por entrada, en el mismo orden.
 *
 * Los errores de la ronda 1 salen (IANoDisponible, IAOcupada o sin conexión): el lote entero queda
 * para después. Un error en la ronda 2 deja como «error» solo las que faltaban.
 */
export async function corregirEnLote(
  entradas: EntradaLote[],
  { zona, senal }: { zona: ZonaDelDia; senal?: AbortSignal },
  dependencias: Partial<DependenciasLote> = {},
): Promise<ResultadoIA[]> {
  const { pedir, buscar } = { ...PREDETERMINADAS, ...dependencias };
  const resultados: ResultadoIA[] = entradas.map(() => ({ tipo: "sin_arreglo", motivo: "La IA no la contestó." }));
  if (entradas.length === 0) return resultados;
  let llamadas = 0;
  try {
    const uno = armarLote(entradas, 1, zona);
    llamadas++;
    const r1 = await pedir(uno.lote);
    const porBuscar: { i: number; texto: string }[] = [];
    entradas.forEach((_, i) => {
      const id = `d${i + 1}`;
      const r = r1.resultados.find((x) => x.direccion === id);
      if (!r) return;
      if (!r.candidato && r.buscar) porBuscar.push({ i, texto: r.buscar });
      else resultados[i] = deLaRespuesta(r, uno.candidatosDe.get(id)!);
    });
    if (porBuscar.length === 0 || senal?.aborted) return resultados;

    // Lo que pidió buscar: la cadena de siempre (con la caché del día), y lo de antes debajo.
    const otraVez = await Promise.all(
      porBuscar.map(async ({ i, texto: consulta }) => ({
        i,
        entrada: {
          ...entradas[i],
          candidatos: [...(await buscar(consulta, senal).catch(() => [])), ...entradas[i].candidatos],
        },
      })),
    );
    if (senal?.aborted) return resultados;
    const dos = armarLote(
      otraVez.map((x) => x.entrada),
      2,
      zona,
    );
    llamadas++;
    let r2: RespuestaLote;
    try {
      r2 = await pedir(dos.lote);
    } catch (e) {
      if (e instanceof IANoDisponible) throw e;
      for (const { i } of otraVez) resultados[i] = { tipo: "error", mensaje: e instanceof Error ? e.message : "La IA no respondió." };
      return resultados;
    }
    otraVez.forEach(({ i }, k) => {
      const id = `d${k + 1}`;
      const r = r2.resultados.find((x) => x.direccion === id);
      resultados[i] = r ? deLaRespuesta(r, dos.candidatosDe.get(id)!) : { tipo: "sin_arreglo", motivo: "La IA no la encontró." };
    });
    return resultados;
  } finally {
    // Diagnóstico «Tiempos» (spec 038): cuántas llamadas costó el lote.
    if (llamadas > 0) anotarTiempo("ia.idas", llamadas);
  }
}

/** La calle de una dirección, para buscar parecidas en el catálogo («Calle 2» de «POB X CALLE 2 901»). */
const calleDe = (direccion: string) => calleYNumero(consultaOsmDe(direccion) ?? direccion).calle;

/** De las direcciones escritas a la entrada del lote: los candidatos de ubicarDireccion (la caché del
 *  día; una calle repetida trae cada lugar con su población y sector) y las calles parecidas. */
export async function entradasDelLote(
  direcciones: string[],
  senal?: AbortSignal,
  dependencias: Partial<DependenciasLote> = {},
): Promise<EntradaLote[]> {
  const { ubicar, calles } = { ...PREDETERMINADAS, ...dependencias };
  return Promise.all(
    direcciones.map(async (escrita) => {
      const [r, parecidas] = await Promise.all([
        ubicar(escrita, senal).catch(() => null),
        calles(calleDe(escrita)).catch(() => []),
      ]);
      return { escrita, candidatos: r?.candidatos ?? [], calles: parecidas };
    }),
  );
}
