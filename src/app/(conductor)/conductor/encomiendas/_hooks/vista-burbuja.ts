// Lo que dibuja la burbuja sobre Google Maps y cuándo mandar Google Maps a otra
// parada (spec 020). Puro: lo usa use-burbuja.ts y lo prueban las pruebas.

import { formatCLP } from "@/lib/comun/format";
import { direccionCorta } from "@/lib/encomiendas/direccion-corta";
import { formatoOf, textoReferencia } from "@/lib/encomiendas/paquete";
import { destinoParaNavegar } from "@/lib/geo/ruta-por-calles";
import type { SiguienteBurbuja, VistaBurbuja } from "@/lib/nativo/burbuja";
import type { Parada } from "./dia-trabajo-tipos";
import type { Fase } from "./fase-parada";
import { botonesDeParada, estadoDeParada, type ExtraBotones } from "./botones-parada";
import { pagoDelPedido, porPagarPorRevisar } from "./por-pagar";

/** El aviso de abajo: lo último que se cerró (con "Deshacer") o una confirmación
 *  que ya no se puede deshacer. */
export type AvisoBurbuja = { texto: string; deshacer: boolean } | null;

/** Cuántas paradas que siguen se pueden llamar desde la burbuja (spec 046). */
export const SIGUIENTES_EN_BURBUJA = 3;

/** Las pendientes que siguen a la activa, en el orden de la ruta. */
export function siguientesParadas(paradas: readonly Parada[], activa: Parada, n = SIGUIENTES_EN_BURBUJA): Parada[] {
  const i = paradas.findIndex((p) => p.pedido.id === activa.pedido.id);
  return paradas
    .slice(i + 1)
    .filter((p) => p.pedido.resultado === "pendiente")
    .slice(0, n);
}

function siguienteDeBurbuja({ secuencia, pedido }: Parada): SiguienteBurbuja {
  return { id: pedido.id, secuencia, ...direccionCorta(pedido.direccion), nombre: pedido.nombre || null, conTelefono: Boolean(pedido.telefono) };
}

/** La vista de la parada activa. Los botones y el estado son los de la tarjeta
 *  de ARES (botones-parada.ts). Desde la spec 046 (APK 1.11.0) la burbuja dibuja la
 *  dirección, el nombre, la foto, la OF, el pago y las siguientes; el título, el
 *  detalle, el paquete y el POR PAGAR de antes siguen para la APK 1.10. */
export function vistaDeBurbuja(
  activa: Parada,
  fase: Fase,
  {
    whatsapp,
    aviso,
    nueva,
    extra,
    adelante = null,
    paradas = [],
    foto = null,
  }: {
    whatsapp: boolean;
    aviso: AvisoBurbuja;
    nueva: boolean;
    extra?: ExtraBotones;
    /** «⚠ En 2 paradas…» cuando el renglón de aviso está ocupado (un «Deshacer»):
     *  va en el del estado, para que no se tape (spec 033, burbuja-permiso). */
    adelante?: string | null;
    /** Las paradas del día, para las siguientes (spec 046). */
    paradas?: readonly Parada[];
    /** La miniatura de la foto del paquete, ya hecha (use-miniatura-foto.ts). */
    foto?: string | null;
  },
): VistaBurbuja {
  const { pedido } = activa;
  // Sin «Contestó» (dueño, 2026-11-20): del receptor queda solo el horario que pidió.
  const estadoReceptor = estadoDeParada(activa, whatsapp);
  const horario = estadoReceptor?.icono === "reloj" ? estadoReceptor : null;
  const estado = adelante ? { texto: adelante, tono: "marca" as const } : horario;
  const pago = pagoDelPedido(pedido);
  return {
    secuencia: activa.secuencia,
    titulo: pedido.of ? `OF ${formatoOf(pedido.of)}` : `Parada ${activa.secuencia}`,
    detalle: [pedido.nombre, pedido.direccion].filter(Boolean).join(" · "),
    paquete: textoReferencia(pedido.referencia),
    // Nunca se supone $0: sin monto, se dice que hay que revisarlo (spec 005).
    porPagar: pedido.porPagar
      ? `POR PAGAR ${pedido.montoPorPagar != null ? formatCLP(pedido.montoPorPagar) : "· monto por revisar"}`
      : porPagarPorRevisar(pedido)
        ? "POR PAGAR por revisar ⚠"
        : null,
    estado: estado ? { texto: estado.texto, tono: estado.tono } : null,
    // El «Navegar» de la burbuja: en un condominio, su entrada (spec 031).
    destino: pedido.lat != null && pedido.lng != null ? destinoParaNavegar({ lat: pedido.lat, lng: pedido.lng }) : null,
    filas: botonesDeParada(activa, fase, extra),
    aviso,
    nueva,
    ...direccionCorta(pedido.direccion),
    nombre: pedido.nombre || null,
    of: pedido.of ? formatoOf(pedido.of) : null,
    pago: pago && { tipo: pago.tipo, monto: pago.tipo === "cobro" && pago.monto != null ? formatCLP(pago.monto) : null },
    foto,
    siguientes: siguientesParadas(paradas, activa).map(siguienteDeBurbuja),
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
  return lat != null && lng != null ? destinoParaNavegar({ lat, lng }) : null;
}
