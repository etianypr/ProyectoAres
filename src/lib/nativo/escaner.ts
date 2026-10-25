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

/** Abre el escáner y devuelve los dígitos del primer código leído (Code 128 o
 *  ITF). null = fuera de la APK, cancelado o sin escáner disponible. */
export async function escanearCodigo(): Promise<string | null> {
  if (!esApp()) return null;
  try {
    if (!(await moduloListo())) return null;
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Code128, BarcodeFormat.Itf],
    });
    const digitos = (barcodes[0]?.rawValue ?? "").replace(/\D/g, "");
    return digitos || null;
  } catch {
    // Cancelado por el conductor o sin soporte.
    return null;
  }
}
