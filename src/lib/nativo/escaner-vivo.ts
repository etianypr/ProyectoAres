// Escáner de etiquetas en vivo (spec 028): la cámara de ARES debajo de la
// pantalla y, por cada cuadro, los códigos y los renglones de texto que lee ML
// Kit en el teléfono. Usa el plugin propio `EscanerVivo`
// (android/…/EscanerVivoPlugin.java). Ni los cuadros ni su texto salen del
// teléfono. Fuera de la APK, o con una APK anterior a la 1.6.0, no está: quien lo
// usa sigue con el escaneo de siempre.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { esApp } from "./entorno";

/** Un renglón de texto con su caja, en píxeles del cuadro ya derecho. `numeros`: sus
 *  palabras con 7 dígitos o más, con la confianza de ML Kit en cada carácter (desde la
 *  APK de los recuadros de la nómina; antes no viene). */
type RenglonVivo = {
  texto: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  numeros?: { texto: string; confianzas: number[] }[];
  /** Los íconos «PxP» y «COD» de la lista de Starken con su color, como desvío del gris (du, dv;
   *  el verde tiene los dos negativos). Desde la APK 1.11.0 (spec 045); antes no viene. */
  iconos?: { texto: string; du: number; dv: number }[];
};

/** Lo que dio un cuadro de la cámara. */
export type CuadroVivo = {
  codigos: string[];
  renglones: RenglonVivo[];
  /** Tamaño del cuadro derecho. */
  ancho: number;
  alto: number;
  /** Lo que tardó en leerlo, entero (ML Kit y armar el resultado). */
  ms: number;
  /** Desde la APK de la spec 036 (antes no vienen): el número de cuadro (con dos a la vez
   *  pueden llegar desordenados), lo que tardó solo ML Kit y lo que tardó armar el
   *  resultado; cada 30 cuadros, el estado térmico (0 normal … 6) y la memoria nativa. */
  n?: number;
  msLector?: number;
  msArmar?: number;
  termico?: number;
  nativoMB?: number;
};

/** Lo que tiene la cámara de este teléfono. */
export type CamaraViva = {
  linterna: boolean;
  captura: boolean;
  /** Con exposición corta: los cuadros por segundo que quedaron fijos (0 si la cámara
   *  no dejó, o con una APK anterior a la 034). */
  cuadrosFijos: number;
  /** Se pidió el visor y esta APK lo trae (false con una anterior, que lo ignora). */
  visor: boolean;
  /** Esta APK dibuja las flechas a lo que falta (spec 036; false con una anterior). */
  flechas: boolean;
  /** Cuántos cuadros lee a la vez (1 con una APK anterior). */
  enVuelo: number;
  /** La foto del paquete sale del cuadro que se está leyendo (APK 1.13.0, pedida con
   *  `foto: "cuadro"`); false con una anterior, que saca la foto en alta como siempre. */
  fotoDelCuadro: boolean;
  /** Esta APK lee el texto girado si se le pide (`girarTextoVivo`; 1.13.0). */
  giro: boolean;
};

/** La captura en alta, ya leída por ML Kit en el teléfono. */
type CapturaViva = { imagen: Blob; codigos: string[]; texto: string };

/** Un recuadro sobre la cámara, en las coordenadas del cuadro (las de `RenglonVivo`):
 *  confirmada (relleno), leyendo (punteado) o, con línea fina y sin etiqueta, cargada
 *  (una OF ya confirmada) o texto; con lo que va escrito arriba (la OF). Android dibuja
 *  cualquier otro tipo como el texto. */
export type MarcaViva = {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** «hueco»: un encargo que la cámara se saltó, entre dos leídos (spec 036; solo a una APK
   *  que trae las flechas). */
  tipo: "confirmada" | "leyendo" | "cargada" | "texto" | "hueco";
  etiqueta?: string;
};

/** Una flecha sobre la cámara a lo que falta (spec 036): hacia arriba o abajo en la nómina,
 *  a una OF que falta confirmar o a un hueco, con lo que dice (la OF y cuántos encargos hay
 *  hasta ella). La dibuja Android en el borde de la zona libre del recuadro. */
