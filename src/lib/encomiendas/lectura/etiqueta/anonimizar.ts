// «Copiar anonimizado» (spec 021, US3): el texto que ML Kit leyó de una etiqueta
// real, sin ningún dato de la persona, para convertir una etiqueta que falló en
// terreno en una prueba nueva. Puro.
//
// Se queda igual lo que es FORMA y no dice quién es: las palabras clave tal como
// las leyó ML Kit (con sus errores, «0.F.», «Te1.»: es justo lo que la prueba
// tiene que reproducir), los signos, los saltos de línea, el largo de cada valor,
// los números de hasta 3 dígitos (bultos, peso, un número de casa sin su calle),
// los ceros a la izquierda y los prefijos fijos (el 9 del celular, el 58 de Arica,
// los primeros 10 dígitos del código de Starken, que son iguales en toda caja).
// Todo lo demás cambia: cada letra por otra letra y cada dígito por otro dígito.

import { CLAVES as CLAVES_LECTOR } from "./formatos";
import { comparable as sinTildes } from "./normalizar";

/** Palabras de la etiqueta que no son datos de nadie. Se comparan sin tildes, en
 *  mayúsculas y con los cambios típicos del lector (0↔O, 1↔I↔L, 5↔S). */
const PALABRAS_CLAVE = [
  // Marcas y servicios.
  "STARKEN", "EXPRES", "EXPRESS", "LION", "X", "MERCADO", "LIBRE", "MERCADOLIBRE", "ENVIOS",
  "SERVICIO", "NORMAL", "ENTREGA", "RETIRO", "AGENCIA", "SUCURSAL", "FRAGIL",
  // Las zonas de la etiqueta.
  "DESTINATARIO", "DESTINO", "REMITENTE", "ORIGEN", "DIRECCION", "DOMICILIO", "DIR", "REFERENCIA",
  "TEL", "TELEFONO", "FONO", "CEL", "CELULAR", "MOVIL", "RUT", "CORREO", "EMAIL", "MAIL",
  // Pago y bultos.
  "POR", "PAGAR", "PAGO", "CONTADO", "CTA", "CTE", "CUENTA", "CORRIENTE", "TOTAL", "MONTO", "OF",
  "BULTO", "BULTOS", "PESO", "KG", "CM", "VOLUMEN", "VALOR", "DECLARADO", "NETO", "IVA", "CLP",
  "PESOS", "ORDEN", "FLETE", "GUIA", "DESPACHO", "FECHA", "EMISION", "CONTENIDO", "OBS",
  "OBSERVACIONES", "NRO", "NUMERO", "N", "NO",
  // Lugares y la forma de una dirección (la calle y el número cambian).
  "ARICA", "PARINACOTA", "SANTIAGO", "CHILE", "CIUDAD", "COMUNA", "REGION", "CALLE", "PASAJE", "PJE",
  "AVENIDA", "AV", "AVDA", "POBLACION", "POB", "VILLA", "BLOCK", "DEPTO", "DPTO", "DEPARTAMENTO",
  "CASA", "SITIO", "LOTE", "PARCELA", "KM", "SN",
  // Palabras de unión.
  "DE", "DEL", "LA", "LAS", "LOS", "EL", "EN", "Y", "A", "AL", "CON", "SIN", "CL", "COM", "WWW",
].map(comparable);

const CLAVES = new Set(PALABRAS_CLAVE);

/** Lo que se deja tal cual aunque tenga puntos o signos adentro: «O.F.» (también
 *  «0.F.»), «R.U.T.», «N°», «CTA.CTE», «S/N» y la K del dígito verificador. */
const PROTEGIDO = /(?<![\p{L}\p{N}])(?:[O0]\s?\.\s?F\.?|R\.\s?U\.\s?T\.?|N\s?[°º]|CTA\.?\s?CTE\.?|S\/N)(?!\p{L})|(?<=\d-)[kK](?![\p{L}\p{N}])/iu;
/** Un número: dígitos sueltos o en grupos separados por un espacio, un punto, un
 *  guion o una coma («9 1234 5678», «12.990», «11.111.111-1», y la OF impresa
 *  «200,000,456»: sin la coma, cada grupo de 3 pasaba como número corto y la OF
 *  quedaba entera, terreno 2026-11-08). */
const NUMERO = /(?<![\p{L}\p{N}])\+?\d(?:\d|[ .,-](?=\d))*(?![\p{L}\p{N}])/u;
/** Una palabra (puede traer dígitos, como «Te1»). */
const PALABRA = /[\p{L}\p{N}]+/u;

