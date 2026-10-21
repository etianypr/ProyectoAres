// Marcar la puerta con el GPS, estando parado en ella.
//
// Es el último recurso y el más confiable de todos: ningún proveedor sabe dónde
// queda una casa sin número, pero el chofer que está en la puerta sí. Lo que
// falta es que el teléfono lo diga con honestidad, y ahí está el problema —
//
// EL GPS NUNCA DICE "NO SÉ". Devuelve siempre una posición, con un radio de
// error al lado, y ese radio es lo único que separa "esta es la puerta" de
// "estoy en algún lugar de estas cuatro manzanas". Guardar una lectura de ±80 m
// como si fuera la puerta es exactamente el error que veníamos arreglando en el
// geocodificador, solo que ahora con la firma del chofer encima.
//
// Por eso acá no se decide por el chofer NI se le esconde el número: se traduce
// el radio a una de tres frases y se muestran las dos cosas, la frase y los
// metros. Guardar o no, decide él.
import type { Coordenada } from "./coordenada";
import { plusCodeDe } from "./plus-code";

/** Qué tan bien se conoce el punto que entregó el GPS. */
export type CalidadMarca =
  /** Alcanza para la puerta. */
  | "puerta"
  /** Ubica la cuadra, no la casa. Sirve, pero hay que decirlo. */
  | "cuadra"
  /** No ubica ni la manzana, o el teléfono no informó cuánto se equivoca. */
  | "dudosa";

/** Un teléfono al aire libre y quieto da entre 5 y 15 m. Por encima de esto ya
 *  no es "la casa" sino "por acá". */
const PRECISION_PUERTA_M = 12;

/** Cuarenta metros son media cuadra de Arica: todavía sirve para llegar y mirar,
 *  y es mucho mejor que la interpolación de un proveedor. Más que eso, no. */
const METROS_CUADRA = 40;

export function calidadDe(precisionM: number | null | undefined): CalidadMarca {
  // Sin dato NO se asume lo mejor. Es el mismo criterio con el que se lee el
  // match_code de Mapbox: lo que el proveedor no afirma, no se da por bueno.
  if (precisionM == null || !Number.isFinite(precisionM)) return "dudosa";
  if (precisionM <= PRECISION_PUERTA_M) return "puerta";
  if (precisionM <= METROS_CUADRA) return "cuadra";
  return "dudosa";
}

export type Marca = {
  lat: number;
  lng: number;
  /** Radio de error que declaró el GPS, o null si no lo informó. */
  precisionM: number | null;
  calidad: CalidadMarca;
  /** El Plus Code de ese punto. Es lo que hace que esta casa no haya que
   *  buscarla nunca más: se dicta por teléfono y se escribe en el paquete.
   *
   *  NO se guarda en el pedido — se deriva de lat/lng cada vez que se necesita.
   *  Una copia guardada es una copia que se puede desincronizar de las
   *  coordenadas cuando alguien las corrija. */
  codigo: string | null;
  /** Listo para mostrar, sin armar frases en el componente. */
  texto: string;
};

/** Siempre once dígitos (~3 m), aunque la lectura sea peor.
 *
 *  Acortar el código según la precisión sería más "honesto" en apariencia, pero
 *  el código se dicta en voz alta: que cambie de largo entre una casa y otra lo
 *  vuelve difícil de leer y de comparar. La honestidad va donde tiene que ir —
 *  el radio de error, que se muestra SIEMPRE al lado. */
const DIGITOS = 11;

/** El punto del GPS, ya traducido a algo que se le puede mostrar a una persona.
 *  null si las coordenadas no son utilizables. */
export function marcaDe(punto: Coordenada, precisionM: number | null | undefined): Marca | null {
  if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lng)) return null;

  const calidad = calidadDe(precisionM);
  const metros = precisionM == null || !Number.isFinite(precisionM) ? null : Math.round(precisionM);

  const texto =
    calidad === "puerta"
      ? `Estás en la puerta (±${metros} m).`
      : calidad === "cuadra"
        ? `Esto ubica la cuadra, no la casa (±${metros} m). Acércate a la puerta y vuelve a tomarla.`
        : metros == null
          ? "El teléfono no informó cuánto se equivoca. No se puede saber si esto es la puerta."
          : `La señal está muy floja (±${metros} m): esto no ubica ni la manzana.`;

  return {
    lat: punto.lat,
    lng: punto.lng,
    precisionM: metros,
    calidad,
    codigo: plusCodeDe(punto, DIGITOS),
    texto,
  };
}

/** ¿Se puede guardar sin insistir? Solo la puerta.
 *
 *  Las otras dos se pueden guardar igual —el chofer manda— pero pidiendo una
 *  confirmación aparte: es la misma regla que el resto de la app, nada dudoso
 *  entra en silencio. */
export function entraSolo(marca: Marca): boolean {
  return marca.calidad === "puerta";
}
