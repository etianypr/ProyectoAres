// Ubicar los pedidos recién creados desde la guía, uno por uno (spec 005), con
// salida (spec 033, «ubicando-trabado»): sin señal cada dirección esperaba ~20 s
// y la ventana no se podía cerrar (6 pedidos = 3 min 20 s). Ahora:
//   · «Dejar de ubicar» corta al tiro (la consulta en curso se abandona);
//   · sin red (navigator.onLine) o con 2 seguidas sin respuesta, para solo y lo dice.
// Los pedidos ya están creados: lo que no se ubica queda «Sin ubicar», como siempre.

import { elegirConLaRuta, ubicarDireccion, type ResultadoUbicacion } from "@/lib/geo/geocoding";
import type { Coordenada } from "@/lib/geo/coordenada";
import { lugarProvisorio } from "@/lib/encomiendas/problemas";
import { fijarCoordenadas, ubicarConDuda } from "./almacen";

/** Seguidas sin respuesta de ningún buscador: con esto ya no hay señal. */
export const FALLOS_PARA_PARAR = 2;

export type ResumenUbicarCarga = {
  ubicados: number;
  /** Los que quedaron sin punto, en el orden de la guía (con los no intentados). */
  sinUbicar: string[];
  /** Se paró por falta de señal. */
  sinSenal: boolean;
  /** El conductor tocó «Dejar de ubicar». */
  cortado: boolean;
  /** Ubicados con duda (2026-11-16): la cuadra y no la puerta, solo la calle, o una calle
   *  repetida sin resolver. Van a la IA junto con los sin ubicar. */
  dudosos: string[];
};

/** Hay red según el navegador. false es seguro; true no garantiza señal. */
export function hayRed(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Espera la promesa, o null apenas se aborte la señal (lo que llegue después se ignora). */
export function hastaAbortar<T>(promesa: Promise<T>, senal?: AbortSignal): Promise<T | null> {
  if (!senal) return promesa;
  if (senal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((listo, falla) => {
    const alAbortar = () => listo(null);
    senal.addEventListener("abort", alAbortar, { once: true });
    promesa.then(
      (v) => {
        senal.removeEventListener("abort", alAbortar);
        listo(v);
      },
      (e) => {
        senal.removeEventListener("abort", alAbortar);
        falla(e);
      },
    );
  });
}

export async function ubicarCarga(
  pedidos: { id: string; direccion: string }[],
  {
    senal,
    alAvanzar,
    ubicar = ubicarDireccion,
    enLinea = hayRed,
    puntosDelDia = [],
  }: {
    /** Los pedidos del día que ya tenían punto: con ellos se sabe qué zona cubre la ruta. */
    puntosDelDia?: Coordenada[];
    senal?: AbortSignal;
    alAvanzar?: (hechos: number, total: number) => void;
    ubicar?: (direccion: string, senal?: AbortSignal) => Promise<ResultadoUbicacion>;
    enLinea?: () => boolean;
  } = {},
): Promise<ResumenUbicarCarga> {
  const resumen: ResumenUbicarCarga = { ubicados: 0, sinUbicar: [], sinSenal: false, cortado: false, dudosos: [] };
  let seguidas = 0;
  let i = 0;
  // Una calle repetida se resuelve al final, con todos los puntos de la carga: así se sabe en
  // qué zona anda la ruta (spec 035).
  const repetidas: { id: string; r: ResultadoUbicacion }[] = [];
  const puntos = [...puntosDelDia];
  for (; i < pedidos.length; i++) {
    const p = pedidos[i];
    if (senal?.aborted) {
      resumen.cortado = true;
      break;
    }
    if (!enLinea()) {
      resumen.sinSenal = true;
      break;
    }
    alAvanzar?.(i, pedidos.length);
    let r: ResultadoUbicacion | null;
    try {
      r = await hastaAbortar(ubicar(p.direccion, senal), senal);
    } catch {
      r = null;
    }
    if (senal?.aborted) {
      resumen.cortado = true;
      break;
    }
    if (!r || r.sinRespuesta) {
      resumen.sinUbicar.push(p.id);
      if (++seguidas >= FALLOS_PARA_PARAR) {
        resumen.sinSenal = true;
        i++;
        break;
      }
      continue;
    }
    seguidas = 0;
    if (r.tipo === "ambigua" && r.candidatos.some((c) => c.sector)) {
      repetidas.push({ id: p.id, r });
      continue;
    }
    if (r.elegida) puntos.push(r.elegida);
    await guardarUbicacion(p.id, r, resumen);
  }
  for (const { id, r } of repetidas) await guardarUbicacion(id, elegirConLaRuta(r, puntos), resumen);
  resumen.sinUbicar.push(...pedidos.slice(i).map((p) => p.id));
  return resumen;
}

async function guardarUbicacion(id: string, r: ResultadoUbicacion, resumen: ResumenUbicarCarga): Promise<void> {
  const provisorio = lugarProvisorio(r);
  if (r.elegida) {
    await fijarCoordenadas([{ id, lat: r.elegida.lat, lng: r.elegida.lng }]);
    resumen.ubicados++;
    // La cuadra y no la puerta. Lo elegido por la referencia de la guía o por la ruta no es duda.
    if (r.tipo === "aproximada" && !r.elegida.sector && r.elegida.fuente !== "plus_code") resumen.dudosos.push(id);
  } else if (provisorio) {
    // En duda pero con opciones: entra con la primera y ⚠ (spec 022).
    await ubicarConDuda([{ id, ...provisorio }]);
    resumen.ubicados++;
    // Solo la calle va a la IA; una calle repetida no: la IA no sabe dónde anda la ruta y
    // elegía el lugar equivocado (dueño, 2026-11-16). Se elige en «Por confirmar».
    if (provisorio.problema.tipo === "solo_calle") resumen.dudosos.push(id);
  } else {
    resumen.sinUbicar.push(id);
  }
}
