"use client";

// «Crear N pedidos» y lo que sigue (crear, ubicar, IA), con su corte y su
// deshacer (spec 033). La lógica está en lib/encomiendas/local/cargar-lineas.ts;
// acá, el estado de la pantalla. Spec 038: mientras se revisan las líneas, OSM se
// va adelantando (use-adelanto-osm.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import type { LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { lineasParaCrear } from "@/lib/encomiendas/lectura/telefono-linea";
import { deshacerCarga, type LineaParaCrear, type OrigenCarga } from "@/lib/encomiendas/local/almacen";
import { cargarLineasGuia } from "@/lib/encomiendas/local/cargar-lineas";
import type { FinGuia } from "../_componentes/fin-guia";
import { useAdelantoOsm } from "./use-adelanto-osm";

export function useCargarLineas({
  fecha,
  lecturaIA,
  onCreados,
  revisando = null,
}: {
  fecha: string;
  lecturaIA: boolean;
  onCreados: () => void;
  /** Las líneas que el conductor está revisando (paso 2), o null: se adelanta OSM (spec 038). */
  revisando?: LineaGuia[] | null;
}) {
  const [fin, setFin] = useState<FinGuia | null>(null);
  const cortar = useRef<AbortController | null>(null);
  // Cerrar la ventana a la fuerza (otra pantalla) corta lo que esté en curso.
  useEffect(() => () => cortar.current?.abort(), []);
  // La misma dirección que tendrá cada pedido (lineasParaCrear, como crear()), y solo mientras
  // no se está creando ni mirando el resultado.
  const destinos = useMemo(() => (revisando && !fin ? lineasParaCrear(revisando).map((l) => l.destino) : null), [revisando, fin]);
  const pararAdelanto = useAdelantoOsm(destinos);

  /** Crea, ubica y corrige. Devuelve el error a mostrar, o null. */
  async function crear(
    lineas: LineaParaCrear[],
    opciones: { folio: string | null; origen: Extract<OrigenCarga, "guia_ia" | "guia_foto" | "guia_pegada"> },
  ): Promise<string | null> {
    // Lo adelantado ya quedó en la caché; lo que estaba en la fila sale para que la carga pase.
    pararAdelanto();
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
    pararAdelanto();
    if (fin?.tipo !== "listo") return null;
    const { quedan } = await deshacerCarga(fin.ids, fecha);
    onCreados();
    setFin(null);
    return quedan > 0 ? `${quedan} ya ${quedan === 1 ? "estaba en la ruta o escaneado: se conserva" : "estaban en la ruta o escaneados: se conservan"}.` : null;
  }

  return { fin, crear, dejar, deshacer };
}
