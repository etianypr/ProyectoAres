// Lo que dibuja la burbuja sobre Google Maps y cuándo mandar Google Maps a otra
// parada (spec 020). Puro: lo usa use-burbuja.ts y lo prueban las pruebas.

import { formatCLP } from "@/lib/comun/format";
import { formatoOf, textoReferencia } from "@/lib/encomiendas/paquete";
import type { VistaBurbuja } from "@/lib/nativo/burbuja";
import type { Parada } from "./dia-trabajo-tipos";
import type { Fase } from "./fase-parada";
import { botonesDeParada, estadoDeParada } from "./botones-parada";

/** El aviso de abajo: lo último que se cerró (con "Deshacer") o una confirmación
 *  que ya no se puede deshacer. */
export type AvisoBurbuja = { texto: string; deshacer: boolean } | null;

/** La vista de la parada activa. Los botones y el estado son los de la tarjeta
 *  de ARES (botones-parada.ts); el título y el detalle, los de la franja que
 *  tenía la navegación de Google dentro de ARES (spec 019). El paquete y el POR
 *  PAGAR, los de la tarjeta (tarjeta-parada.tsx), para la burbuja compacta que
 *  eligió el dueño (2026-11-12, propuesta B). */
export function vistaDeBurbuja(
  activa: Parada,
  fase: Fase,
  { whatsapp, aviso, nueva }: { whatsapp: boolean; aviso: AvisoBurbuja; nueva: boolean },
): VistaBurbuja {
  const { pedido } = activa;
  const estado = estadoDeParada(activa, whatsapp);
  return {
    secuencia: activa.secuencia,
    titulo: pedido.of ? `OF ${formatoOf(pedido.of)}` : `Parada ${activa.secuencia}`,
    detalle: [pedido.nombre, pedido.direccion].filter(Boolean).join(" · "),
    paquete: textoReferencia(pedido.referencia),
    // Nunca se supone $0: sin monto, se dice que hay que revisarlo (spec 005).
    porPagar: pedido.porPagar
      ? `POR PAGAR ${pedido.montoPorPagar != null ? formatCLP(pedido.montoPorPagar) : "· monto por revisar"}`
      : null,
    estado: estado ? { texto: estado.texto, tono: estado.tono } : null,
    destino: pedido.lat != null && pedido.lng != null ? { lat: pedido.lat, lng: pedido.lng } : null,
    filas: botonesDeParada(activa, fase),
    aviso,
    nueva,
  };
}

/**
 * ¿Hay que mandar Google Maps a la parada activa? Con la burbuja en curso, cada
 * vez que cambia la parada activa —se cerró una, se deshizo, quedó una para
 * después— y la nueva tiene punto (FR-008). Devuelve el punto, o null.
 */
export function aDondeNavegar(
  enCurso: boolean,
  navegadaId: string | null,
  activa: Parada | null,
): { lat: number; lng: number } | null {
  if (!enCurso || !activa || activa.pedido.id === navegadaId) return null;
  const { lat, lng } = activa.pedido;
  return lat != null && lng != null ? { lat, lng } : null;
}
