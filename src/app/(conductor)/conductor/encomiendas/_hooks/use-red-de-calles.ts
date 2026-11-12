"use client";

// El mapa de calles propio en la pantalla (spec 031): se carga apenas hace falta y
// avisa cuando está, para que lo que depende de él se vuelva a calcular. Lo usa el
// recorrido: «Navegar» y la parada activa van a la entrada del condominio, y eso
// sale del mapa (geo/red/entrada.ts). Android recarga ARES al volver de Google
// Maps, y sin esto la primera parada después de recargar iba al edificio.
import { useEffect, useState } from "react";
import { cargarRed, redCargada } from "@/lib/geo/red/grafo";

/** true cuando el mapa de calles está en memoria. Con `activar`, lo carga. */
export function useRedDeCalles(activar: boolean): boolean {
  const [lista, setLista] = useState(() => redCargada() != null);
  useEffect(() => {
    if (!activar || lista) return;
    let vivo = true;
    void cargarRed().then((red) => {
      if (vivo && red) setLista(true);
    });
    return () => {
      vivo = false;
    };
  }, [activar, lista]);
  return lista;
}
