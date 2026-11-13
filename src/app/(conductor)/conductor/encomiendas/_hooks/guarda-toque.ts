// El doble toque sobre la parada que aparece (spec 033, nuevo-doble-toque): al
// cerrar una parada, la siguiente aparece con sus botones en el MISMO lugar, y el
// segundo toque de un pulgar apurado (o con guantes) la cerraba también. Por un
// momento después de cambiar la parada (o su paso), sus botones no hacen nada.
// Puro: lo usan la tarjeta y la burbuja (use-guarda-toque.ts).

import type { IdBoton } from "./botones-parada";

/** Cuánto se ignoran los toques después de que cambió la parada o su paso. */
export const MS_TRAS_CAMBIO = 600;

/** Si el toque vale: «Deshacer» siempre; lo demás, pasado MS_TRAS_CAMBIO. */
export function toqueValido(id: IdBoton, cambioEn: number, ahora: number): boolean {
  if (id === "deshacer") return true;
  return ahora - cambioEn >= MS_TRAS_CAMBIO;
}
