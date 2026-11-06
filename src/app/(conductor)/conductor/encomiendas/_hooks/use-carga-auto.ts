"use client";

// Cargar el auto (spec 027, paso 4): cuántos paquetes de la guía se escanearon,
// cuáles faltan con su número de parada (el mismo «PARADA n» que dice el
// escaneo) y «Salir a repartir». No bloquea: lo que no se escanea sigue en
// "Faltan" y, si no viene en el auto, queda en "No entregados" al cerrar el día.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { avanceCarga, marcarInicioReparto, sinEtiquetaEscaneada, type Pedido } from "@/lib/encomiendas/local/almacen";
import type { DiaEnCurso } from "./use-dia-trabajo";
import { cargaTerminada } from "./paso-del-dia";

/** Un paquete de la guía sin escanear y su parada (null = no está en la ruta). */
export type FaltaEscanear = { pedido: Pedido; secuencia: number | null };

export type CargaAuto = {
  escaneados: number;
  total: number;
  /** En orden de parada; los que no están en la ruta, al final. */
  faltan: FaltaEscanear[];
  terminada: boolean;
  /** Anota que salió a repartir: la cabecera pasa a la parada 1. */
  salir: () => Promise<void>;
};

export function useCargaAuto({ dia, fecha }: { dia: DiaEnCurso; fecha: string }): CargaAuto {
  const { ruta, pedidos, paradas, recargar } = dia;
  const { escaneados, total } = avanceCarga(pedidos);
  const faltan = useMemo(() => {
    const secuencia = new Map(paradas.map((p) => [p.pedido.id, p.secuencia] as const));
    const fin = Number.MAX_SAFE_INTEGER;
    return sinEtiquetaEscaneada(pedidos)
      .map((pedido) => ({ pedido, secuencia: secuencia.get(pedido.id) ?? null }))
      .sort((a, b) => (a.secuencia ?? fin) - (b.secuencia ?? fin));
  }, [pedidos, paradas]);

  const salir = useCallback(async () => {
    await marcarInicioReparto(fecha);
    await recargar();
  }, [fecha, recargar]);

  // Escaneó el último: queda anotado que salió. Si no, un pedido que llega
  // después —sin escanear— devolvería la cabecera a "Cargar el auto" a mitad
  // del reparto.
  const hayRuta = paradas.length > 0;
  const yaSalio = Boolean(ruta?.inicioReparto);
  const anotando = useRef(false);
  useEffect(() => {
    if (!hayRuta || yaSalio || total === 0 || faltan.length > 0 || anotando.current) return;
    anotando.current = true;
    void salir()
      .catch(() => {})
      .finally(() => {
        anotando.current = false;
      });
  }, [hayRuta, yaSalio, total, faltan.length, salir]);

  return { escaneados, total, faltan, terminada: cargaTerminada(ruta, pedidos), salir };
}
