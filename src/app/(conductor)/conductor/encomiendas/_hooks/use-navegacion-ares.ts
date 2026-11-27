"use client";

// Navegar con ARES (spec 047, dueño 2026-11-26): en reparto el mapa de ARES guía
// —desde arriba, la línea naranja por delante y acercándose solo (_mapa/camara.ts)—,
// y «Centrar» lo vuelve a poner a guiar. Los km de la parada siguen abriendo Google
// Maps con la burbuja (use-burbuja.ts), de respaldo para una calle cortada o un taco:
// ARES no sabe de tráfico. Un enlace aparte «Abrir en Google Maps» repetía los km y
// salió (dueño, 2026-11-27).
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
  ...camino
}: Parameters<typeof useHaciaParada>[0] & {
  burbuja: { navegar: () => Promise<void> };
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

  return {
    ...hacia,
    /** Los km de la parada: Google Maps con la burbuja (spec 020). */
    navegar: hacia.destinoActivo != null ? () => void burbuja.navegar() : undefined,
  };
}
