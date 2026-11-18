// Lo que el teléfono recuerda en memoria durante el día, con direcciones y puntos de
// destinatarios (spec 007, Ley 21.719): se olvida junto con los datos del día. Spec 038: antes
// cada lugar que borraba llamaba a su lista y se quedaban cosas afuera (la última propuesta de
// ruta no se olvidaba nunca; los accesos, solo al cerrar el día). Ahora es una sola lista.
//
// La llaman el cierre del día y el borrado de la sesión (almacen/borrado.ts), salir del modo
// prueba (modo-prueba.ts) y el cierre en pantalla (use-cierre-dia.ts).
//
// Fuera de la lista, a propósito: las estampillas del mapa (components/direccion/estampilla-mapa)
// viven en components/ y lib no las puede importar (A1); las olvida use-cierre-dia por su lado.

import { olvidarConsultasGoogle } from "@/lib/geo/geocoding/google";
import { olvidarConsultasNominatim } from "@/lib/geo/geocoding/nominatim";
import { olvidarMatriz } from "@/lib/geo/matriz";
import { olvidarUltimaPropuesta } from "./generar-ruta";
import { olvidarAccesos } from "./generar-ruta/ubicar-pedidos";

export function olvidarMemoriasDelDia(): void {
  // Las respuestas de los buscadores: direcciones de destinatarios.
  olvidarConsultasGoogle();
  olvidarConsultasNominatim();
  // Las distancias entre los puntos de las paradas.
  olvidarMatriz();
  // Los accesos revisados, por punto de cada parada.
  olvidarAccesos();
  // La última ruta propuesta: trae los pedidos con nombre y dirección.
  olvidarUltimaPropuesta();
}
