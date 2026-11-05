// La burbuja de ARES sobre Google Maps (spec 020). En la APK, una ventana nativa
// que flota encima de otras apps (plugin `Burbuja`, android/…/BurbujaServicio.java)
// y dibuja lo que la web le manda: la parada activa y los botones de su paso. Cada
// toque vuelve acá como evento y la pantalla lo atiende con las MISMAS funciones
// de la tarjeta (botones-parada.ts): la burbuja no decide nada.
//
// Fuera de la APK, o en una APK anterior a la 020, no hay burbuja: navegar abre
// Google Maps como siempre (mapas.ts). Contrato: specs/020-burbuja-google-maps/
// contracts/burbuja.md.
import { registerPlugin } from "@capacitor/core";
import { esApp } from "./entorno";
import { abrirEnMapas } from "./mapas";

/** Lo mismo que IdBoton de botones-parada.ts; lib no importa de app. */
export type IdBotonBurbuja = string;

export type BotonBurbuja = {
  id: IdBotonBurbuja;
  texto: string;
  detalle?: string;
  tono: string;
  soloIcono?: boolean;
  abreAres: boolean;
  escribe: boolean;
};

/** Lo que dibuja la burbuja (data-model.md). Se queda en el teléfono. */
export type VistaBurbuja = {
  secuencia: number;
  titulo: string;
  detalle: string;
  estado: { texto: string; tono: string } | null;
  /** El punto de la parada; null = sin punto ("Navegar" abre ARES). */
  destino: { lat: number; lng: number } | null;
  filas: BotonBurbuja[][];
  aviso: { texto: string; deshacer: boolean } | null;
  /** Cambió la parada desde la vista anterior: la burbuja se abre. */
  nueva: boolean;
};

type EstadoPermiso = { estado: "dado" | "falta" };

type PluginBurbuja = {
  permiso(): Promise<EstadoPermiso>;
  pedirPermiso(): Promise<EstadoPermiso>;
  mostrar(opciones: { vista: VistaBurbuja }): Promise<void>;
  terminar(): Promise<void>;
  enAres(opciones: { valor: boolean }): Promise<void>;
  navegar(opciones: { lat: number; lng: number }): Promise<{ via: "maps" | "navegador" }>;
  addListener(
    evento: "toque",
    cb: (datos: { id: IdBotonBurbuja }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

const Burbuja = registerPlugin<PluginBurbuja>("Burbuja");

/** Una APK anterior a la 020 no trae el plugin: se sabe al primer intento. */
function sinPlugin(e: unknown): boolean {
  return (e as { code?: string })?.code === "UNIMPLEMENTED";
}

/** ¿Se puede mostrar la burbuja? "no_disponible" fuera de la APK o en una vieja. */
export async function permisoBurbuja(): Promise<"dado" | "falta" | "no_disponible"> {
  if (!esApp()) return "no_disponible";
  try {
    return (await Burbuja.permiso()).estado;
  } catch (e) {
    return sinPlugin(e) ? "no_disponible" : "falta";
  }
}

/** Abre "Mostrar sobre otras apps" de ARES; true si al volver quedó dado. */
export async function pedirPermisoBurbuja(): Promise<boolean> {
  if (!esApp()) return false;
  try {
    return (await Burbuja.pedirPermiso()).estado === "dado";
  } catch {
    return false;
  }
}

/** Muestra o redibuja la burbuja. La primera vez arranca su servicio. */
export async function mostrarBurbuja(vista: VistaBurbuja): Promise<void> {
  if (!esApp()) return;
  try {
    await Burbuja.mostrar({ vista });
  } catch {
    // Sin plugin o sin permiso: no hay burbuja, la navegación sigue igual.
  }
}

export async function terminarBurbuja(): Promise<void> {
  if (!esApp()) return;
  try {
    await Burbuja.terminar();
  } catch {
    // Nada que quitar.
  }
}

/** true mientras ARES abre una pantalla suya (escáner, cámara): la burbuja no
 *  aparece encima aunque ARES quede atrás. */
export async function burbujaEnAres(valor: boolean): Promise<void> {
  if (!esApp()) return;
  try {
    await Burbuja.enAres({ valor });
  } catch {
    // Sin plugin no hay burbuja que esconder.
  }
}

/** Escucha los toques de la burbuja. Fuera de la APK nunca llama. */
export function alTocarBurbuja(cb: (id: IdBotonBurbuja) => void): () => void {
  if (!esApp()) return () => {};
  const escucha = Burbuja.addListener("toque", ({ id }) => cb(id)).catch(() => null);
  return () => void escucha.then((e) => e?.remove());
}

/**
 * Google Maps navegando hasta el punto. En la APK lo abre lo nativo, así funciona
 * también con ARES atrás (desde la burbuja); sin Google Maps, el enlace en el
 * navegador. A Google va solo el punto. Nunca lanza.
 */
export async function navegarA(destino: { lat: number; lng: number }): Promise<"maps" | "navegador"> {
  if (esApp()) {
    try {
      return (await Burbuja.navegar(destino)).via;
    } catch {
      // APK vieja: como antes.
    }
  }
  abrirEnMapas(destino);
  return "navegador";
}
