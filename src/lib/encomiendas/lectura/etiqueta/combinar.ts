// Dos lecturas de la misma foto de la etiqueta (spec 021). El dueño: «es más
// importante que se demore más en procesar y que todos los datos importantes
// estén bien» (2026-11-08). ML Kit lee la foto a dos tamaños; esto las junta.
// Puro.
//
//   · Lo que sale igual en las dos queda firme.
//   · Lo que vio solo una se toma (la otra no lo encontró, no lo contradijo).
//   · Lo que se contradice queda por revisar, y no se usa a ciegas: el pago y
//     el monto quedan sin leer (es plata del conductor), y la OF impresa no se
//     usa, ni para rechazar la foto ni para confirmarla.

import type { LecturaEtiqueta } from "./index";

type Campo = Exclude<keyof LecturaEtiqueta, "dudosos">;

/** El nombre de cada campo en `dudosos`. */
const DUDOSO_DE: Partial<Record<Campo, string>> = {
  destinatario: "destinatario",
  telefono: "telefono",
  porPagar: "pago",
  montoPorPagar: "montoPorPagar",
  direccion: "direccion",
};

const CAMPOS: Campo[] = ["ofImpresa", "bulto", "bultosTotal", "destinatario", "telefono", "direccion", "porPagar", "montoPorPagar"];

/** `alta` es la lectura de la foto más grande: manda cuando las dos dicen algo
 *  distinto y no hay por qué anular el campo. */
export function combinarLecturas(alta: LecturaEtiqueta, baja: LecturaEtiqueta): { lectura: LecturaEtiqueta; distintos: Campo[] } {
  const distintos: Campo[] = [];
  const valor = (campo: Campo) => {
    const a = alta[campo];
    const b = baja[campo];
    if (a === b || b === null) return a;
    if (a === null) return b;
    distintos.push(campo);
    return a;
  };
  const lectura = Object.fromEntries(CAMPOS.map((c) => [c, valor(c)])) as Omit<LecturaEtiqueta, "dudosos">;

  const contradice = (c: Campo) => distintos.includes(c);
  if (contradice("ofImpresa")) lectura.ofImpresa = null;
  if (contradice("porPagar")) Object.assign(lectura, { porPagar: null, montoPorPagar: null });
  if (contradice("montoPorPagar")) lectura.montoPorPagar = null;
  if (contradice("direccion")) lectura.direccion = null;
  if (contradice("bulto") || contradice("bultosTotal")) Object.assign(lectura, { bulto: null, bultosTotal: null });

  // Por revisar: lo que se contradijo, y lo que la lectura que dio el valor final
  // ya marcaba (dos teléfonos, un nombre con dígitos, nada leído…).
  const dudosos = new Set<string>();
  for (const [campo, clave] of Object.entries(DUDOSO_DE) as [Campo, string][]) {
    const final = lectura[campo];
    if (contradice(campo) || [alta, baja].some((x) => x[campo] === final && x.dudosos.includes(clave))) dudosos.add(clave);
  }
  if (lectura.porPagar === null) dudosos.add("pago");
  if (lectura.porPagar && lectura.montoPorPagar === null) dudosos.add("montoPorPagar");
  if (lectura.telefono === null) dudosos.add("telefono");
  return { lectura: { ...lectura, dudosos: [...dudosos] }, distintos };
}
