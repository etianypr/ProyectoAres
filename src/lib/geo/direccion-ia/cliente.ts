// Corregir con IA una dirección que no se pudo ubicar (spec 018), del lado del
// teléfono: arma la conversación, ejecuta las herramientas que la IA pide con los
// mismos buscadores que usa la app, y valida lo que propone. Ver contrato.ts.

import { tope } from "@/lib/comun/tope";
import { callesParecidas } from "../geocoding/calles";
import { normalizarConsulta } from "../geocoding/consulta";
import { conGoogle } from "../geocoding/google";
import { conMapbox } from "../geocoding/mapbox";
import { conNominatim } from "../geocoding/nominatim";
import type { SugerenciaDireccion } from "../geocoding/tipos";
import {
  HERRAMIENTA,
  MAX_VUELTAS,
  type BloqueHerramienta,
  type BloqueResultado,
  type CandidatoIA,
  type ConfianzaIA,
  type MensajeIA,
  type RespuestaPaso,
  type ResultadoIA,
} from "./contrato";

/** Candidatos por búsqueda que se le muestran a la IA. */
const CANDIDATOS_POR_BUSQUEDA = 8;

/** Lo que se puede reemplazar en las pruebas. */
export type DependenciasIA = {
  /** Una ida al servidor. */
  pedir: (mensajes: MensajeIA[]) => Promise<RespuestaPaso>;
  buscar: (consulta: string) => Promise<SugerenciaDireccion[]>;
  calles: (nombre: string) => Promise<{ nombre: string; largo: number }[]>;
};

export class IANoDisponible extends Error {}

async function pedirAlServidor(mensajes: MensajeIA[]): Promise<RespuestaPaso> {
  const res = await fetch("/api/direccion-ia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mensajes }),
    signal: tope(30_000),
  });
  const datos = (await res.json().catch(() => null)) as (RespuestaPaso & { error?: string }) | null;
  if (res.status === 503 && /no está configurada/.test(datos?.error ?? "")) throw new IANoDisponible();
  if (!res.ok || !datos || !Array.isArray(datos.contenido)) {
    throw new Error(datos?.error ?? "La IA no respondió.");
  }
  return datos;
}

/** Los tres buscadores a la vez, sin repetidos. Google solo si hay clave. */
async function buscarEnTodos(consulta: string): Promise<SugerenciaDireccion[]> {
  const q = normalizarConsulta(consulta);
  const listas = await Promise.all([
    conMapbox(q).catch(() => []),
    conNominatim(q).catch(() => []),
    conGoogle(q).catch(() => []),
  ]);
  const vistas = new Set<string>();
  return listas.flat().filter((s) => {
    const clave = `${s.direccion.toLowerCase()}|${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

const PREDETERMINADAS: DependenciasIA = {
  pedir: pedirAlServidor,
  buscar: buscarEnTodos,
  calles: async (nombre) => (await callesParecidas(nombre, 5)).map((c) => ({ nombre: c.nombre, largo: Math.round(c.largo) })),
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

/**
 * Pide a la IA que corrija `direccion`. Nunca lanza, salvo IANoDisponible (sin
 * clave en el servidor: no vale la pena seguir con las demás).
 */
export async function corregirConIA(
  direccion: string,
  dependencias: Partial<DependenciasIA> = {},
): Promise<ResultadoIA> {
  const { pedir, buscar, calles } = { ...PREDETERMINADAS, ...dependencias };
  const mensajes: MensajeIA[] = [
    { role: "user", content: `Dirección escrita: «${direccion.slice(0, 200)}». Ciudad: Arica, Chile.` },
  ];
  const candidatos = new Map<string, CandidatoIA>();

  async function ejecutar(uso: BloqueHerramienta): Promise<BloqueResultado> {
    const resultado = (content: unknown, is_error = false): BloqueResultado => ({
      type: "tool_result",
      tool_use_id: uso.id,
      content: typeof content === "string" ? content : JSON.stringify(content),
      ...(is_error ? { is_error } : {}),
    });
    try {
      if (uso.name === HERRAMIENTA.buscar) {
        const consulta = texto(uso.input.consulta);
        if (!consulta) return resultado("Falta la consulta.", true);
        const lista = (await buscar(consulta)).slice(0, CANDIDATOS_POR_BUSQUEDA).map((s) => {
          const id = `c${candidatos.size + 1}`;
          const candidato: CandidatoIA = {
            id,
            direccion: s.direccion,
            detalle: s.detalle,
            lat: s.lat,
            lng: s.lng,
            confianza: s.confianza,
            coincideNumero: s.coincideNumero,
            soloCalle: s.soloCalle,
            fuente: s.fuente,
          };
          candidatos.set(id, candidato);
          return candidato;
        });
        if (lista.length === 0) return resultado("Ningún buscador encontró esa dirección.");
        return resultado(
          lista.map((c) => ({
            id: c.id,
            direccion: c.direccion,
            detalle: c.detalle,
            confianza: c.confianza,
            numero_coincide: c.coincideNumero,
            solo_calle: c.soloCalle,
            fuente: c.fuente,
            punto: `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`,
          })),
        );
      }
      if (uso.name === HERRAMIENTA.calles) {
        const nombre = texto(uso.input.nombre);
        const lista = nombre ? await calles(nombre) : [];
        return resultado(lista.length > 0 ? lista : "No hay calles parecidas en el catálogo de Arica.");
      }
      return resultado(`Herramienta desconocida: ${uso.name}`, true);
    } catch {
      return resultado("El buscador no respondió.", true);
    }
  }

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await pedir(mensajes);
      const usos = r.contenido.filter((b): b is BloqueHerramienta => b.type === "tool_use");
      const propuesta = usos.find((u) => u.name === HERRAMIENTA.proponer);
      if (propuesta) return interpretar(propuesta.input, candidatos);
      if (usos.length === 0) {
        const dicho = r.contenido.map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
        return { tipo: "sin_arreglo", motivo: dicho || "La IA no propuso nada." };
      }
      mensajes.push({ role: "assistant", content: r.contenido });
      mensajes.push({ role: "user", content: await Promise.all(usos.map(ejecutar)) });
    }
    return { tipo: "sin_arreglo", motivo: "La IA no llegó a una respuesta." };
  } catch (e) {
    if (e instanceof IANoDisponible) throw e;
    return { tipo: "error", mensaje: e instanceof Error ? e.message : "La IA no respondió." };
  }
}

const CONFIANZAS: ConfianzaIA[] = ["alta", "media", "baja"];

/** Lo que propuso la IA, contrastado con lo que de verdad devolvieron los
 *  buscadores: la confianza nunca supera a la del candidato elegido. Pura. */
export function interpretar(input: Record<string, unknown>, candidatos: Map<string, CandidatoIA>): ResultadoIA {
  const motivo = texto(input.motivo) || "Sin explicación.";
  const id = typeof input.candidato === "string" ? input.candidato : null;
  const candidato = id ? candidatos.get(id) : undefined;
  if (!candidato) return { tipo: "sin_arreglo", motivo };
  let confianza: ConfianzaIA = CONFIANZAS.includes(input.confianza as ConfianzaIA)
    ? (input.confianza as ConfianzaIA)
    : "baja";
  // Un barrio no es una puerta, y un número que no coincide tampoco.
  if (candidato.confianza === "baja") confianza = "baja";
  else if (confianza === "alta" && (candidato.confianza !== "exacta" || candidato.coincideNumero === false)) {
    confianza = "media";
  }
  return { tipo: "propuesta", candidato, direccion: texto(input.direccion) || candidato.direccion, confianza, motivo };
}
