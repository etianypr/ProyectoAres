// En qué paso del día está el conductor (spec 027): es lo que decide qué dice la
// cabecera de la hoja y qué va adentro. Los pasos son los del flujo de
// AGENTS.md: cargar la guía, resolver los ⚠, armar la ruta, cargar el auto,
// recorrer y cerrar el día. Puro.

import { bultosIncompletos, sinEtiquetaEscaneada, type Pedido, type Ruta } from "@/lib/encomiendas/local/almacen";

export type Paso = "guia" | "resolver" | "ruta" | "carga" | "reparto" | "cierre";

export function pasoDelDia({
  hayRuta,
  hayActiva,
  pendientesFuera,
  conProblema,
  cargaTerminada,
}: {
  /** La ruta del día tiene paradas. */
  hayRuta: boolean;
  /** Queda una parada por cerrar. */
  hayActiva: boolean;
  /** Pedidos pendientes que no están en la ruta. */
  pendientesFuera: number;
  /** Cuántos de ellos tienen un ⚠ (problemasDelPedido). */
  conProblema: number;
  /** Ver cargaTerminada. */
  cargaTerminada: boolean;
}): Paso {
  if (hayRuta) {
    if (!hayActiva) return "cierre";
    return cargaTerminada ? "reparto" : "carga";
  }
  if (pendientesFuera === 0) return "guia";
  // Un ⚠ que no se arregla deja la cabecera en "resolver" hasta marcarlo («Va
  // igual», «Es así»), pero nunca bloquea: «Armar la ruta» pregunta y arma igual.
  return conProblema > 0 ? "resolver" : "ruta";
}

/** Si ya terminó de cargar el auto: salió a repartir (lo anotó él o el último
 *  escaneo, ver Ruta.inicioReparto), ya cerró alguna parada, o no queda paquete
 *  de la guía sin escanear, ni bultos sueltos de un envío (spec 022). Un día
 *  cargado a mano no tiene nada que escanear. */
export function cargaTerminada(ruta: Pick<Ruta, "inicioReparto"> | null, pedidos: Pedido[]): boolean {
  if (ruta?.inicioReparto) return true;
  if (pedidos.some((p) => p.resultado !== "pendiente")) return true;
  return sinEtiquetaEscaneada(pedidos).length === 0 && bultosIncompletos(pedidos).length === 0;
}
