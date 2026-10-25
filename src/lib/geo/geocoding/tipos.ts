// Tipos y constantes que comparten los proveedores y la búsqueda (spec 002, T033).

import { RECUADRO_ARICA } from "@/lib/geo/coordenada";

// La empresa reparte en Arica: el recuadro ACOTA la búsqueda a la ciudad y su
// valle. Es lo que hace que escribir "colón 123" no ofrezca la Avenida Colón de
// Santiago. Es un filtro duro, a diferencia de "proximity", que solo empuja los
// resultados cercanos hacia arriba — probado contra la API: con proximity en
// Arica, el primer resultado de "colón 123" seguía siendo San Bernardo.
// Formato "oeste,sur,este,norte": el bbox de Mapbox y el viewbox de Nominatim.
export const BBOX_ARICA = [
  RECUADRO_ARICA.oeste,
  RECUADRO_ARICA.sur,
  RECUADRO_ARICA.este,
  RECUADRO_ARICA.norte,
].join(",");

/** Menos que esto no se consulta: con dos letras Mapbox devuelve cualquier
 *  cosa y se gastan consultas por cada tecla. */
export const MIN_CARACTERES = 3;

// Se piden VARIOS candidatos y no uno solo (antes era limit=1). Con uno solo no
// hay forma de saber que la dirección era ambigua: el proveedor devuelve el
// primero y la app lo acepta como si fuera el único, que es exactamente lo que
// el principio IV de la constitución prohibe.
export const CANDIDATOS_POR_PROVEEDOR = 5;

/** Cuánto se puede confiar en que esa coordenada es la puerta del pedido.
 *
 *  Es lo que decide si la aplicación puede seguir sola o tiene que preguntarle
 *  al conductor. La constitución es explícita: ante ambigüedad, exponerla en vez
 *  de elegir en silencio una ubicación insegura (principio IV). */
export type Confianza =
  /** La puerta exacta, con su número, o un punto de interés que ES el destino. */
  | "exacta"
  /** La calle correcta, pero no la puerta: la parada queda a mitad de cuadra. */
  | "aproximada"
  /** El barrio o la ciudad. Sirve para orientarse, no para entregar. */
  | "baja";

/** Qué encontró la búsqueda de una dirección completa. */
export type TipoUbicacion =
  /** Una sola coincidencia y con número: se puede usar sin preguntar. */
  | "exacta"
  /** La calle es la correcta y el número cae en su cuadra, pero la puerta exacta
   *  no está en los datos del proveedor: la posición es INTERPOLADA. Se usa —el
   *  conductor llega a la cuadra— con la advertencia a la vista. */
  | "aproximada"
  /** Varias coincidencias plausibles y separadas: TIENE que elegir el conductor. */
  | "ambigua"
  /** Se encontró la calle pero no el número. */
  | "solo_calle"
  /** Ningún proveedor la reconoció. */
  | "no_encontrada";

/** Una dirección ofrecida al conductor mientras escribe. Trae ya las coordenadas:
 *  elegirla de la lista es a la vez confirmar que existe y ubicarla, sin una
 *  segunda consulta. */
export type SugerenciaDireccion = {
  id: string;
  /** Lo que queda escrito en el campo al elegirla ("Avenida Chacabuco 1234"). */
  direccion: string;
  /** Renglón de abajo, más chico ("Arica, Región de Arica y Parinacota"). */
  detalle: string | null;
  lat: number;
  lng: number;
  /** true cuando el resultado es la CALLE y no una puerta concreta: el conductor
   *  todavía no escribió el número y hay que avisarle. */
  soloCalle: boolean;
  /** Cuánto se puede confiar en esta coordenada. Se muestra en la lista: es la
   *  diferencia entre "andá tranquilo" y "confirmá antes de salir". */
  confianza: Confianza;
  /** Si el NÚMERO de casa que se pidió es el que devolvió el proveedor.
   *  null cuando no se pidió número o cuando el proveedor no lo informa. */
  coincideNumero: boolean | null;
  /** De dónde salió. Se muestra en la lista: es lo que le permite a la empresa
   *  ver que una corrección que hizo en OpenStreetMap ya está llegando a la app
   *  (Mapbox tarda lo suyo en incorporarlas, ver la cabecera). */
  fuente: Fuente;
};

export type Fuente = "mapbox" | "osm" | "plus_code" | "google";

/** Cómo se llama cada fuente en pantalla.
 *
 *  Es un Record sobre la unión a propósito, y no un `=== "osm" ? … : "Mapbox"`
 *  escrito en cada pantalla: así estaba antes, en dos archivos, y el `else`
 *  etiquetaba como "Mapbox" cualquier fuente nueva. Con esto, agregar una
 *  fuente sin ponerle nombre no compila. */
export const NOMBRE_FUENTE: Record<Fuente, string> = {
  mapbox: "Mapbox",
  osm: "OSM",
  plus_code: "Plus Code",
  google: "Google",
};
