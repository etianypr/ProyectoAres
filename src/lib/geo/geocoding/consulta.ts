// El texto de una dirección, antes y después de preguntarle a un proveedor:
// limpiarlo para la consulta, partirlo en calle y número, y decidir si el nombre
// de calle que devolvió el proveedor (o el catálogo) es el que se escribió.
//
// Todo es puro y sin red: se prueba con texto y nada más (spec 016).

// ----------------------------------------------------------------------------
// Normalizar la dirección ANTES de buscarla
// ----------------------------------------------------------------------------
//
// Lo que se escribe y lo que un geocodificador entiende no son lo mismo. Los
// arreglos, todos medidos contra direcciones reales de la operación:
//
//   1. Las abreviaturas. "Av. Chacabuco" y "Avda Chacabuco" son la misma calle,
//      pero Mapbox y Nominatim las puntúan distinto según cómo vengan escritas.
//   2. El "#" y el "N°" del número. "Chacabuco #500" le hace perder el número a
//      Nominatim, que lo trata como parte del nombre de la calle. Y lo que viene
//      DESPUÉS de "# 406" ("# 406 1") es el depto: se corta ahí.
//   3. Lo que va DESPUÉS del número: "depto 42", "casa B", "block 3", "1085 B",
//      "406-1", "cerro La Cruz", ", Arica". Es información que el conductor
//      necesita para tocar el timbre correcto, pero para el geocodificador es
//      ruido que empuja el resultado a otra cuadra.
//   4. Los ceros a la izquierda de la guía de Starken ("0428", "064"): Mapbox
//      busca el "0428" como texto y no encuentra la puerta 428.
//
// OJO con el punto 3: se saca de la CONSULTA, no de la dirección guardada. El
// pedido conserva el texto entero — sin el "depto 42" el conductor llega al
// edificio y no sabe a qué puerta ir.

