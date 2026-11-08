// Las zonas de la etiqueta (spec 021): cada renglón es del destinatario, del
// remitente o general. Puro.
//
// El teléfono, el nombre y la dirección salen de la zona del DESTINATARIO, nunca
// de la del remitente: el lector de antes tomaba el primer «Tel.», y si el
// remitente iba arriba se llevaba su teléfono. Un ancla (DESTINATARIO,
// REMITENTE) abre su zona; la del remitente se cierra con lo que ya no es suyo
// (el pago, los bultos, la OF, el código). Lo de antes del primer ancla es
// general.

import { CIERRAN_REMITENTE, CLAVES, CODIGO_IMPRESO, esCtaCteConNumero } from "./formatos";
import type { Renglon } from "./normalizar";

export type Zona = "destinatario" | "remitente" | "general";

export function zonas(lista: Renglon[]): Zona[] {
  let actual: Zona = "general";
  return lista.map(({ texto, comparable }, i) => {
    if (CLAVES.destinatario.test(comparable)) actual = "destinatario";
    else if (CLAVES.remitente.test(comparable)) actual = "remitente";
    else if (
      actual === "remitente" &&
      (CIERRAN_REMITENTE.some((c) => c.test(comparable)) ||
        esCtaCteConNumero(comparable, lista[i + 1]?.comparable) ||
        CODIGO_IMPRESO.test(texto.replace(/\s/g, "")))
    ) {
      actual = "general";
    }
    return actual;
  });
}
