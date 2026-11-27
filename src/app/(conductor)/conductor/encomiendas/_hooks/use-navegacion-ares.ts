"use client";

// Navegar con ARES (spec 047, dueño 2026-11-26): los km de la parada ya no abren
// Google Maps, ponen el mapa de ARES a guiar —desde arriba, la línea naranja por
// delante y acercándose solo (_mapa/camara.ts)—. Google Maps queda de respaldo con
// «Abrir en Google Maps» al pie de la hoja (una calle cortada, un taco: ARES no
// sabe de tráfico), con la burbuja como siempre (use-burbuja.ts).
//
// Además, con la ruta armada y conexión, una vez al día se baja el mapa de Arica
// para que se vea sin conexión (lib/geo/mapa-guardado).

import { useEffect } from "react";
import { descargarSiHaceFalta } from "@/lib/geo/mapa-guardado/descarga";
import { useHaciaParada } from "./use-hacia-parada";

/** Que la descarga no compita con lo que la pantalla hace al abrir. */
const MS_ANTES_DE_DESCARGAR = 15_000;

export function useNavegacionAres({
  burbuja,
  onSeguir,
  ...camino
}: Parameters<typeof useHaciaParada>[0] & {
  burbuja: { navegar: () => Promise<void>; terminar: () => void };
  /** Poner el mapa a seguir al auto (lo mismo que «Centrar»). */
  onSeguir: () => void;
}) {
  const hacia = useHaciaParada(camino);
  const { hayRuta } = camino;

  useEffect(() => {
    if (!hayRuta) return;
    const bajar = () => void descargarSiHaceFalta().catch(() => null);
    const reloj = setTimeout(bajar, MS_ANTES_DE_DESCARGAR);
    // Volvió la conexión: si hoy no se alcanzó a bajar, ahora.
    window.addEventListener("online", bajar);
    return () => {
      clearTimeout(reloj);
      window.removeEventListener("online", bajar);
    };
  }, [hayRuta]);

  const hayDestino = hacia.destinoActivo != null;
  return {
    ...hacia,
    /** Los km de la parada: guía ARES; si la burbuja quedó abierta, se va. */
    navegar: hayDestino
      ? () => {
          burbuja.terminar();
          onSeguir();
        }
      : undefined,
    abrirGoogleMaps: hayDestino ? () => void burbuja.navegar() : undefined,
  };
}
