"use client";

// Cierre del día con borrado (spec 007): antes de borrar, el conductor ve lo que
// no se entregó (vuelve a Starken) y confirma.
//
// Dos momentos:
//   · al abrir la app, si quedaron días anteriores con datos: se muestran de a
//     uno, del más viejo, y no se pueden saltar (FR-003);
//   · cuando el día de hoy se cierra (última parada marcada): se puede dejar
//     para después; vuelve a aparecer la próxima vez que se abra la app.

import { useCallback, useEffect, useState } from "react";
import {
  cerrarYBorrarDia,
  cifrasDelDia,
  diasPorBorrar,
  leerPedidos,
  noEntregadosDelDia,
  type Pedido,
} from "@/lib/encomiendas/local/almacen";

export type CierrePendiente = {
  fecha: string;
  /** Hoy se puede dejar para después; un día anterior, no. */
  esHoy: boolean;
  asignados: number;
  entregadas: number;
  /** Cobros en la puerta (spec 005): lo cobrado de lo que había que cobrar. */
  porPagar: number;
  aCobrar: number;
  cobrado: number;
  noEntregados: Pedido[];
};

export function useCierreDia({
  fecha,
  hoyCerrado,
  alBorrar,
}: {
  fecha: string;
  /** El día de hoy está cerrado y todavía tiene sus datos en el teléfono. */
  hoyCerrado: boolean;
  /** Después de borrar: volver a leer el día. */
  alBorrar: () => Promise<unknown> | void;
}) {
  const [anteriores, setAnteriores] = useState<string[]>([]);
  const [hoyAplazado, setHoyAplazado] = useState(false);
  const [leido, setLeido] = useState<CierrePendiente | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    diasPorBorrar(fecha)
      .then((f) => vigente && setAnteriores(f))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [fecha]);

  const objetivo = anteriores[0] ?? (hoyCerrado && !hoyAplazado ? fecha : null);
  // Lo leído vale solo para el día que sigue siendo el objetivo.
  const pendiente = objetivo && leido?.fecha === objetivo ? leido : null;

  useEffect(() => {
    if (!objetivo) return;
    let vigente = true;
    void Promise.all([leerPedidos(objetivo), noEntregadosDelDia(objetivo)])
      .then(([pedidos, noEntregados]) => {
        if (!vigente) return;
        const { porPagar, aCobrar, cobrado } = cifrasDelDia(objetivo, null, pedidos);
        setLeido({
          fecha: objetivo,
          esHoy: objetivo === fecha,
          asignados: pedidos.length,
          entregadas: pedidos.filter((p) => p.resultado === "entregado").length,
          porPagar,
          aCobrar,
          cobrado,
          noEntregados,
        });
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [objetivo, fecha]);

  const confirmar = useCallback(async () => {
    if (!pendiente || borrando) return;
    setBorrando(true);
    setError(null);
    try {
      await cerrarYBorrarDia(pendiente.fecha);
      setLeido(null);
      if (!pendiente.esHoy) setAnteriores((a) => a.filter((f) => f !== pendiente.fecha));
      await alBorrar();
    } catch {
      setError("No se pudieron borrar los datos del día. Intenta de nuevo.");
    } finally {
      setBorrando(false);
    }
  }, [pendiente, borrando, alBorrar]);

  const aplazar = useCallback(() => {
    if (pendiente?.esHoy) setHoyAplazado(true);
  }, [pendiente]);

  return { pendiente, borrando, error, confirmar, aplazar };
}
