// Escáner de códigos de barras de la APK (spec 015, US3). Lo consume la carga
// rápida (spec 005) para leer la OF de la etiqueta de Starken.
//
// Usa el escáner de Google (ML Kit, vía Google Play services): pantalla propia,
// sin permiso de cámara, procesa en el teléfono y funciona sin señal. Fuera de la
// APK devuelve null y quien lo usa ofrece escribir el código (la 005 decide si
// suma un lector de cámara web).
import {
  BarcodeFormat,
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState,
} from "@capacitor-mlkit/barcode-scanning";
import { burbujaEnAres } from "./burbuja";
import { esApp } from "./entorno";

// La primera vez hay que bajar el módulo de Google (unos MB); con señal tarda
// segundos. Pasado este plazo se desiste y se ofrece escribir el código.
const MS_INSTALAR_MODULO = 60_000;

async function moduloListo(): Promise<boolean> {
  if ((await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()).available) return true;
  return new Promise<boolean>((resolver) => {
    let terminado = false;
    const terminar = (listo: boolean) => {
      if (terminado) return;
      terminado = true;
      void escucha.then((e) => e.remove());
      resolver(listo);
    };
    const escucha = BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (evento) => {
      if (evento.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) terminar(true);
      else if (
        evento.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
        evento.state === GoogleBarcodeScannerModuleInstallState.CANCELED
      ) {
        terminar(false);
      }
    });
    setTimeout(() => terminar(false), MS_INSTALAR_MODULO);
    BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => terminar(false));
  });
}

/** Lo que pasó con el escáner (spec 033, clasico-silencio): el código leído, o
 *  por qué no hay código, para decirle al conductor por qué cayó a escribir la OF. */
export type LecturaEscaner =
  | { codigo: string }
  | { motivo: "cancelado" | "sin-modulo" | "error" | "fuera-app" | "sin-codigo" };

/** Así contesta el plugin cuando el conductor cierra el escáner sin leer nada. */
const CANCELADO = "scan canceled.";

/** Abre el escáner y devuelve los dígitos del primer código leído (Code 128 o
 *  ITF), o el motivo por el que no los hay. */
export async function escanearConMotivo(): Promise<LecturaEscaner> {
  if (!esApp()) return { motivo: "fuera-app" };
  // La burbuja no aparece encima del escáner de Google, y solo mientras está abierto:
  // la pantalla de escaneo de ARES puede quedar abierta al volver a Google Maps, y
  // ahí la burbuja tiene que verse (el vivo, 2026-11-06; spec 020).
  await burbujaEnAres(true);
  try {
    if (!(await moduloListo())) return { motivo: "sin-modulo" };
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Code128, BarcodeFormat.Itf],
    });
    const digitos = (barcodes[0]?.rawValue ?? "").replace(/\D/g, "");
    return digitos ? { codigo: digitos } : { motivo: "sin-codigo" };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { motivo: mensaje === CANCELADO ? "cancelado" : "error" };
  } finally {
    await burbujaEnAres(false);
  }
}

/** Como escanearConMotivo, sin el motivo: null = fuera de la APK, cancelado o
 *  sin escáner disponible (Diagnóstico). */
export async function escanearCodigo(): Promise<string | null> {
  const r = await escanearConMotivo();
  return "codigo" in r ? r.codigo : null;
}