export type FlechaViva = { sentido: "arriba" | "abajo"; tipo: "falta" | "hueco"; etiqueta: string };

/** Cómo expone la cámara al barrer (spec 034: el celular y la boleta se mueven, y con
 *  poca luz la cámara alarga la exposición y el texto sale movido). `corta`: nunca más
 *  de 1/30 s por cuadro; `cortaOscura`: además un punto menos de exposición. */
export type ExposicionViva = "auto" | "corta" | "cortaOscura";

/** `codigos: false`: no se buscan códigos de barras en cada cuadro (la nómina no trae).
 *  Una APK anterior a la de la 034 ignora `codigos` y `exposicion`. */
type OpcionesEscanerVivo = {
  captura?: boolean;
  codigos?: boolean;
  exposicion?: ExposicionViva;
  /** El visor de «Cargar la guía» (spec 034): la vista previa y la foto en alta, sin leer
   *  cada cuadro (no llega ningún `cuadro`). */
  visor?: boolean;
  /** Cuántos cuadros se leen a la vez (spec 036, solo sin códigos): 2 copia el cuadro y lo
   *  lee otro lector mientras llega el siguiente. Una APK anterior lo ignora. */
  enVuelo?: 1 | 2;
  /** La foto del paquete sale del cuadro que se está leyendo, sin la foto en alta (fotos del
   *  dueño, 2026-11-25): con la foto en alta conectada el V2430 baja los cuadros a 720×960 y
   *  sacarla congela la cámara unos segundos. Una APK anterior a la 1.13.0 lo ignora. */
  foto?: "cuadro";
};

/** Una zona de la pantalla en fracciones 0–1: el recuadro por el que se ve la cámara. */
export type ZonaViva = { x: number; y: number; ancho: number; alto: number };

type PluginEscanerVivo = {
  iniciar(opciones?: OpcionesEscanerVivo): Promise<CamaraViva>;
  detener(): Promise<void>;
  linterna(opciones: { encendida: boolean }): Promise<void>;
  avisar(): Promise<void>;
  capturar(opciones?: { leer?: boolean; recorte?: ZonaViva }): Promise<{ imagen: string; codigos: string[]; texto: string }>;
  marcar(opciones: { cajas: MarcaViva[]; zona?: ZonaViva; flechas?: FlechaViva[] }): Promise<{ pantalla?: ZonaViva } | undefined>;
  girarTexto(opciones: { grados: number }): Promise<void>;
  addListener(evento: "cuadro", alCuadro: (cuadro: CuadroVivo) => void): Promise<PluginListenerHandle>;
};

const EscanerVivo = registerPlugin<PluginEscanerVivo>("EscanerVivo");

/** ¿Esta APK trae el escáner en vivo? (desde la 1.6.0). */
export function escanerVivoDisponible(): boolean {
  return esApp() && Capacitor.isPluginAvailable("EscanerVivo");
}

// Los dos escáneres tienen su riesgo en el teléfono del conductor (V2430, 4 GB):
//   · En vivo: cada redibujo de ARES espera a la GPU 1 a 5 s y un toque durante
//     una traba de más de 8 s cierra la app (ANR, ensayo 2026-11-09).
//   · El de Google: mientras está abierto, Android cierra ARES por memoria en 5
//     de 7 intentos (`am_kill … low memory`, 2026-11-10); el código leído se
//     pierde y ARES se recarga.
// Queda en vivo, como lo dejó el dueño, y el de Google se elige en Diagnóstico
// si la cámara en vivo se traba ese día (auditoría del día real, 2026-11-10).
const CLAVE_CLASICO = "ares.escaner-clasico";

/** ¿El conductor eligió el escáner de Google en Diagnóstico? Por defecto, no. */
export function escanerClasicoElegido(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_CLASICO) === "si";
  } catch {
    return false;
  }
}

export function elegirEscanerClasico(elegido: boolean): void {
  try {
    if (elegido) globalThis.localStorage?.setItem(CLAVE_CLASICO, "si");
    else globalThis.localStorage?.removeItem(CLAVE_CLASICO);
  } catch {
    // Sin localStorage queda la cámara en vivo.
  }
}

