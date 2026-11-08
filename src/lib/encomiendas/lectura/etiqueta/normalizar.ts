// Los renglones de la etiqueta (spec 021): el texto tal como lo leyó ML Kit, para
// sacar los valores, y una copia para buscar las palabras clave. Puro.
//
// La copia tiene el MISMO largo que el original, así una posición encontrada en
// ella sirve para cortar el valor del original. Los errores del lector (0↔O,
// 1↔I↔L, 5↔S) se toleran solo en las palabras clave (`clave`), nunca en los
// valores: «corregir» un teléfono o un nombre es inventarlo.

export type Renglon = {
  /** Como lo leyó ML Kit, con los espacios juntados: de aquí salen los valores. */
  texto: string;
  /** Sin tildes y en mayúsculas, letra por letra: aquí se buscan las claves. */
  comparable: string;
};

export function renglones(texto: string): Renglon[] {
  return texto
    .split(/\r?\n/)
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((t) => ({ texto: t, comparable: comparable(t) }));
}

/** Sin tildes y en mayúsculas, sin cambiar el largo. */
export function comparable(texto: string): string {
  return Array.from(texto, (c) => {
    if (c.length !== 1) return c;
    const mayuscula = (c.normalize("NFD")[0] ?? c).toUpperCase();
    return mayuscula.length === 1 ? mayuscula : c;
  }).join("");
}

const CONFUSIONES: Record<string, string> = { O: "[O0]", I: "[I1L]", L: "[L1I]", S: "[S5]" };

/** Una palabra clave como expresión, tolerando los errores típicos del lector
 *  («0.F.», «Te1.», «DESTlNATARIO»). Un espacio vale por cualquier separación y
 *  un punto es optativo. Se usa sobre `comparable`. */
export function clave(palabra: string): string {
  return Array.from(palabra, (c) => {
    if (c === " ") return "[\\s.]*";
    if (c === ".") return "\\.?";
    return CONFUSIONES[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
}

/** Una o varias palabras clave enteras (sin letras ni dígitos pegados). */
export function palabra(...variantes: string[]): RegExp {
  return new RegExp(`(?<![A-Z0-9])(?:${variantes.map(clave).join("|")})(?![A-Z0-9])`);
}
