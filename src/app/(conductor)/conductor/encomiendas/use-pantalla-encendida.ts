"use client";

// Mantiene la pantalla encendida mientras el chofer está navegando.
//
// No es comodidad: con la pantalla apagada el navegador SUSPENDE watchPosition,
// así que el punto deja de moverse, las maniobras dejan de avanzar y la voz se
// queda callada. El chofer levanta la vista a los treinta segundos y la app le
// muestra dónde estaba media cuadra atrás.
//
// El bloqueo se pierde solo cada vez que el teléfono manda la página a segundo
// plano —una llamada entrante, cambiar de app para mirar una dirección— y NO
// vuelve solo: hay que volver a pedirlo cuando la página se hace visible. Ese
// re-pedido es la mitad del trabajo de este archivo.
//
// Soporte: Safari lo tiene desde iOS 16.4. En un iPhone más viejo esto no hace
// nada y no hay forma de suplirlo desde la web (el truco del video invisible en
// bucle no funciona en iOS y gasta batería): ahí queda poner el bloqueo
// automático en "Nunca" antes de salir a repartir.

import { useEffect } from "react";

// El tipo no está en el lib.dom de todas las versiones de TypeScript, y no
// vale la pena subir el target por esto: se declara lo poco que se usa.
type Centinela = { release: () => Promise<void>; released: boolean };
type NavegadorConWakeLock = Navigator & {
  wakeLock?: { request: (tipo: "screen") => Promise<Centinela> };
};

export function usePantallaEncendida(activo: boolean): void {
  useEffect(() => {
    if (!activo || typeof navigator === "undefined") return;

    const wakeLock = (navigator as NavegadorConWakeLock).wakeLock;
    if (!wakeLock) return;

    let centinela: Centinela | null = null;
    let cancelado = false;

    async function pedir() {
      // Pedirlo con la página oculta lanza NotAllowedError, y eso pasa en el
      // camino normal: el efecto corre al volver de segundo plano un instante
      // antes de que el navegador marque la página como visible.
      if (cancelado || document.visibilityState !== "visible") return;
      try {
        centinela = await wakeLock!.request("screen");
      } catch {
        // Batería baja, permiso denegado o pestaña oculta. No hay nada que
        // decirle al chofer: la pantalla se va a apagar como siempre.
      }
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible" && (!centinela || centinela.released)) {
        void pedir();
      }
    };

    void pedir();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      // Soltarlo al salir de la pantalla de ruta: fuera de la navegación, dejar
      // el teléfono encendido para siempre es quemarle la batería al chofer.
      void centinela?.release().catch(() => {});
    };
  }, [activo]);
}