const PIEZA = new RegExp(`(${PROTEGIDO.source})|(${NUMERO.source})|(${PALABRA.source})`, "giu");

const VOCALES = "AEIOU";
const CONSONANTES = "BCDFGHJKLMNPQRSTVWXYZ";

function comparable(palabra: string): string {
  return palabra
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/[1L]/g, "I")
    .replace(/5/g, "S");
}

/** Un elemento al azar de `opciones` que no sea `distinto`. */
function otro(opciones: string, distinto: string, azar: () => number): string {
  const posibles = opciones.replace(distinto, "");
  return posibles[Math.floor(azar() * posibles.length) % posibles.length];
}

function otraLetra(letra: string, azar: () => number): string {
  const base = letra.normalize("NFD").replace(/\p{M}/gu, "");
  const mayuscula = base.toUpperCase();
  const nueva = otro(VOCALES.includes(mayuscula) ? VOCALES : CONSONANTES, mayuscula, azar);
  return letra === letra.toLowerCase() && letra !== letra.toUpperCase() ? nueva.toLowerCase() : nueva;
}

/** Cada dígito por otro, sin tocar los separadores. Se dejan los primeros
 *  `fijos` dígitos y los últimos `finales`; los ceros a la izquierda siguen
 *  siendo ceros y el primer dígito que no es cero nunca pasa a ser cero (un
 *  monto no empieza en 0). */
function otrosDigitos(numero: string, fijos: number, finales: number, azar: () => number): string {
  const total = numero.replace(/\D/g, "").length;
  let i = 0;
  let enCerosIniciales = true;
  let salida = "";
  for (const c of numero) {
    if (!/\d/.test(c)) {
      salida += c;
      continue;
    }
    const pos = i++;
    const primeroNoCero = enCerosIniciales && c !== "0";
    if (c !== "0") enCerosIniciales = false;
    const queda = pos < fijos || pos >= total - finales || (enCerosIniciales && c === "0");
    salida += queda ? c : otro(primeroNoCero ? "123456789" : "0123456789", c, azar);
  }
  return salida;
}

/** Un teléfono inventado a la vista: el prefijo y después 1234…, 2345…, uno
 *  distinto por teléfono. Al azar podía salir el número de alguien. */
function telefonoFalso(numero: string, fijos: number, k: number): string {
  const falso = (desde: number) => {
    let i = 0;
    let j = 0;
    return [...numero].map((c) => (/\d/.test(c) && i++ >= fijos ? "1234567890"[(desde + j++) % 10] : c)).join("");
  };
  const uno = falso(k);
  return uno === numero ? falso(k + 1) : uno;
}

function anonimizarNumero(numero: string, azar: () => number, telefonos: { vistos: number }): string {
  const d = numero.replace(/\D/g, "");
  if (d.length <= 3) return numero;
  // El código de barras de Starken: 92 + 8 dígitos fijos; el bulto al final.
  if (d.length === 26 && d.startsWith("92")) return otrosDigitos(numero, 10, 3, azar);
  // Celular (+56 9…) y fijo de Arica (+56 58…): el prefijo es forma, no dato.
  const fijos =
    d.length === 11 && d.startsWith("5658") ? 4
    : d.length === 11 && d.startsWith("569") ? 3
    : d.length === 9 && d.startsWith("58") ? 2
    : d.length === 9 && d.startsWith("9") ? 1
    : -1;
  if (fijos >= 0) return telefonoFalso(numero, fijos, telefonos.vistos++);
  return otrosDigitos(numero, 0, 0, azar);
}

function anonimizarPalabra(palabra: string, azar: () => number): string {
  // «DESTINATARIO» mal leído también se queda: es el error que la prueba tiene
  // que reproducir (formatos.ts).
  if (CLAVES.has(comparable(palabra)) || CLAVES_LECTOR.destinatario.test(sinTildes(palabra))) return palabra;
  return [...palabra]
    .map((c) => (/\d/.test(c) ? otro("0123456789", c, azar) : /\p{L}/u.test(c) ? otraLetra(c, azar) : c))
    .join("");
}

/** El texto de la etiqueta sin datos de nadie (ver la cabecera). `azar` se
 *  cambia en las pruebas para que el resultado sea siempre el mismo. */
export function anonimizarEtiqueta(texto: string, azar: () => number = Math.random): string {
  const telefonos = { vistos: 0 };
  return texto.replace(PIEZA, (pieza, protegido?: string, numero?: string) => {
    if (protegido) return pieza;
    if (numero) return anonimizarNumero(pieza, azar, telefonos);
    return anonimizarPalabra(pieza, azar);
  });
}
