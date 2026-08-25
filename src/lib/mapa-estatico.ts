// Un punto del mapa como IMAGEN, para mostrar DÓNDE quedó una dirección.
//
// Es la vista previa que aparece debajo del campo de dirección en cuanto se
// elige una (ver components/ui/mapa-punto.tsx). Responde una sola pregunta, la
// única que el texto no puede responder: "¿ese punto es la puerta que yo tengo
// en la cabeza?". El chofer conoce Arica mejor que los dos geocodificadores
// juntos; lo que le faltaba era VER en qué esquina lo estaban poniendo.
//
// ----------------------------------------------------------------------------
// POR QUÉ UNA IMAGEN Y NO OTRO MAPA DE MAPBOX GL
//
// La app ya tiene un mapa de verdad (ver conductor/encomiendas/ruta-mapa.tsx),
// pero para esto no sirve:
//
//   · un segundo mapa GL es otro contexto WebGL y otras decenas de teselas, en
//     un teléfono barato que ya está corriendo el de navegación. La estampilla
//     es UNA petición y ni un byte de JavaScript;
//   · dentro de la hoja deslizable, un mapa que se arrastra y hace zoom le roba
//     los gestos al formulario que lo contiene;
//   · un preview no se explora: se mira y se sigue. Que no se pueda tocar es
//     una ventaja, no una limitación.
//
// El precio de la imagen: no se puede mover el punto. Corregir a mano sigue
// siendo corregir la dirección y volver a elegir de la lista.
//
// ⚠️ Cada llamada a esta URL cuenta como una petición en el plan de Mapbox
// (Static Images, 50.000 gratis al mes). El navegador cachea por URL, así que
// dos previews de la MISMA dirección son una sola petición — de ahí que las
// coordenadas se redondeen antes de armarla: sin redondear, la misma esquina
// con un decimal distinto sería una petición nueva.

const BASE = "https://api.mapbox.com/styles/v1";

// Mismo proveedor que el mapa del conductor —así el punto que ve acá es el
// mismo lugar que va a ver manejando— pero NO el mismo estilo:
// navigation-day-v1 apaga los puntos de interés para no distraer al volante, y
// acá los puntos de interés son justamente lo que permite reconocer una esquina
// en una estampilla de menos de 200 píxeles de alto.
const ESTILO = "mapbox/streets-v12";

// Tope de la API: ningún lado puede pasar de 1280 px. Con @2x lo que se pide se
// duplica, así que el pedido tiene que quedar en la mitad.
const MAX_LADO = 1280;

/** Zoom por defecto: la cuadra con sus calles vecinas. Más cerca (18) se pierde
 *  la referencia de en qué esquina está; más lejos (14) todas las direcciones
 *  de Arica se ven iguales. */
export const ZOOM_PUNTO = 16;

/** Naranja de la marca (--brand), sin el "#" porque así lo quiere la URL. */
const COLOR_PIN = "c2410c";

/** Debajo de esto el pin grande tapa la cuadra que se quiere mirar. */
const LADO_MINIMO_PIN_GRANDE = 120;

export type OpcionesMapaEstatico = {
  lat: number;
  lng: number;
  /** Lo que se le PIDE a Mapbox, en px. Conviene que sea lo que mide en
   *  pantalla: pedir de más son datos móviles tirados. */
  ancho: number;
  alto: number;
  zoom?: number;
  /** Duplica la resolución (pantallas de teléfono). Cuesta más datos, no más
   *  peticiones. */
  retina?: boolean;
};

function redondear(grados: number): string {
  // Seis decimales son ~11 cm: de sobra para una puerta, y suficiente para que
  // la misma esquina dé siempre la misma URL (y por lo tanto un solo pedido).
  return String(Number(grados.toFixed(6)));
}

function lado(px: number, retina: boolean): number {
  const tope = retina ? MAX_LADO / 2 : MAX_LADO;
  return Math.max(1, Math.min(Math.round(px), tope));
}

/** La URL de la imagen, o null si no se puede armar.
 *
 *  Nunca lanza y nunca devuelve una URL a medio armar: una vista previa que no
 *  se puede dibujar no tiene derecho a impedir que se guarde el pedido. */
export function urlMapaEstatico({
  lat,
  lng,
  ancho,
  alto,
  zoom = ZOOM_PUNTO,
  retina = false,
}: OpcionesMapaEstatico): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // 85 y no 90: más allá de eso no existe la proyección con la que se dibujan
  // los mapas web. Un pedido con lat 91 es un dato roto, no un lugar.
  if (Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;

  const x = redondear(lng);
  const y = redondear(lat);
  const z = Math.min(22, Math.max(0, zoom));
  const w = lado(ancho, retina);
  const h = lado(alto, retina);

  // El pin chico para las estampillas de la lista de dudas; el grande para la
  // tira que va debajo del campo.
  const pin = Math.min(w, h) < LADO_MINIMO_PIN_GRANDE ? "pin-s" : "pin-l";

  // OJO: los paréntesis y las comas del marcador van LITERALES. Pasar este
  // trozo por encodeURIComponent (o armarlo con URLSearchParams) los escapa y
  // Mapbox contesta 422 — el error se ve como "la vista previa no carga nunca".
  const marcador = `${pin}+${COLOR_PIN}(${x},${y})`;

  // El centro es el punto mismo: el pin queda en el medio de la imagen, así que
  // recortarla con object-cover no lo mueve de lugar.
  const centro = `${x},${y},${z}`;
  const tamano = `${w}x${h}${retina ? "@2x" : ""}`;

  // A propósito SIN logo=false ni attribution=false: la atribución de Mapbox y
  // de OpenStreetMap es obligatoria por contrato y viene dibujada en la imagen.
  const query = new URLSearchParams({ access_token: token });

  return `${BASE}/${ESTILO}/static/${marcador}/${centro}/${tamano}?${query}`;
}
