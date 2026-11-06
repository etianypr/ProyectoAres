// Lo que hace dudar de un pedido (⚠) y se sabe con lo que el pedido ya tiene
// guardado (spec 027, FR-006): sin punto en el mapa, una OF que no tiene
// exactamente 9 dígitos (menos o más) o una OF que la guía no dejó leer. La hoja
// los muestra primero, con el problema en palabras y no solo con un color.
//
// La spec 022 le suma los que hay que guardar porque no se deducen del pedido:
// la calle que existe en varios sectores y los que aparecen al escanear.
//
// Recibe solo los campos que mira, sin el tipo `Pedido` del teléfono: así no
// arrastra `local/` a nadie que lo importe.

import { ofDistinta } from "./paquete";

export type TipoProblema = "sin_ubicar" | "of_distinta" | "sin_of";

export type ProblemaPedido = { tipo: TipoProblema; texto: string };

export function problemasDelPedido(p: {
  lat: number | null;
  lng: number | null;
  of: string | null;
  origenCarga: string;
}): ProblemaPedido[] {
  const problemas: ProblemaPedido[] = [];
  // Primero el que deja al pedido fuera de la ruta.
  if (p.lat == null || p.lng == null) problemas.push({ tipo: "sin_ubicar", texto: "Sin ubicar" });
  if (p.of && ofDistinta(p.of)) {
    const n = p.of.length;
    problemas.push({ tipo: "of_distinta", texto: `OF de ${n} ${n === 1 ? "dígito" : "dígitos"}` });
  }
  // Uno cargado a mano puede no tener OF y no es un problema. Uno de la guía sin
  // OF no se va a poder enlazar con su etiqueta al escanear.
  if (!p.of && p.origenCarga.startsWith("guia")) problemas.push({ tipo: "sin_of", texto: "No se leyó la OF" });
  return problemas;
}
