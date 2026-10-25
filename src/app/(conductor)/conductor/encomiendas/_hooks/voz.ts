// Qué voz usa la navegación. Puro: se prueba sin navegador.
//
// Poner solo `lang = "es-CL"` no alcanza, y era lo que se hacía. Casi ningún
// teléfono tiene instalada esa variante: Android trae es-ES o es-US, el iPhone
// es-MX o es-ES. Ante un idioma que no tiene, el navegador puede leer el texto
// con una voz en inglés (queda incomprensible) o directamente no decir nada,
// según el aparato. Hay que elegir a mano, de las voces que el teléfono SÍ
// tiene, la mejor en español.
//
// El orden es por cercanía al oído chileno: la de Chile, la latinoamericana
// genérica, después las de la región y por último la de España.
const PREFERENCIA_VOZ = ["es-cl", "es-419", "es-mx", "es-pe", "es-ar", "es-us", "es-es"];

function normalizar(lang: string): string {
  // Android reporta "es_CL" con guion bajo; el estándar es "es-CL".
  return lang.replace("_", "-").toLowerCase();
}

/** Elige la mejor voz en español de las que tenga el aparato. */
export function elegirVoz<T extends { lang: string }>(voces: T[]): T | null {
  const enEspanol = voces.filter((v) => normalizar(v.lang).startsWith("es"));
  if (enEspanol.length === 0) return null;

  for (const preferida of PREFERENCIA_VOZ) {
    const v = enEspanol.find((voz) => normalizar(voz.lang) === preferida);
    if (v) return v;
  }
  // Tiene español, pero de una variante que no está en la lista: sirve igual.
  return enEspanol[0];
}