const CLAVE_EXPOSICION = "ares.barrido-exposicion";
const EXPOSICIONES: ExposicionViva[] = ["auto", "corta", "cortaOscura"];

/** La exposición con que barre la nómina. Se cambia en Diagnóstico para comparar con la
 *  misma nómina; por defecto, corta. */
export function exposicionDelBarrido(): ExposicionViva {
  try {
    const guardada = globalThis.localStorage?.getItem(CLAVE_EXPOSICION) as ExposicionViva | null;
    return guardada && EXPOSICIONES.includes(guardada) ? guardada : "corta";
  } catch {
    return "corta";
  }
}

export function elegirExposicionDelBarrido(exposicion: ExposicionViva): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_EXPOSICION, exposicion);
  } catch {
    // Sin localStorage queda la exposición por defecto.
  }
}

const CLAVE_A_LA_VEZ = "ares.barrido-cuadros-a-la-vez";

/** Cuántos cuadros lee a la vez el barrido de la nómina (spec 036). Se cambia en
 *  Diagnóstico para comparar con la misma nómina; por defecto 1, como siempre, hasta que
 *  una medición muestre que dos rinden más (ML Kit podría leerlos de a uno igual). */
export function cuadrosALaVez(): 1 | 2 {
  try {
    return globalThis.localStorage?.getItem(CLAVE_A_LA_VEZ) === "2" ? 2 : 1;
  } catch {
    return 1;
  }
}

export function elegirCuadrosALaVez(cuantos: 1 | 2): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_A_LA_VEZ, String(cuantos));
  } catch {
    // Sin localStorage queda de a uno.
  }
}

const CLAVE_CAMARA_TELEFONO = "ares.guia-camara-telefono";

/** ¿El conductor eligió en Diagnóstico sacar las fotos de la guía con la cámara del
 *  teléfono? Es la salida si la cámara en vivo de «Cargar la guía» se traba (spec 028). */
export function camaraDelTelefonoElegida(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_CAMARA_TELEFONO) === "si";
  } catch {
    return false;
  }
}

export function elegirCamaraDelTelefono(elegida: boolean): void {
  try {
    if (elegida) globalThis.localStorage?.setItem(CLAVE_CAMARA_TELEFONO, "si");
    else globalThis.localStorage?.removeItem(CLAVE_CAMARA_TELEFONO);
  } catch {
    // Sin localStorage queda la cámara en vivo.
  }
}

/** ¿«Cargar la guía» muestra la cámara en vivo en el recuadro? Si la APK no trae el
 *  visor se sabe recién al prenderla (`CamaraViva.visor`). */
export function usarVisorVivo(): boolean {
  return escanerVivoDisponible() && !camaraDelTelefonoElegida();
}

/** ¿«Cargar el auto» y «Escanear la etiqueta» abren la cámara en vivo? */
export function usarEscanerVivo(): boolean {
  return escanerVivoDisponible() && !escanerClasicoElegido();
}

/** Prende la cámara y llama a `alCuadro` con cada cuadro leído. Devuelve qué
 *  tiene la cámara y con qué apagarla. Falla si el conductor no da el permiso de
 *  cámara ("permiso_denegado") o si la cámara no abre ("sin_camara"). Con
 *  `captura: false` no abre la foto en alta y los cuadros salen más grandes (la
 *  nómina; una APK anterior lo ignora). */
