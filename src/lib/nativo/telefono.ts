// Teléfono del conductor: llamar, leer el registro de llamadas, mantener la
// pantalla encendida (spec 015) y leer el texto de una foto (spec 005). Dentro de la APK usa el plugin propio `Telefono`
// (android/…/TelefonoPlugin.java); fuera de ella, lo que ya hacía la web.
// Contrato: specs/015-app-android/contracts/nativo.md.
import { registerPlugin } from "@capacitor/core";
import { esApp } from "./entorno";

/** Una llamada del registro del teléfono, solo del número consultado. No lleva el
 *  número: el plugin ya filtró por él y nada de esto sale del teléfono. */
export type EntradaRegistro = {
  duracionS: number;
  tipo: "saliente" | "entrante" | "perdida" | "otra";
  fechaMs: number;
};

type EstadoPermiso = "granted" | "denied" | "prompt" | "prompt-with-rationale";

/** Permisos de la APK; `ubicacion` = ubicación precisa (el WebView no trae
 *  `navigator.permissions`). */
export type PermisosApp = { llamadas: EstadoPermiso; registro: EstadoPermiso; ubicacion: EstadoPermiso };

type PluginTelefono = {
  checkPermissions(): Promise<PermisosApp>;
  llamar(opciones: { numero: string }): Promise<void>;
  llamadasDesde(opciones: { numero: string; desdeMs: number }): Promise<{ llamadas: EntradaRegistro[] }>;
  pantallaEncendida(opciones: { encendida: boolean }): Promise<void>;
  leerTexto(opciones: { imagen: string }): Promise<{ texto: string }>;
};

const Telefono = registerPlugin<PluginTelefono>("Telefono");

/** Deja solo dígitos y el "+": lo que entiende tanto `tel:` como Android. */
function limpiar(numero: string): string {
  return numero.replace(/[^\d+]/g, "");
}

/** Llama al número. "directa" = la llamada ya salió desde la APK; "marcador" =
 *  se abrió el marcador (navegador, o la APK sin permiso de llamadas). */
export async function llamar(numero: string): Promise<"directa" | "marcador"> {
  const limpio = limpiar(numero);
  if (esApp()) {
    try {
      await Telefono.llamar({ numero: limpio });
      return "directa";
    } catch {
      // Sin permiso o sin soporte: se sigue con el marcador, como en la web.
    }
  }
  window.location.href = `tel:${limpio}`;
  return "marcador";
}

/** Llamadas a ese número desde `desdeMs`, más recientes primero. null = no se
 *  puede saber (navegador, o sin permiso de registro de llamadas). */
export async function llamadasDesde(numero: string, desdeMs: number): Promise<EntradaRegistro[] | null> {
  if (!esApp()) return null;
  try {
    return (await Telefono.llamadasDesde({ numero: limpiar(numero), desdeMs })).llamadas;
  } catch {
    return null;
  }
}

/** Estado de los permisos de la APK (para el diagnóstico); null fuera de ella. */
export async function permisosTelefono(): Promise<PermisosApp | null> {
  if (!esApp()) return null;
  try {
    return await Telefono.checkPermissions();
  } catch {
    return null;
  }
}

/** Dentro de la APK, mantiene la pantalla encendida mientras `encendida` sea true
 *  (no se suelta al volver de una llamada). En el navegador no hace nada: ahí lo
 *  resuelve usePantallaEncendida con Screen Wake Lock. */
export async function pantallaEncendida(encendida: boolean): Promise<void> {
  if (!esApp()) return;
  try {
    await Telefono.pantallaEncendida({ encendida });
  } catch {
    // Sin soporte: la pantalla se apaga como siempre.
  }
}

/** El texto de una foto, leído en el teléfono (ML Kit): sin red y sin costo. null
 *  fuera de la APK, con una APK anterior a esta función o si no se leyó nada. */
export async function textoDeFoto(foto: Blob): Promise<string | null> {
  if (!esApp()) return null;
  try {
    const { texto } = await Telefono.leerTexto({ imagen: await enBase64(foto) });
    return texto.trim() ? texto : null;
  } catch {
    return null;
  }
}

function enBase64(foto: Blob): Promise<string> {
  return new Promise((listo, fallo) => {
    const lector = new FileReader();
    lector.onload = () => listo(String(lector.result).replace(/^data:[^,]*,/, ""));
    lector.onerror = () => fallo(lector.error);
    lector.readAsDataURL(foto);
  });
}