// OJO CON EL ORDEN DE `\b` Y EL PUNTO, que es donde esto se rompió una vez: el
// límite de palabra va ANTES del punto opcional, no después. Escrito al revés
// (`\bav\.?\b`), "Av." dejaba el punto sin consumir y quedaba "avenida.
// Chacabuco" — una consulta que ningún proveedor resuelve. Pasa porque entre "."
// y " " no hay límite de palabra, así que el motor prefiere no consumir el punto.
const ABREVIATURAS: [RegExp, string][] = [
  [/\bav(?:da|e)?\b\.?/gi, "avenida"],
  [/\bps?je\b\.?/gi, "pasaje"],
  [/\bpob(?:la?)?\b\.?/gi, "población"],
  [/\bvill\b\.?/gi, "villa"],
  [/\bcond\b\.?/gi, "condominio"],
  [/\bcje\b\.?/gi, "callejón"],
  // "N°", "Nº", "No." antes de un número: es "acá viene el número".
  [/\bn[°ºo]\.?\s*(?=\d)/gi, ""],
  // El "#" va aparte y SIN `\b`: "#" no es un carácter de palabra, así que entre
  // el espacio anterior y el "#" no hay ningún límite que anclar.
  [/#\s*(?=\d)/g, ""],
];

/** "# 406 1", "N° 406 depto 1": el número marcado es la puerta y lo que sigue,
 *  el depto. Se corta antes de que las abreviaturas borren la marca. */
const NUMERO_MARCADO = /(#|\bn[°º]\.?)\s*(\d+)\b.*$/i;

/** Depto, casa, block: lo que viene después del número y no ayuda a ubicar la
 *  puerta en el mapa. Se corta tras un número ("500 depto 42") o cuando la
 *  palabra va seguida de su número o letra ("… Figueroa edificio 01"); no en
 *  "Pasaje Casa Blanca", que es el nombre de la calle. */
const UNIDAD = String.raw`(?:depto|dpto|depart(?:amento)?|depa|of(?:icina)?|blk|block|torre|casa|piso|local|km|edif(?:icio)?)`;
const UNIDAD_TRAS_NUMERO = new RegExp(String.raw`(\d)\s*[,-]?\s*\b${UNIDAD}\b.*$`, "i");
const UNIDAD_CON_CODIGO = new RegExp(String.raw`\s*[,-]?\s*\b${UNIDAD}\b\.?\s*(?:\d|[a-z]{1,2}\b).*$`, "i");

/** ", Arica", "1085 Arica, Chile": la ciudad sobra (la búsqueda ya está acotada
 *  a Arica) y tapa el número del final. "Pasaje Arica" se queda. */
const CIUDAD_TRAS_NUMERO = /(\d)\s*,?\s*\barica\b(?:\s*,?\s*chile)?\s*$/i;
const CIUDAD_TRAS_COMA = /\s*,\s*arica\b(?:\s*,?\s*chile)?\s*$/i;

/** Un lugar descrito DESPUÉS del número: "1124 cerro La Cruz", "500 villa X". */
const LUGAR_TRAS_NUMERO =
  /(\d)\s*,?\s*\b(?:sector|cerro|villa|población|pobl?|condominio|conjunto|lote|sitio|parcela|manzana|mza?|interior|int|esquina|esq|entre|frente|altura)\b.*$/i;

/** "1085, Villa X": tras el número, una coma sin otro número es un agregado. */
const COMA_TRAS_NUMERO = /(\d)\s*,[^\d]*$/;

/** "1085 B", "1085B", "406-1", "12/3": la letra o el subnúmero es el depto. */
const LETRA_O_SUBNUMERO = /(\d)\s*(?:[-/]\s*[a-z\d]{1,3}|[a-z])$/i;

/** "0428" → "428". Un cero solo se queda. */
const CEROS_A_LA_IZQUIERDA = /\b0+(?=\d)/g;

/** "S/N" es "sin número": dejarlo hace que el geocodificador busque una calle
 *  llamada "Los Aromos sn". */
const SIN_NUMERO = /\s*\bs\s*\/?\s*n\.?\s*$/i;

/** Prepara el texto para consultarlo. NO es lo que se guarda en el pedido: el
 *  pedido conserva lo que se escribió, con el depto y todo. */
export function normalizarConsulta(texto: string): string {
  let t = texto.trim().replace(/\s+/g, " ");
  t = t.replace(NUMERO_MARCADO, "$1 $2");
  for (const [de, a] of ABREVIATURAS) t = t.replace(de, a);
  t = t.replace(CIUDAD_TRAS_NUMERO, "$1").replace(CIUDAD_TRAS_COMA, "");
  t = t.replace(CEROS_A_LA_IZQUIERDA, "");
  t = t.replace(UNIDAD_TRAS_NUMERO, "$1");
  t = t.replace(UNIDAD_CON_CODIGO, (m, desde: number) => (desde > 0 ? "" : m));
  t = t.replace(LUGAR_TRAS_NUMERO, "$1");
  t = t.replace(COMA_TRAS_NUMERO, "$1");
  t = t.replace(LETRA_O_SUBNUMERO, "$1");
  t = t.replace(SIN_NUMERO, "");
  return t.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

/** Minúsculas, sin tildes y con los espacios colapsados. La "ñ" queda "n": en
 *  la guía llega igual ("MUNOZ"). */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes
    .replace(/\s+/g, " ")
    .trim();
}

/** Las palabras de un texto, sin tildes y sin puntuación. */
export function palabrasDe(texto: string): string[] {
  return normalizar(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Parte "Avenida Linderos Poniente 3536" en calle y número. null cuando el
 *  texto no termina en un número: ahí no hay ninguna puerta que buscar. */
export function partirCalleYNumero(texto: string): { calle: string; numero: string } | null {
  // El `[^\d\s]` obliga a que la calle termine en algo que no sea un dígito: sin
  // eso, "21 de Mayo 500" se partía como calle "21 de" y número "Mayo 500".
  const m = /^(.*[^\d\s])\s+(\d{1,6})$/.exec(texto.trim());
  return m ? { calle: m[1].trim(), numero: m[2] } : null;
}

/** Lo que se le pidió al proveedor, sin el número: contra esto se revisa la
 *  calle que devuelve. */
export function calleDeLaConsulta(consulta: string): string {
  return partirCalleYNumero(consulta)?.calle ?? consulta;
}

// ----------------------------------------------------------------------------
// ¿Es esta la calle que se escribió?
// ----------------------------------------------------------------------------

/** Palabras que no distinguen una calle de otra: si lo único que coincide es
 *  "avenida" o "los", no coincidió nada.
 *
 *  OJO con lo que NO está en esta lista. "poniente", "oriente", "norte" y "sur"
 *  SÍ distinguen —son justamente lo que separa Linderos Poniente de Linderos
 *  Oriente—, así que escribir "Linderos Poniente" tiene que dejar la otra
 *  afuera. "San" y "Santa" tampoco están: San Marcos y Marcos Sanhueza son dos
 *  calles distintas de Arica. */
const PALABRAS_GENERICAS = new Set([
  "avenida", "av", "calle", "pasaje", "pje", "psje", "callejon", "camino", "poblacion",
  "villa", "condominio", "sector", "el", "la", "los", "las", "de", "del", "y",
]);

/** Grados y cargos que el nombre oficial trae y la gente omite o abrevia: la
 *  guía dice "Humberto Arellano" y la calle es "Avenida Diputado Humberto
 *  Arellano Figueroa". No hace falta escribirlos; escritos, ordenan. */
const TITULOS = new Set([
  "capitan", "cap", "general", "gral", "diputado", "dip", "senador", "sen", "regidor",
  "doctor", "dr", "presidente", "pdte", "comandante", "cmdte", "coronel", "cnel",
  "teniente", "tte", "sargento", "sgto", "almirante", "alm", "profesor", "prof",
  "obispo", "monsenor", "mons", "padre", "intendente", "alcalde", "ingeniero", "ing",
  "cabo", "soldado", "marinero", "piloto", "heroe", "heroes",
]);

const esRelleno = (p: string) => PALABRAS_GENERICAS.has(p) || TITULOS.has(p);

/** Cuánto hubo que estirar para que la calle sea la escrita. */
export type Coincidencia = {
  /** Letras corregidas en total ("muniz" → "munoz" es 1). */
  ediciones: number;
  /** Grados escritos que la calle no tiene ("Capitán Ávalos" vs "Pasaje Ávalos"). */
  faltantes: number;
  /** Palabras de la calle que no se escribieron ("Gandolfo" en "Santiago Arata"). */
  sobrantes: number;
};

/** ¿Es esta calle la que se escribió? Lo es cuando CADA palabra que distingue
 *  lo escrito está en el nombre de la calle, entera o con una letra cambiada
 *  (dos, si la palabra es larga). null si no.
 *
 *  Se exige "cada" y no "alguna" para que escribir más sea siempre acotar más:
 *  "Linderos" acepta las dos avenidas, "Linderos Poniente" solo una. Y la
 *  corrección tiene tope por largo para que no se cuelen calles distintas: una
 *  palabra de menos de cinco letras va exacta, y un número siempre. */
export function coincidenciaCalle(escrito: string, nombreCalle: string): Coincidencia | null {
  const escritas = palabrasDe(escrito).filter(
    // Una letra suelta (una inicial) no distingue; un número sí: "Pasaje 1 Norte".
    (p) => (p.length > 1 || /\d/.test(p)) && !PALABRAS_GENERICAS.has(p),
  );
  const buscadas = escritas.filter((p) => !TITULOS.has(p));
  if (buscadas.length === 0) return null;

  const enLaCalle = palabrasDe(nombreCalle);
  const usadas = new Set<number>();
  const buscar = (p: string): number | null => {
    let mejor = -1;
    let costo = Infinity;
    enLaCalle.forEach((q, i) => {
      if (usadas.has(i)) return;
      const d = parecido(p, q);
      if (d !== null && d < costo) [mejor, costo] = [i, d];
    });
    if (mejor < 0) return null;
    usadas.add(mejor);
    return costo;
  };

  let ediciones = 0;
  for (const p of buscadas) {
    const costo = buscar(p);
    if (costo === null) return null;
    ediciones += costo;
  }
  let faltantes = 0;
  for (const t of escritas.filter((p) => TITULOS.has(p))) {
    if (buscar(t) === null) faltantes++;
  }
  const sobrantes = enLaCalle.filter((q, i) => !usadas.has(i) && !esRelleno(q)).length;
  return { ediciones, faltantes, sobrantes };
}

export function esLaCalleEscrita(escrito: string, nombreCalle: string): boolean {
  return coincidenciaCalle(escrito, nombreCalle) !== null;
}

/** Para ordenar: menos letras corregidas primero, después menos grados que no
 *  calzan y después menos palabras de más. */
export function compararCoincidencias(a: Coincidencia, b: Coincidencia): number {
  return a.ediciones - b.ediciones || a.faltantes - b.faltantes || a.sobrantes - b.sobrantes;
}

/** null si no son la misma palabra; si no, cuántas letras hubo que corregir. */
function parecido(a: string, b: string): number | null {
  if (a === b) return 0;
  if (/\d/.test(a) || /\d/.test(b)) return null;
  const corta = Math.min(a.length, b.length);
  const tope = corta >= 9 ? 2 : corta >= 5 ? 1 : 0;
  if (tope === 0 || Math.abs(a.length - b.length) > tope) return null;
  const d = distanciaEdicion(a, b);
  return d <= tope ? d : null;
}

/** Damerau-Levenshtein (con transposición de dos letras vecinas: "witnig"). */
export function distanciaEdicion(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cambio = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cambio);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
