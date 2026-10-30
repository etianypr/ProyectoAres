// Navegar con Google hasta la parada (spec 019). En la APK abre la navegación de
// Google DENTRO de ARES (plugin `Navegacion`, android/…/NavegacionActivity.java): el
// mapa, el cartel y la voz de Google con los colores Dashund, y al llegar vuelve sola
// a ARES. Fuera de la APK, en una APK vieja sin el plugin o compilada sin clave, abre
// Google Maps como antes (mapas.ts).
//
// Mientras Google guía, la navegación propia de ARES (OpenRouteService) se pausa:
// no gasta consultas ni habla encima. Si Google no puede, ARES sigue con la suya.
// Contrato: specs/015-app-android/contracts/nativo.md.
import { registerPlugin } from "@capacitor/core";
import { esApp } from "./entorno";
import { abrirEnMapas } from "./mapas";

/** Cómo terminó: llegó a la parada, volvió antes a ARES, Google no pudo, o no hay
 *  navegación de Google en esta APK. */
export type ResultadoNavegacion = "llego" | "volvio" | "error" | "no_disponible";

type PluginNavegacion = {
  navegar(opciones: {
    lat: number;
    lng: number;
    titulo: string;
    detalle: string;
    simular: boolean;
  }): Promise<{ resultado: ResultadoNavegacion; motivo?: string | null }>;
};

const Navegacion = registerPlugin<PluginNavegacion>("Navegacion");

// ---------------------------------------------------------------------------
// ¿Está guiando Google ahora? Lo mira la navegación de ARES para pausarse.
// ---------------------------------------------------------------------------

let guiando = false;
const avisar = new Set<() => void>();

function cambiar(valor: boolean) {
  guiando = valor;
  for (const f of avisar) f();
}

export function navegandoConGoogle(): boolean {
  return guiando;
}

export function alCambiarNavegacion(f: () => void): () => void {
  avisar.add(f);
  return () => avisar.delete(f);
}

/**
 * Lleva al conductor hasta la parada con Google. `titulo` y `detalle` (la OF, a quién
 * y dónde) se muestran en la franja de abajo, en el teléfono: a Google va solo el
 * punto. Nunca lanza.
 */
export async function navegarConGoogle(
  destino: { lat: number; lng: number },
  { titulo, detalle, simular }: { titulo: string; detalle: string; simular: boolean },
): Promise<ResultadoNavegacion> {
  let resultado: ResultadoNavegacion = "no_disponible";
  if (esApp()) {
    cambiar(true);
    try {
      ({ resultado } = await Navegacion.navegar({ ...destino, titulo, detalle, simular }));
    } catch (e) {
      // Una APK anterior a la 019 no trae el plugin.
      resultado = (e as { code?: string })?.code === "UNIMPLEMENTED" ? "no_disponible" : "error";
    } finally {
      cambiar(false);
    }
  }
  if (resultado === "no_disponible") abrirEnMapas(destino);
  return resultado;
}
