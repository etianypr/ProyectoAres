"use client";

// «Resolver los ⚠» (spec 027, paso 2): abre el primer pedido con ⚠ en la hoja y,
// al guardarlo, el siguiente, sin volver a la lista entre medio. Un ⚠ que no se
// arregla (una OF que de verdad viene con 8 dígitos) no traba la pasada: se
// sigue con el que viene. «Siguiente» salta al que viene sin guardar (spec 033).

import { useCallback, useState } from "react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";

type Pasada = { cola: string[]; total: number };

export function useResolverProblemas(setFormPedido: (p: "nuevo" | Pedido | null) => void) {
  const [pasada, setPasada] = useState<Pasada | null>(null);

  const empezar = useCallback(
    (conProblema: Pedido[]) => {
      const [primero, ...resto] = conProblema;
      if (!primero) return;
      setPasada({ cola: resto.map((p) => p.id), total: conProblema.length });
      setFormPedido(primero);
    },
    [setFormPedido],
  );

  /** Cierra el formulario y termina la pasada. */
  const cerrar = useCallback(() => {
    setFormPedido(null);
    setPasada(null);
  }, [setFormPedido]);

  /** Se guardó una corrección (o se tocó «Siguiente»): abre el siguiente ⚠ que
   *  siga en el día, o cierra. */
  const despuesDeGuardar = useCallback(
    (pedidos: Pedido[]) => {
      const quedan = pasada?.cola ?? [];
      const k = quedan.findIndex((id) => pedidos.some((p) => p.id === id));
      const siguiente = k >= 0 ? pedidos.find((p) => p.id === quedan[k]) : undefined;
      if (!pasada || !siguiente) return cerrar();
      setPasada({ ...pasada, cola: quedan.slice(k + 1) });
      setFormPedido(siguiente);
    },
    [pasada, cerrar, setFormPedido],
  );

  /** "⚠ 2 de 4" en el formulario, durante la pasada. */
  const titulo = pasada ? `⚠ ${pasada.total - pasada.cola.length} de ${pasada.total}` : undefined;

  /** Quedan ⚠ por delante en la pasada. */
  const hayMas = (pasada?.cola.length ?? 0) > 0;

  return { empezar, cerrar, despuesDeGuardar, titulo, hayMas };
}
