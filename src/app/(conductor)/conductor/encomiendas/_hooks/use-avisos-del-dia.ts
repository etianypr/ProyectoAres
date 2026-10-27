"use client";

// Dos datos de la pantalla del conductor que no son del día en curso: cómo terminó
// ayer y si la APK instalada es más vieja que la mínima (sale de pantalla.tsx,
// spec 002 T036).

import { useEffect, useState } from "react";
import { sumarDias } from "@/lib/comun/fechas";
import { leerResumenDia } from "@/lib/encomiendas/local/almacen";
import { versionInstalada } from "@/lib/nativo/entorno";
import { esMasVieja } from "@/lib/nativo/version";

export function useResumenAyer(fecha: string): { entregadas: number; noEntregadas: number } | null {
  const [ayer, setAyer] = useState<{ entregadas: number; noEntregadas: number } | null>(null);
  // Resumen del día anterior: cuántas cerró y cuántas quedaron. No hay navegador
  // de fechas — el conductor no vuelve a trabajar un día pasado, solo quiere saber
  // cómo terminó el último.
  useEffect(() => {
    void (async () => {
      try {
        // Del resumen guardado si el día ya se borró (spec 007), o de su ruta.
        const resumen = await leerResumenDia(sumarDias(fecha, -1));
        setAyer(
          resumen && resumen.paradas > 0
            ? { entregadas: resumen.entregadas, noEntregadas: resumen.noEntregadas }
            : null,
        );
      } catch {
        // El resumen de ayer es un extra: si el teléfono no lo puede leer, la
        // pantalla de hoy no tiene por qué enterarse.
      }
    })();
  }, [fecha]);
  return ayer;
}

export function useApkVieja(apkMinima: string | null): boolean {
  // APK más vieja que la mínima publicada: aviso con el enlace, sin frenar nada.
  const [apkVieja, setApkVieja] = useState(false);
  useEffect(() => {
    if (!apkMinima) return;
    void versionInstalada().then((v) => setApkVieja(esMasVieja(v, apkMinima)));
  }, [apkMinima]);
  return apkVieja;
}
