"use client";

// Lo que cambia el orden de la ruta en curso y se puede deshacer (spec 033):
// «Dejar como pendiente», «Ahora», «Pidió otra hora» y una dirección cambiada a
// otro lugar. Ninguno deja evento en la cola, así que «Deshacer» es volver al
// orden de antes, solo en el teléfono (lib/encomiendas/local/reubicar.ts). El
// trazado gris se rehace en segundo plano: el orden queda al tiro, sin señal.

import { useCallback, useEffect, useState } from "react";
import { bloquePorId } from "@/lib/encomiendas/config";
import { formatoOf } from "@/lib/encomiendas/paquete";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import {
  leerOrdenPendiente,
  pedirOtraHora,
  retrazarRuta,
  reubicarPorPunto,
  volverAlOrden,
  type Reorden,
} from "@/lib/encomiendas/local/reubicar";
import type { Coordenada } from "@/lib/geo/coordenada";
import type { DiaEnCurso } from "./dia-trabajo-tipos";

/** Lo mismo que el «Deshacer» de una entrega (MS_DESHACER en use-dia-trabajo). */
const MS_DESHACER_ORDEN = 8_000;

export type Reordenado = { texto: string; reorden: Reorden; n: number };

export function useReordenar({
  fecha,
  dia,
  correr,
  avisar,
}: {
  fecha: string;
  dia: DiaEnCurso;
  /** Envuelve una escritura: null si falló (el error queda a la vista). */
  correr: <T>(accion: () => Promise<T>) => Promise<T | null>;
  /** Una confirmación sin «Deshacer». */
  avisar: (texto: string) => void;
}) {
  const [reordenado, setReordenado] = useState<Reordenado | null>(null);
  // La parada activa cambió de lugar: «Seguir con esta» o «Moverla».
  const [moverActiva, setMoverActiva] = useState<{ pedidoId: string; antes: Coordenada } | null>(null);
  const { recargar } = dia;

  useEffect(() => {
    if (!reordenado) return;
    const reloj = window.setTimeout(() => setReordenado(null), MS_DESHACER_ORDEN);
    return () => clearTimeout(reloj);
  }, [reordenado]);

  const retrazar = useCallback(() => {
    void retrazarRuta(fecha).then((cambio) => {
      if (cambio) void recargar();
    });
  }, [fecha, recargar]);

  const ofrecer = (texto: string, reorden: Reorden) => setReordenado((r) => ({ texto, reorden, n: (r?.n ?? 0) + 1 }));

  async function dejarPendiente(pedidoId: string): Promise<void> {
    const ordenAntes = await leerOrdenPendiente(fecha).catch(() => null);
    const r = await correr(async () => ({ lugar: await dia.dejarParaElFinal(pedidoId) }));
    if (!r) return;
    // La parada desaparece de arriba: se dice DÓNDE quedó, con «Deshacer».
    const texto = r.lugar == null ? "Se reintenta al final de la ruta" : `Se reintenta más tarde: quedó ${r.lugar}.ª en la fila`;
    if (ordenAntes) ofrecer(texto, { ordenAntes });
    retrazar();
  }

  /** «Ahora» (spec 023): el aviso nombra la OF, no el número que tenía antes. */
  async function ahora(c: { pedido: Pedido; secuencia: number | null }): Promise<boolean> {
    const ordenAntes = await leerOrdenPendiente(fecha).catch(() => null);
    const hecho = await correr(async () => {
      await dia.hacerAhora(c.pedido.id);
      return true;
    });
    if (!hecho) return false;
    const quien = c.pedido.of ? `OF ${formatoOf(c.pedido.of)}` : "La parada";
    // Uno de afuera de la ruta no se saca con «Deshacer» (volver al orden lo
    // dejaría al final): se avisa sin él.
    if (c.secuencia != null && ordenAntes) ofrecer(`${quien} queda como la próxima`, { ordenAntes });
    else avisar(c.secuencia == null ? `${quien} entró a la ruta como la próxima` : `${quien} queda como la próxima`);
    retrazar();
    return true;
  }

  async function otraHora(pedidoId: string, bloqueId: string): Promise<void> {
    const r = await correr(() => pedirOtraHora(fecha, pedidoId, bloqueId));
    if (!r) return;
    await recargar();
    const bloque = bloquePorId(bloqueId)?.etiqueta ?? "otro horario";
    ofrecer(r.parada == null ? `Pidió ${bloque}` : `Pidió ${bloque}: pasa a la parada ${r.parada}`, r);
    retrazar();
  }

  /** Se guardó el pedido con otra dirección (spec 033, cambio-dir-ruta). `antes`
   *  es el pedido como estaba al abrir el formulario. */
  async function direccionCambiada(antes: Pedido): Promise<void> {
    if (antes.lat == null || antes.lng == null) return;
    const punto = { lat: antes.lat, lng: antes.lng };
    const r = await correr(() => reubicarPorPunto(fecha, antes.id, punto));
    if (r?.tipo === "activa") setMoverActiva({ pedidoId: antes.id, antes: punto });
    if (r?.tipo !== "movida") return;
    await recargar();
    ofrecer(`Se movió a la ${r.parada}.ª parada`, r);
    retrazar();
  }

  async function moverLaActiva(): Promise<void> {
    const m = moverActiva;
    setMoverActiva(null);
    if (!m) return;
    const r = await correr(() => reubicarPorPunto(fecha, m.pedidoId, m.antes, { moverActiva: true }));
    if (r?.tipo !== "movida") return;
    await recargar();
    ofrecer(`Se movió a la ${r.parada}.ª parada`, r);
    retrazar();
  }

  function seguirConLaActiva(): void {
    setMoverActiva(null);
    // Sigue siendo la próxima, pero el punto cambió: la línea gris también.
    retrazar();
  }

  async function deshacerReorden(): Promise<void> {
    const r = reordenado;
    setReordenado(null);
    if (!r) return;
    await correr(() => volverAlOrden(fecha, r.reorden));
    await recargar();
    retrazar();
  }

  return {
    reordenado,
    moverActiva,
    dejarPendiente,
    ahora,
    otraHora,
    direccionCambiada,
    moverLaActiva,
    seguirConLaActiva,
    deshacerReorden,
  };
}
