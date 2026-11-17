// Los interruptores del barrido de la nómina que se cambian en Diagnóstico para medir con
// la misma nómina, alternando (spec 036). Se guardan en el teléfono. Lo que no está medido
// con una nómina real parte apagado, como las piezas de la spec 034.

export type AjusteBarrido = "decidirConCadaCuadro" | "flechasAHuecos" | "botarFantasmas";

const CLAVES: Record<AjusteBarrido, string> = {
  decidirConCadaCuadro: "ares.barrido-decidir-cada-cuadro",
  flechasAHuecos: "ares.barrido-flechas-huecos",
  botarFantasmas: "ares.barrido-botar-fantasmas",
};

/** Cómo parte cada uno. Decidir con cada cuadro va prendido: no cambia lo que se decide,
 *  solo cuándo (el verde llega antes). Los huecos y los fantasmas, apagados hasta medirlos. */
const POR_DEFECTO: Record<AjusteBarrido, boolean> = {
  decidirConCadaCuadro: true,
  flechasAHuecos: false,
  botarFantasmas: false,
};

export function ajusteDelBarrido(ajuste: AjusteBarrido): boolean {
  try {
    const guardado = globalThis.localStorage?.getItem(CLAVES[ajuste]);
    return guardado === "si" ? true : guardado === "no" ? false : POR_DEFECTO[ajuste];
  } catch {
    return POR_DEFECTO[ajuste];
  }
}

export function elegirAjusteDelBarrido(ajuste: AjusteBarrido, prendido: boolean): void {
  try {
    globalThis.localStorage?.setItem(CLAVES[ajuste], prendido ? "si" : "no");
  } catch {
    // Sin localStorage queda como parte.
  }
}
