"use client";

// Diagnóstico «Tiempos» (spec 038): lo que tarda cada consulta a los proveedores y lo que el
// servidor dice que tardó (Server-Timing: auth, proveedor), leído de las entradas de recursos
// del navegador, y los bloqueos largos de la pantalla. Así no se toca el código que consulta.
// Solo cifras con etiquetas fijas (lib/comun/cronometro): nunca la URL ni lo consultado.

import { useEffect } from "react";
import { anotarTiempo, type Tramo } from "@/lib/comun/cronometro";

/** Qué tramo es cada recurso, por su ruta (no se guarda la URL). */
function tramoDe(url: string): Tramo | null {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === "nominatim.openstreetmap.org") return "osm.consulta";
    if (pathname === "/api/geocodificar") return "google.consulta";
    if (pathname === "/api/direccion-ia") return "ia.ida";
  } catch {
    // Una URL rara no se mide.
  }
  return null;
}

/** Un bloqueo de la pantalla que se siente: menos que esto es ruido. */
const MS_BLOQUEO = 100;

export function ObservarTiempos() {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const observadores: PerformanceObserver[] = [];
    const observar = (tipo: string, alLlegar: (e: PerformanceEntry) => void) => {
      if (!PerformanceObserver.supportedEntryTypes?.includes(tipo)) return;
      const o = new PerformanceObserver((lista) => lista.getEntries().forEach(alLlegar));
      try {
        o.observe({ type: tipo, buffered: false });
        observadores.push(o);
      } catch {
        // Este navegador no lo mide: no pasa nada.
      }
    };
    observar("resource", (e) => {
      const tramo = tramoDe(e.name);
      if (!tramo) return;
      anotarTiempo(tramo, e.duration);
      for (const t of (e as PerformanceResourceTiming).serverTiming ?? []) {
        if (t.name === "auth") anotarTiempo("api.auth", t.duration);
        else if (t.name === "proveedor") anotarTiempo("api.proveedor", t.duration);
      }
    });
    observar("longtask", (e) => {
      if (e.duration >= MS_BLOQUEO) anotarTiempo("hilo.bloqueo", e.duration);
    });
    return () => observadores.forEach((o) => o.disconnect());
  }, []);
  return null;
}
