// ¿Corre dentro de la APK de Android (spec 015) o en el navegador?
//
// Todo lo nativo de la app pasa por `src/lib/nativo/`: ningún otro archivo importa
// `@capacitor/*`. Fuera de la APK cada función vuelve al comportamiento de siempre.
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/** true solo dentro de la APK. En el servidor y en el navegador, false. */
export function esApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/** Versión de la APK instalada ("1.0.0"); null fuera de ella. */
export async function versionInstalada(): Promise<string | null> {
  if (!esApp()) return null;
  try {
    return (await App.getInfo()).version;
  } catch {
    return null;
  }
}

/** Toma el botón atrás de Android (solo en la APK). Mientras haya alguien
 *  escuchando, Android no cierra ni retrocede solo: lo decide `cb`. */
export function alBotonAtras(cb: () => void): () => void {
  if (!esApp()) return () => {};
  const escucha = App.addListener("backButton", cb);
  return () => void escucha.then((e) => e.remove());
}

/** Manda la app a segundo plano, como el botón atrás de cualquier app, sin
 *  cerrarla (el día sigue donde estaba). */
export function minimizarApp(): void {
  if (esApp()) void App.minimizeApp();
}

/** Llama a `cb` cada vez que la app vuelve a primer plano: por ejemplo, al
 *  terminar una llamada. Devuelve la función para dejar de escuchar. */
export function alVolverAPrimerPlano(cb: () => void): () => void {
  if (esApp()) {
    const escucha = App.addListener("resume", cb);
    return () => void escucha.then((e) => e.remove());
  }
  const alCambiar = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", alCambiar);
  return () => document.removeEventListener("visibilitychange", alCambiar);
}

/** Llama a `cb` cada vez que la app pasa a segundo plano. */
export function alIrAlFondo(cb: () => void): () => void {
  if (esApp()) {
    const escucha = App.addListener("pause", cb);
    return () => void escucha.then((e) => e.remove());
  }
  const alCambiar = () => {
    if (document.visibilityState === "hidden") cb();
  };
  document.addEventListener("visibilitychange", alCambiar);
  return () => document.removeEventListener("visibilitychange", alCambiar);
}
