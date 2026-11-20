// Errores de lectura de la cámara en una dirección (spec 044). La nómina se lee con ML Kit:
// la «O» sale «0» («SANTIAG0», «OR0ZIMB0», «0TE»), la «I» sale «1» («1SLA»), se cuelan signos
// («914 ARICA |Des») y el número queda pegado a la palabra («N917DEPTO 318CONDOMINIO»).
// Medido en un día real de 72 pedidos (dueño, 2026-11-19): 16 de las 18 correcciones de la IA
// eran estos errores, y cada una le costó al conductor un «Confirmar».
//
// Puro y sin red. Lo que necesita el catálogo (la palabra que un salto de renglón partió en dos,
// «MOL INARES») está en calles.ts, `corregirConCatalogo`.

/** Signos que no van en una dirección. El «#», el «°» y el «/» sí: marcan el número. */
const SIGNOS_SUELTOS = /[|¦_~^*"“”«»<>{}[\]\\]/g;

/** «N917»: la N pegada al número es «número». */
const N_PEGADA = /\bn(?=\d)/gi;

/** «280DEPTO», «214CONDOMINIO»: el número pegado a la palabra que sigue. Una letra sola
 *  («1085B») es el depto y la saca la consulta. */
const NUMERO_PEGADO = /(\d)(\p{L}{3,})/gu;

/** «1ER», «2DO»: un ordinal, no una palabra mal leída. */
const ORDINAL = /^\d+(?:er|ro|do|to|vo|no|mo)\W*$/i;

const esLetra = (c: string) => /\p{L}/u.test(c);
const esDigito = (c: string) => /\d/.test(c);

/** En una palabra con letras, el 0 junto a una letra es una O y el 1, una I. Junto a otro dígito
 *  es parte de un número («917», «N917»). El 1 al final se queda («PASAJE1» es el pasaje 1); al
 *  comienzo, solo si siguen dos letras («1SLA»). */
function letrasEnPalabra(palabra: string): string {
  if (ORDINAL.test(palabra) || (palabra.match(/\p{L}/gu)?.length ?? 0) < 2) return palabra;
  return palabra.replace(/[01]/g, (d: string, i: number) => {
    const antes = palabra[i - 1] ?? "";
    const despues = palabra[i + 1] ?? "";
    if (esDigito(antes) || esDigito(despues)) return d;
    const entreLetras = esLetra(antes) && esLetra(despues);
    const alComienzo = !esLetra(antes) && esLetra(despues) && esLetra(palabra[i + 2] ?? "");
    const alFinal = esLetra(antes) && !esLetra(despues);
    if (!(entreLetras || alComienzo || (d === "0" && alFinal))) return d;
    const minuscula = /\p{Ll}/u.test(antes || despues);
    const letra = d === "0" ? "O" : "I";
    return minuscula ? letra.toLowerCase() : letra;
  });
}

/** Las palabras que se repiten a propósito en una calle de Arica («Colo Colo», «Llay Llay», «Luis
 *  Urzúa Urzúa», «Río Calle Calle»): esas no se juntan. Sacadas del catálogo (calles-arica.ts); una
 *  prueba avisa si el catálogo trae otra. */
export const REPETIDAS_EN_CALLES = new Set(["colo", "llay", "urzua", "calle"]);

const comparable = (p: string) => p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** «CALLE CABRERO CABRERO 942», «SANTIAGO ARATA SANTIAGO ARATA 943»: la misma palabra (o las mismas
 *  dos o tres) dos veces seguidas es una sola (dueño, 2026-11-20). Solo palabras de letras: el
 *  número repetido lo junta sinNumeroRepetido (consulta.ts). */
function sinPalabrasRepetidas(texto: string): string {
  const palabras = texto.split(" ");
  for (let largo = 3; largo >= 1; largo--) {
    for (let i = 0; i + 2 * largo <= palabras.length; i++) {
      const iguales = palabras
        .slice(i, i + largo)
        .every((p, k) => /^\p{L}{2,}$/u.test(p) && comparable(p) === comparable(palabras[i + largo + k]));
      const deUnaCalle = largo === 1 && REPETIDAS_EN_CALLES.has(comparable(palabras[i]));
      if (iguales && !deUnaCalle && (largo > 1 || palabras[i].length >= 3)) {
        palabras.splice(i + largo, largo);
        i--;
      }
    }
  }
  return palabras.join(" ");
}

/** La dirección como se quiso escribir: sin los errores de lectura de la cámara. Se aplica al
 *  destino leído (lo que ve el conductor) y a la consulta (lectura/guia.ts y consulta.ts). */
export function corregirLectura(texto: string): string {
  const limpio = texto
    .replace(SIGNOS_SUELTOS, " ")
    .replace(N_PEGADA, "")
    .split(/(\s+)/)
    .map((p) => (/\s/.test(p) ? p : letrasEnPalabra(p)))
    .join("")
    .replace(NUMERO_PEGADO, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return sinPalabrasRepetidas(limpio);
}
