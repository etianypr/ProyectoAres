"use client";

// Botón atrás de Android (APK, spec 015): cierra lo que esté abierto, de lo más
// reciente a lo más de fondo. Con una ruta en curso no saca de la app: un toque de
// más con el teléfono en el soporte no puede dejar al conductor afuera (sale de
// pantalla.tsx, spec 002 T036).

import { useEffect, useRef } from "react";
import { alBotonAtras, minimizarApp } from "@/lib/nativo/entorno";
import type { Ventanas } from "../_componentes/ventanas-pantalla";
import type { useCierreDia } from "./use-cierre-dia";

/** Algo abierto que el botón atrás cierra: [¿está abierto?, cómo se cierra]. */
type Abierto = [boolean, () => void];

export function useBotonAtras({
  cierreDia,
  ventanas: v,
  despues,
  sinParadas,
}: {
  cierreDia: ReturnType<typeof useCierreDia>;
  ventanas: Ventanas;
  /** Lo de la pantalla, en orden: formulario, propuesta, salidas, resultado. */
  despues: Abierto[];
  /** Sin ruta, atrás manda la app a segundo plano (no la cierra). */
  sinParadas: boolean;
}) {
  const manejar = useRef<() => void>(() => {});
  useEffect(() => {
    manejar.current = () => {
      // El cierre de un día anterior no se salta; el de hoy queda para después.
      if (cierreDia.pendiente) return cierreDia.aplazar();
      const abiertos: Abierto[] = [
        [v.ayudaAbierta, () => v.setAyudaAbierta(false)],
        [v.buscandoOf, () => v.setBuscandoOf(false)],
        [v.escaneando, () => v.setEscaneando(false)],
        [v.pedirCarga != null, () => v.setPedirCarga(null)],
        // Mientras se ubican las direcciones la X está deshabilitada; el botón
        // atrás tampoco la cierra (spec 017, E12).
        [v.cargandoGuia, () => (v.guiaOcupada ? undefined : v.setCargandoGuia(false))],
        [v.menuAbierto, () => v.setMenuAbierto(false)],
        ...despues,
      ];
      const abierto = abiertos.find(([si]) => si);
      if (abierto) abierto[1]();
      else if (sinParadas) minimizarApp();
    };
  });
  useEffect(() => alBotonAtras(() => manejar.current()), []);
}
