// Escanear desde la parada (spec 033, escanear-parada): el escáner sabe qué paquete
// se espera y, si el leído es de otra parada, lo dice en vez de darlo por bueno.
// Puro: lo dibuja _componentes/aviso-otra-parada.tsx.

import { formatoOf } from "@/lib/encomiendas/paquete";
import type { ResultadoEscaneo } from "@/lib/encomiendas/local/almacen";

/** La parada desde la que se abrió el escáner. */
export type PaqueteEsperado = { pedidoId: string; secuencia: number; of: string | null };

/** El título del escáner abierto desde la parada: «Parada 4 · OF 123 456 789». */
export function tituloEsperado(e: PaqueteEsperado): string {
  return e.of ? `Parada ${e.secuencia} · OF ${formatoOf(e.of)}` : `Parada ${e.secuencia}`;
}

/** Qué decir si el paquete leído no es el de la parada; null si es el mismo. */
export function textoOtraParada(e: PaqueteEsperado | null, r: Pick<ResultadoEscaneo, "pedido" | "parada">): string | null {
  if (!e || r.pedido.id === e.pedidoId) return null;
  return r.parada ? `Este paquete es de la parada ${r.parada.n}, no de esta.` : "Este paquete no está en la ruta: no es de esta parada.";
}
