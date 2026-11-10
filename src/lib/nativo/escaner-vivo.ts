// Escáner de etiquetas en vivo (spec 028): la cámara de ARES debajo de la
// pantalla y, por cada cuadro, los códigos y los renglones de texto que lee ML
// Kit en el teléfono. Usa el plugin propio `EscanerVivo`
// (android/…/EscanerVivoPlugin.java). Ni los cuadros ni su texto salen del
// teléfono. Fuera de la APK, o con una APK anterior a la 1.6.0, no está: quien lo
// usa sigue con el escaneo de siempre.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { esApp } from "./entorno";

/** Un renglón de texto con su caja, en píxeles del cuadro ya derecho. */
export type RenglonVivo = { texto: string; x: number; y: number; ancho: number; alto: number };

/** Lo que dio un cuadro de la cámara. */
export type CuadroVivo = {
  codigos: string[];
  renglones: RenglonVivo[];
  /** Tamaño del cuadro derecho. */
  ancho: number;
  alto: number;
  /** Lo que tardó ML Kit en leerlo. */
  ms: number;
};

/** Lo que tiene la cámara de este teléfono. */
export type CamaraViva = { linterna: boolean; captura: boolean };

/** La captura en alta, ya leída por ML Kit en el teléfono. */
export type CapturaViva = { imagen: Blob; codigos: string[]; texto: string };

type PluginEscanerVivo = {
  iniciar(): Promise<CamaraViva>;
  detener(): Promise<void>;
  linterna(opciones: { encendida: boolean }): Promise<void>;
  avisar(): Promise<void>;
  capturar(): Promise<{ imagen: string; codigos: string[]; texto: string }>;
  addListener(evento: "cuadro", alCuadro: (cuadro: CuadroVivo) => void): Promise<PluginListenerHandle>;
};

const EscanerVivo = registerPlugin<PluginEscanerVivo>("EscanerVivo");

/** ¿Esta APK trae el escáner en vivo? (desde la 1.6.0). */
export function escanerVivoDisponible(): boolean {
  return esApp() && Capacitor.isPluginAvailable("EscanerVivo");
}

// Con la cámara prendida, cada redibujo de ARES espera a la GPU 1 a 5 s en el
// teléfono del conductor, y un toque durante una traba de más de 8 s cierra la
// app (ensayo 2026-11-09). Hasta que eso se resuelva, «Cargar el auto» usa el
// escáner de siempre (una etiqueta por toque) y la cámara en vivo se prende a
// mano en Diagnóstico (auditoría del día real, 2026-11-10).
const CLAVE_ELEGIDO = "ares.escaner-vivo";

/** ¿El conductor prendió la cámara en vivo en Diagnóstico? Por defecto, no. */
export function escanerVivoElegido(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_ELEGIDO) === "si";
  } catch {
    return false;
  }
}

export function elegirEscanerVivo(elegido: boolean): void {
  try {
    if (elegido) globalThis.localStorage?.setItem(CLAVE_ELEGIDO, "si");
    else globalThis.localStorage?.removeItem(CLAVE_ELEGIDO);
  } catch {
    // Sin localStorage queda el escáner de siempre.
  }
}

/** ¿«Cargar el auto» y «Escanear la etiqueta» abren la cámara en vivo? */
export function usarEscanerVivo(): boolean {
  return escanerVivoDisponible() && escanerVivoElegido();
}

/** Prende la cámara y llama a `alCuadro` con cada cuadro leído. Devuelve qué
 *  tiene la cámara y con qué apagarla. Falla si el conductor no da el permiso de
 *  cámara ("permiso_denegado") o si la cámara no abre ("sin_camara"). */
export async function iniciarEscanerVivo(
  alCuadro: (cuadro: CuadroVivo) => void,
): Promise<{ camara: CamaraViva; apagar: () => Promise<void> }> {
  const escucha = await EscanerVivo.addListener("cuadro", alCuadro);
  let camara: CamaraViva;
  try {
    camara = await EscanerVivo.iniciar();
  } catch (e) {
    await escucha.remove();
    throw e;
  }
  return {
    camara: { linterna: Boolean(camara?.linterna), captura: Boolean(camara?.captura) },
    apagar: async () => {
      await escucha.remove();
      await EscanerVivo.detener().catch(() => undefined);
    },
  };
}

export async function linternaViva(encendida: boolean): Promise<boolean> {
  try {
    await EscanerVivo.linterna({ encendida });
    return true;
  } catch {
    return false;
  }
}

/** Vibración corta: la etiqueta quedó leída (el sonido va en sonidos-escaner.ts). Sin soporte, nada. */
export async function avisarLectura(): Promise<void> {
  await EscanerVivo.avisar().catch(() => undefined);
}

/** La foto del paquete en alta, sin toque, con lo que ML Kit leyó de ella. null
 *  si este teléfono no da la captura o falló: el texto queda de los cuadros. */
export async function capturarViva(): Promise<CapturaViva | null> {
  try {
    const { imagen, codigos, texto } = await EscanerVivo.capturar();
    const bytes = Uint8Array.from(atob(imagen), (c) => c.charCodeAt(0));
    return { imagen: new Blob([bytes], { type: "image/jpeg" }), codigos, texto };
  } catch {
    return null;
  }
}
