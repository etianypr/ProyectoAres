// Teléfonos chilenos: del texto que escribe el conductor al formato que necesita
// WhatsApp.
//
// Vive en su propio archivo, sin dependencias y sin directiva, porque lo usan
// las dos puntas y no pueden importarse entre sí: el formulario del conductor
// (navegador) para normalizar mientras escribe, y la ruta de envío (servidor)
// para no llamar a Meta con un número que no existe.
//
// POR QUÉ ES CRÍTICO, y no un formateo cosmético: el número decide A QUIÉN se le
// manda el aviso. Un dígito de más y el mensaje "tu encomienda llega hoy" se va
// a un desconocido — que además puede contestar "sí, la recibo" y meter una
// confirmación falsa en la ruta. La regla del producto es explícita: si el
// número no se puede normalizar con confianza, el pedido queda ADVERTIDO y no se
// manda nada (FR-002 y su caso borde en el spec).
//
// Lo que se acepta, en formato chileno:
//
//   celular      9 1234 5678        → +56912345678   (lo normal)
//                 1234 5678         → +56912345678   (le falta el 9 inicial)
//                09 1234 5678       → +56912345678   (prefijo largo, de la época
//                                                     en que había que discarlo)
//                +56 9 1234 5678    → +56912345678   (ya venía completo)
//                 56 9 1234 5678    → +56912345678   (sin el +)
//   fijo de Arica  58 212 3456      → +56582123456   (se normaliza igual, pero
//                                                     se avisa que no le llega
//                                                     WhatsApp)
//
// Y lo que NO se acepta: cualquier cosa que quede con una cantidad de dígitos
// que no corresponde a ningún teléfono chileno. Antes que adivinar, se advierte.

/** Código de país de Chile, sin el `+`. */
const CHILE = "56";

/** Todos los celulares chilenos empiezan con 9 y tienen 9 dígitos en total. */
const LARGO_CELULAR = 9;

/** Prefijos de red fija que existen en Chile. Están para poder DISTINGUIR un
 *  fijo de un celular mal escrito, no para animar a usarlos: un fijo no recibe
 *  WhatsApp, y el conductor tiene que saberlo antes de contar con ese aviso. */
const PREFIJOS_FIJOS = [
  "2", // Santiago
  "32", "33", "34", "35", // Valparaíso
  "41", "42", "43", "45", // Biobío y Araucanía
  "51", "52", "53", "55", "57", "58", // Norte; 58 es Arica, el de esta operación
  "61", "63", "64", "65", "67", // Sur
  "71", "72", "73", "75", // Maule
];

export type TelefonoNormalizado = {
  /** En E.164, listo para Meta: "+56912345678". */
  e164: string;
  /** Para mostrárselo al conductor: "+56 9 1234 5678". */
  legible: string;
  /** false para un fijo: se puede llamar, pero no le va a llegar el aviso. */
  puedeWhatsapp: boolean;
};

export type ResultadoTelefono =
  | { ok: true; telefono: TelefonoNormalizado; aviso: string | null }
  /** `motivo` es mostrable tal cual: dice qué hacer, no qué falló. */
  | { ok: false; motivo: string };

/** Deja solo dígitos, recordando si el texto traía un `+` adelante. Un `+` en el
 *  medio es basura y se ignora igual que un guion. */
function soloDigitos(texto: string): { digitos: string; tenia_mas: boolean } {
  const limpio = texto.trim();
  return {
    digitos: limpio.replace(/\D/g, ""),
    tenia_mas: limpio.startsWith("+"),
  };
}

/** Quita el código de país si está, y de paso el caso que el spec nombra
 *  explícitamente: un número que YA trae `+569` no puede terminar con el prefijo
 *  puesto dos veces.
 *
 *  Devuelve además SI lo quitó, porque de eso depende cuánto se le permite
 *  completar después: ver la nota de normalizarTelefono. */
function sinCodigoPais(
  digitos: string,
  tenia_mas: boolean,
): { nacional: string; traiaPais: boolean } {
  if (!digitos.startsWith(CHILE)) return { nacional: digitos, traiaPais: false };

  const resto = digitos.slice(CHILE.length);

  // "56" seguido de un número nacional completo: era el código de país.
  if (resto.length === LARGO_CELULAR) return { nacional: resto, traiaPais: true };

  // Con el `+` adelante, "56" es el código de país sí o sí, aunque lo que quede
  // no cierre: mejor fallar después por largo que tratar el 56 como parte del
  // número.
  if (tenia_mas) return { nacional: resto, traiaPais: true };

  // Sin `+` y sin largo que cierre, "56" puede ser el inicio del propio número.
  // Se deja tal cual y la validación de largo decide.
  return { nacional: digitos, traiaPais: false };
}

