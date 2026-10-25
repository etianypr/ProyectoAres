"use client";

import { useEffect } from "react";

// Registra el service worker que deja abrir la app sin señal (spec 015, R2).
// Solo en producción: en desarrollo, una copia vieja de la página taparía los
// cambios que se están haciendo.
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // Un fallo acá no es un error del conductor: la app sigue funcionando con señal.
    navigator.serviceWorker.register("/sw.js", { scope: "/conductor" }).catch(() => {});
  }, []);

  return null;
}
