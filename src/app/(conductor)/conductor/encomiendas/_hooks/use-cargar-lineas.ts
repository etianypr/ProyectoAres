"use client";

// «Crear N pedidos» y lo que sigue (crear, ubicar, IA), con su corte y su
// deshacer (spec 033). La lógica está en lib/encomiendas/local/cargar-lineas.ts;
// acá, el estado de la pantalla.

import { useEffect, useRef, useState } from "react";
import { deshacerCarga, type LineaParaCrear, type OrigenCarga } from "@/lib/encomiendas/local/almacen";
import { cargarLineasGuia } from "@/lib/encomiendas/local/cargar-lineas";
import type { FinGuia } from "../_componentes/fin-guia";

export function useCargarLineas({
  fecha,
  lecturaIA,
  onCreados,
}: {
  fecha: string;
  lecturaIA: boolean;
  onCreados: () => void;
}) {
  const [fin, setFin] = useState<FinGuia | null>(null);
  const cortar = useRef<AbortController | null>(null);
  // Cerrar la ventana a la fuerza (otra pantalla) corta lo que esté en curso.
  useEffect(() => () => cortar.current?.abort(), []);

  /** Crea, ubica y corrige. Devuelve el error a mostrar, o null. */
  async function crear(
    lineas: LineaParaCrear[],
    opciones: { folio: string | null; origen: Extract<OrigenCarga, "guia_ia" | "guia_foto" | "guia_pegada"> },
  ): Promise<string | null> {
    const control = new AbortController();
    cortar.current = control;
    setFin({ tipo: "ubicando", hechos: 0, total: lineas.length });
    try {
      const r = await cargarLineasGuia(lineas, fecha, {
        ...opciones,
        lecturaIA,
        senal: control.signal,
        alCrear: onCreados,
        alAvanzar: (tipo, hechos, total) => setFin({ tipo, hechos, total }),
      });
      onCreados();
      setFin({ tipo: "listo", ...r });
      return null;
    } catch (e) {
      setFin(null);
      return e instanceof Error ? e.message : "No se pudieron crear los pedidos.";
    } finally {
      cortar.current = null;
    }
  }

  /** «Dejar de ubicar». */
  function dejar() {
    cortar.current?.abort();
  }

  /** «Deshacer esta carga»: borra lo creado que nadie tocó. Devuelve un aviso si
   *  alguno quedó. */
  async function deshacer(): Promise<string | null> {
    if (fin?.tipo !== "listo") return null;
    const { quedan } = await deshacerCarga(fin.ids, fecha);
    onCreados();
    setFin(null);
    return quedan > 0 ? `${quedan} ya ${quedan === 1 ? "estaba en la ruta o escaneado: quedó" : "estaban en la ruta o escaneados: quedaron"}.` : null;
  }

  return { fin, crear, dejar, deshacer };
}