export async function iniciarEscanerVivo(
  alCuadro: (cuadro: CuadroVivo) => void,
  opciones: OpcionesEscanerVivo = {},
): Promise<{ camara: CamaraViva; apagar: () => Promise<void> }> {
  const escucha = await EscanerVivo.addListener("cuadro", alCuadro);
  let camara: CamaraViva;
  pantalla = null;
  try {
    camara = await EscanerVivo.iniciar(opciones);
  } catch (e) {
    await escucha.remove();
    throw e;
  }
  return {
    camara: {
      linterna: Boolean(camara?.linterna),
      captura: Boolean(camara?.captura),
      cuadrosFijos: Number(camara?.cuadrosFijos) || 0,
      visor: Boolean(camara?.visor),
      flechas: Boolean(camara?.flechas),
      enVuelo: Number(camara?.enVuelo) || 1,
      fotoDelCuadro: Boolean(camara?.fotoDelCuadro),
      giro: Boolean(camara?.giro),
    },
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

/** Una APK sin los recuadros (anterior a la de la nómina) contesta que no los tiene:
 *  desde ahí no se le vuelven a mandar. */
let sinMarcas = false;

/** ¿Esta APK trae el barrido de la nómina entero (recuadros, confianza por dígito y
 *  cuadros grandes sin la foto en alta)? Una anterior barrería con cuadros de 720×960 y
 *  sin recuadros: «Barrer la nómina» no se ofrece. Se pregunta mandándole cero recuadros. */
export async function barridoDisponible(): Promise<boolean> {
  if (!escanerVivoDisponible()) return false;
  try {
    await EscanerVivo.marcar({ cajas: [] });
    return true;
  } catch {
    return false;
  }
}

/** Dónde cae el cuadro entero en la pantalla (fracciones de la WebView), según lo último
 *  que contestó Android al marcar: con eso se sabe qué encargos se ven en el recuadro
 *  (spec 036). null hasta la primera respuesta, o con una APK anterior. */
let pantalla: ZonaViva | null = null;

export function pantallaDelCuadro(): ZonaViva | null {
  return pantalla;
}

/** Dibuja los recuadros de lo que se está leyendo sobre la cámara (nómina, dueño
 *  2026-11-11). Los dibuja Android, no la web: con la cámara encendida cada redibujo
 *  de la WebView traba la pantalla. No se espera: va una vez por cuadro.
 *  Spec 036: con `extra` (solo a una APK que trae las flechas: `CamaraViva.flechas`), las
 *  flechas a lo que falta y la zona libre del recuadro donde van. Sin él, lo de siempre:
 *  a una APK anterior nunca le llega una flecha (dibujaría un recuadro suelto). */
export function marcarEscanerVivo(cajas: MarcaViva[], extra?: { zona: ZonaViva | null; flechas: FlechaViva[] }): void {
  if (sinMarcas) return;
  const opciones = extra ? { cajas, flechas: extra.flechas, ...(extra.zona ? { zona: extra.zona } : {}) } : { cajas };
  EscanerVivo.marcar(opciones)
    .then((r) => {
      if (r?.pantalla) pantalla = r.pantalla;
    })
    .catch((e: unknown) => {
      if ((e as { code?: string })?.code === "UNIMPLEMENTED") sinMarcas = true;
    });
}

/** Lee el texto de los cuadros siguientes girado `grados` (0, 90, 180 o 270) además del giro
 *  de la cámara: la etiqueta al revés o de costado (sesion-viva.ts decide cuándo). El código
 *  de barras se sigue leyendo en cualquier sentido. Con una APK anterior a la 1.13.0, nada. */
export function girarTextoVivo(grados: number): void {
  EscanerVivo.girarTexto({ grados }).catch(() => undefined);
}

/** Vibración corta: la etiqueta quedó leída (el sonido va en sonidos-escaner.ts). Sin soporte, nada. */
export async function avisarLectura(): Promise<void> {
  await EscanerVivo.avisar().catch(() => undefined);
}

/** La foto del paquete en alta, sin toque, con lo que ML Kit leyó de ella. null
 *  si este teléfono no da la captura o falló: el texto queda de los cuadros. */
export async function capturarViva(opciones?: { leer?: boolean; recorte?: ZonaViva }): Promise<CapturaViva | null> {
  try {
    const { imagen, codigos, texto } = await EscanerVivo.capturar(opciones);
    // Un ciclo simple: `Uint8Array.from(…, callback)` llama una función por byte y, con la
    // cámara encendida, cada ms en el hilo de la página se nota (spec 028).
    const binario = atob(imagen);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return { imagen: new Blob([bytes], { type: "image/jpeg" }), codigos, texto };
  } catch {
    return null;
  }
}
