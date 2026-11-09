"use client";

// Las paradas cercanas y lo que su lista le pide al mapa (spec 023; dueño,
// 2026-11-09: "compacta y marcada en el mapa"): con la lista abierta, esas
// paradas van marcadas; tocar una lleva el mapa a ella y suelta el seguimiento,
// como arrastrarlo a mano ("Centrar" lo devuelve). Nada de esto consulta a nadie.

import { useCallback, useMemo, useState } from "react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { Parada } from "./dia-trabajo-tipos";
import { paradasCercanas, type Cercana } from "./paradas-cercanas";

const NINGUNA: Cercana[] = [];

export function useVistaCercanas({
  paradas,
  activa,
  pedidos,
  soltarMapa,
}: {
  paradas: Parada[];
  activa: Parada | null;
  pedidos: Pedido[];
  soltarMapa: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [enfoque, setEnfoque] = useState<{ lat: number; lng: number; clave: number } | null>(null);
  // Memorizadas: el mapa las usa como dependencia y el GPS redibuja seguido.
  const cercanas = useMemo(() => paradasCercanas(paradas, activa, pedidos), [paradas, activa, pedidos]);
  const marcadas = abierta ? cercanas : NINGUNA;

  const enfocar = useCallback(
    ({ pedido }: Cercana) => {
      if (pedido.lat == null || pedido.lng == null) return;
      soltarMapa();
      setEnfoque({ lat: pedido.lat, lng: pedido.lng, clave: Date.now() });
    },
    [soltarMapa],
  );

  return { cercanas, marcadas, abierta, setAbierta, enfoque, enfocar };
}
