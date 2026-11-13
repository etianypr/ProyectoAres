"use client";

// La parada activa con todo lo que la rodea: sus acciones (use-acciones-parada.ts),
// en qué paso está, las paradas en su mismo punto y lo que hace cada botón, para
// la tarjeta y la burbuja por igual (sale de pantalla.tsx, spec 033). Un toque muy
// pegado a un cambio de parada se ignora (use-guarda-toque.ts).

import { useMemo } from "react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { minutoDelDia } from "@/lib/encomiendas/local/planificar";
import { atenderBoton, type AccionesParada, type ExtraBotones, type IdBoton } from "./botones-parada";
import type { DiaEnCurso, Parada } from "./dia-trabajo-tipos";
import { bloquesPorDelante, faseDeParada } from "./fase-parada";
import { paradasJuntas } from "./misma-direccion";
import { useAccionesParada } from "./use-acciones-parada";
import { useGuardaToque } from "./use-guarda-toque";

export function useParadaEnCurso({
  dia,
  fecha,
  onEditar,
  onEscanear,
}: {
  dia: DiaEnCurso;
  fecha: string;
  onEditar: (pedido: Pedido) => void;
  /** Escanear la etiqueta de ESTA parada (spec 033, escanear-parada). */
  onEscanear: (parada: Parada) => void;
}) {
  const { paradas, activa } = dia;
  const juntas = useMemo(() => paradasJuntas(paradas, activa), [paradas, activa]);
  const ap = useAccionesParada({ dia, activa, fecha, juntas });
  const fase = faseDeParada(activa, ap);
  const pendientes = paradas.filter((p) => p.pedido.resultado === "pendiente").length;
  const extra: ExtraBotones = { pendientes, bloques: bloquesPorDelante(minutoDelDia()), juntas: juntas.length };

  const acciones: AccionesParada = {
    llamar: () => activa && ap.onLlamar(activa),
    escanear: () => activa && onEscanear(activa),
    editar: () => activa && onEditar(activa.pedido),
    finalizar: () => void ap.onPedidoFinalizado(),
    noSePudo: () => activa && ap.setDandoResultadoDe(activa.pedido.id),
    salida: (salida) => void ap.onSalida(salida),
    otraHora: () => activa && ap.setEligiendoHoraDe(activa.pedido.id),
    hora: (bloqueId) => void ap.onHora(bloqueId),
    todos: () => void ap.onPedidoFinalizado(true),
    soloEste: () => void ap.onPedidoFinalizado(false),
    volver: () => {
      // De los bloques se vuelve a las salidas; de lo demás, a la parada.
      if (ap.eligiendoHoraDe) return ap.setEligiendoHoraDe(null);
      ap.setJuntasDe(null);
      ap.setDandoResultadoDe(null);
    },
    deshacer: () => void ap.onDeshacer(),
  };

  // Spec 033, nuevo-doble-toque: la parada (o su paso) recién cambiada no
  // atiende el toque que venía para la anterior.
  const vale = useGuardaToque(`${activa?.pedido.id ?? ""}:${fase}`);
  const onBoton = (id: IdBoton) => {
    if (vale(id)) atenderBoton(id, acciones);
  };

  return { ...ap, juntas, fase, extra, acciones, onBoton };
}
