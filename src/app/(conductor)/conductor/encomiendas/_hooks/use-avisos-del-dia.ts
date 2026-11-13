"use client";

// Dos datos de la pantalla del conductor que no son del día en curso: cómo terminó
// ayer y si la APK instalada es más vieja que la mínima (sale de pantalla.tsx,
// spec 002 T036).

import { useEffect, useState } from "react";
import { sumarDias } from "@/lib/comun/fechas";
import { leerResumenDia } from "@/lib/encomiendas/local/almacen";
import { versionInstalada } from "@/lib/nativo/entorno";
import { CLAVE_AVISO_APK_ESCONDIDO, mostrarAvisoApk } from "@/lib/nativo/version";

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

/** «Hay una actualización disponible» al abrir la app, si la APK instalada es más
 *  vieja que APK_VERSION_MINIMA (spec 033, apk-aviso; dueño 2026-11-13: avisa, no
 *  obliga). La ✕ lo esconde hasta que se vuelva a abrir la app (sessionStorage). */
export function useAvisoApk(apkMinima: string | null): { visible: boolean; esconder: () => void } {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!apkMinima) return;
    void versionInstalada().then((v) => {
      let escondida: string | null = null;
      try {
        escondida = sessionStorage.getItem(CLAVE_AVISO_APK_ESCONDIDO);
      } catch {
        // Sin sessionStorage el aviso sale; la ✕ lo esconde igual en memoria.
      }
      setVisible(mostrarAvisoApk(v, apkMinima, escondida));
    });
  }, [apkMinima]);
  const esconder = () => {
    setVisible(false);
    try {
      if (apkMinima) sessionStorage.setItem(CLAVE_AVISO_APK_ESCONDIDO, apkMinima);
    } catch {
      // Queda escondido mientras la pantalla siga abierta.
    }
  };
  return { visible, esconder };
}