/** El `0` que había que discar antes de un largo distancia. Ya no se usa, pero
 *  sigue apareciendo en libretas y en pedidos copiados de sistemas viejos. */
function sinPrefijoLargaDistancia(digitos: string): string {
  return digitos.startsWith("0") ? digitos.replace(/^0+/, "") : digitos;
}

function esFijo(nacional: string): boolean {
  if (nacional.startsWith("9")) return false;
  return PREFIJOS_FIJOS.some((p) => nacional.startsWith(p));
}

/** "912345678" → "+56 9 1234 5678" */
function legible(nacional: string): string {
  if (nacional.length === LARGO_CELULAR && nacional.startsWith("9")) {
    return `+${CHILE} ${nacional[0]} ${nacional.slice(1, 5)} ${nacional.slice(5)}`;
  }
  return `+${CHILE} ${nacional}`;
}

/** Normaliza lo que escribió el conductor. NUNCA lanza: devuelve el resultado o el
 *  motivo mostrable, porque el pedido se guarda igual (advertido) y quien decide
 *  qué hacer es el conductor, no esta función. */
export function normalizarTelefono(texto: string | null | undefined): ResultadoTelefono {
  if (!texto || !texto.trim()) {
    return { ok: false, motivo: "Falta el teléfono del destinatario." };
  }

  const { digitos, tenia_mas } = soloDigitos(texto);
  if (!digitos) {
    return { ok: false, motivo: "El teléfono no tiene ningún número." };
  }

  const { nacional: crudo, traiaPais } = sinCodigoPais(digitos, tenia_mas);
  const nacional = sinPrefijoLargaDistancia(crudo);

  // Ocho dígitos sueltos: es el caso más común de celular al que se le olvidó el
  // 9. Se completa, porque es exactamente lo que el producto pide (agregar el
  // prefijo cuando el número no lo incluye).
  //
  // Pero SOLO si el número venía sin código de país. Si el conductor escribió
  // "+56" y lo que sigue no alcanza para un número nacional, entonces lo que
  // escribió está roto, y ponerle un 9 adelante convierte un dato incompleto en
  // un número válido que pertenece a OTRA persona. Ahí se advierte y no se manda
  // nada.
  const completo =
    !traiaPais && nacional.length === LARGO_CELULAR - 1 ? `9${nacional}` : nacional;

  if (completo.length !== LARGO_CELULAR) {
    // Acá se decide NO adivinar. Un número de 7 dígitos o de 12 no es un
    // teléfono chileno, y elegirle uno parecido es mandarle el aviso a otra
    // persona.
    return {
      ok: false,
      motivo:
        completo.length < LARGO_CELULAR
          ? `El teléfono tiene ${completo.length === 1 ? "1 dígito" : `${completo.length} dígitos`} y un número chileno tiene ${LARGO_CELULAR}. Revísalo.`
          : `El teléfono tiene ${completo.length} dígitos, más de los ${LARGO_CELULAR} de un número chileno. Revísalo.`,
    };
  }

  const fijo = esFijo(completo);
  if (!completo.startsWith("9") && !fijo) {
    return {
      ok: false,
      motivo: "Ese número no parece un celular ni un fijo chileno. Revísalo.",
    };
  }

  return {
    ok: true,
    telefono: {
      e164: `+${CHILE}${completo}`,
      legible: legible(completo),
      puedeWhatsapp: !fijo,
    },
    aviso: fijo
      ? "Parece un teléfono fijo: se puede llamar, pero no le va a llegar el aviso de WhatsApp."
      : null,
  };
}

/** Atajo para guardar: el E.164 si se pudo normalizar, y si no, el texto tal
 *  como lo escribió el conductor.
 *
 *  Conservar el texto original y no vaciarlo es a propósito: es lo único que
 *  tiene el conductor para darse cuenta de qué se equivocó al escribir. Un campo
 *  en blanco no le dice nada. */
export function telefonoParaGuardar(texto: string): string {
  const r = normalizarTelefono(texto);
  return r.ok ? r.telefono.e164 : texto.trim();
}

/** Si un teléfono YA guardado puede recibir el aviso. Es la guarda que usa la
 *  ruta de envío antes de llamar a Meta. */
export function puedeRecibirAviso(telefono: string): boolean {
  const r = normalizarTelefono(telefono);
  return r.ok && r.telefono.puedeWhatsapp;
}
