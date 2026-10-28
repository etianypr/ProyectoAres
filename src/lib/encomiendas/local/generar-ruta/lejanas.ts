// Paradas que quedan lejos de todas las demás (terreno 2026-10-28). En una ruta
// de 56 km, una sola dirección —ubicada en la mitad de una calle de 5 km—
// sumaba 15,8 km. El orden ya era el mejor para esos puntos: lo que había que
// mirar era el punto. La propuesta lo avisa con lo que cuesta, y el conductor
// decide: revisar la dirección o sacar el pedido. Puro.

import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import type { MetrosEntre } from "../planificar";
import type { VueltaABase } from "./estrategias";
import type { PedidoUbicado } from "./tipos";

/** Más lejos que esto de cualquier otra parada y de la central, en línea recta. */
const METROS_SOLA = 2000;
/** Y que pasar por ella sume al menos esto a la ruta. */
const METROS_SUMA = 4000;

export type ParadaLejana = {
  pedidoId: string;
  direccion: string;
  /** A cuánto queda de la parada (o la central) más cercana, en línea recta. */
  metrosAlResto: number;
  /** Lo que suma pasar por ella, por calle, con el orden propuesto. */
  metrosQueSuma: number;
};

export function paradasLejanas(
  paradas: PedidoUbicado[],
  base: Coordenada,
  metros: MetrosEntre,
  vuelta: VueltaABase,
): ParadaLejana[] {
  return paradas.flatMap((p, i) => {
    const otros = [base, ...paradas.filter((q) => q.id !== p.id)];
    const alResto = Math.min(...otros.map((q) => distanciaMetros(p, q)));
    if (alResto < METROS_SOLA) return [];
    const antes = i > 0 ? paradas[i - 1] : null;
    const despues = i < paradas.length - 1 ? paradas[i + 1] : null;
    // Ir a ella y seguir, contra ir derecho de la anterior a la siguiente. Al
    // final de la ruta, lo que sigue es volver a la central.
    const conElla = metros(antes, p) + (despues ? metros(p, despues) : vuelta(p));
    const sinElla = despues ? metros(antes, despues) : antes ? vuelta(antes) : 0;
    const suma = conElla - sinElla;
    return suma >= METROS_SUMA
      ? [{ pedidoId: p.id, direccion: p.direccion, metrosAlResto: Math.round(alResto), metrosQueSuma: Math.round(suma) }]
      : [];
  });
}
