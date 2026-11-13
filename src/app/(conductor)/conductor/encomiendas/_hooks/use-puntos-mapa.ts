"use client";

// Lo que se dibuja en el mapa: las paradas de la ruta y, si hay una propuesta a la
// vista, las suyas con su trazado (sale de pantalla.tsx, spec 002 T036). Con la
// lista de cercanas abierta, esas van marcadas, y la de fuera de la ruta con «+»
// (spec 023). Sin ruta, los pedidos del día con punto (spec 033, mapa-pedidos): «!»
// los que tienen ⚠ y «•» los demás, para ver dónde cae cada uno antes de armarla.

import { useMemo } from "react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import type { PreviaRuta, PuntoMapa } from "../_mapa/ruta-mapa";
import type { Parada } from "./use-dia-trabajo";
import type { Cercana } from "./paradas-cercanas";

export function usePuntosMapa(
  paradas: Parada[],
  activa: Parada | null,
  propuesta: PropuestaRuta | null,
  cercanas: Cercana[] = [],
  pedidos: Pedido[] = [],
): { puntos: PuntoMapa[]; previa: PreviaRuta | null } {
  // Memorizado a propósito: el mapa usa esta lista como dependencia de sus
  // efectos, y si se recreara en cada dibujado (la ubicación GPS re-dibuja
  // seguido) volvería a re-encuadrar el mapa una y otra vez.
  const puntos: PuntoMapa[] = useMemo(() => {
    const marcadas = new Set(cercanas.map((c) => c.pedido.id));
    const deLaRuta = paradas
      .filter((p) => p.pedido.lat != null && p.pedido.lng != null)
      .map((p) => ({
        id: p.pedido.id,
        lat: p.pedido.lat!,
        lng: p.pedido.lng!,
        label: String(p.secuencia),
        direccion: p.pedido.direccion,
        activa: p.pedido.id === activa?.pedido.id,
        completada: p.pedido.resultado === "entregado",
        resaltada: marcadas.has(p.pedido.id),
      }));
    // Las de fuera de la ruta no tienen número: solo se ven con la lista abierta.
    const deAfuera = cercanas
      .filter((c) => c.secuencia == null)
      .map((c) => ({
        id: c.pedido.id,
        lat: c.pedido.lat!,
        lng: c.pedido.lng!,
        label: "+",
        direccion: c.pedido.direccion,
        activa: false,
        completada: false,
        resaltada: true,
      }));
    // Sin ruta: los pedidos pendientes con punto, sin número.
    const delDia =
      paradas.length > 0
        ? []
        : pedidos
            .filter((p) => p.resultado === "pendiente" && p.lat != null && p.lng != null)
            .map((p) => ({
              id: p.id,
              lat: p.lat!,
              lng: p.lng!,
              label: problemasDelPedido(p).length > 0 ? "!" : "•",
              direccion: p.direccion,
              activa: false,
              completada: false,
            }));
    return [...deLaRuta, ...deAfuera, ...delDia];
  }, [paradas, activa, cercanas, pedidos]);

  const previa = useMemo<PreviaRuta | null>(
    () =>
      propuesta
        ? {
            puntos: propuesta.paradas.map((p, i) => ({
              id: p.id,
              lat: p.lat,
              lng: p.lng,
              label: String(propuesta.cerradas + i + 1),
              direccion: p.direccion,
              activa: false,
              completada: false,
            })),
            trazado: propuesta.trazado,
          }
        : null,
    [propuesta],
  );

  return { puntos, previa };
}
