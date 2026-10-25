// Plus Codes (Open Location Code) ⇄ coordenadas, SIN consultar nada.
//
// Por qué esto existe en un sistema de Arica: acá las casas no tienen
// numeración estructurada, y el geocodificador lo confirma midiendo — de 23
// direcciones reales, Mapbox tiene la puerta exacta en 2 y estima el resto
// (ver scripts/sondear-proveedores.mjs). Un Plus Code corta ese problema de
// raíz: la casa se marca UNA vez, queda escrita como texto corto que una
// persona puede dictar por teléfono, y no se vuelve a geocodificar nunca.
//
// Todo lo de acá es aritmética: no hay red, no hay API key, no hay límite de
// consultas y el resultado es siempre el mismo. Es lo más barato y lo más
// confiable que tiene el sistema para ubicar una casa sin número.
//
// Dos formas de código, y la diferencia importa:
//
//   COMPLETO  "57HFGMCP+MX"  se resuelve solo, en cualquier parte del mundo.
//   CORTO     "GMCP+MX"      le faltan los primeros dígitos y NO significa nada
//                            sin un punto de referencia cercano. Es la forma en
//                            que la gente los comparte ("GMCP+MX, Arica"), así
//                            que hay que aceptarla: se recupera contra el
//                            centro de Arica salvo que llegue otra referencia.
import { OpenLocationCode } from "open-location-code";
import { CENTRO_ARICA, METROS_POR_GRADO_LAT, type Coordenada, type Recuadro } from "./coordenada";

const olc = new OpenLocationCode();

export type PlusCodeResuelto = {
  /** Centro del recuadro. Es la coordenada que usa la ruta. */
  lat: number;
  lng: number;
  /** El código global. Es lo que conviene GUARDAR: no depende de referencia. */
  codigoCompleto: string;
  /** true si hubo que recuperarlo contra la referencia. */
  eraCorto: boolean;
  /** Lado mayor del recuadro, en metros. 10 dígitos ≈ 14 m, 11 ≈ 3 m. Se
   *  informa porque un código de 8 dígitos cubre media cuadra y eso hay que
   *  poder mostrarlo antes de mandar a nadie. */
  precisionMetros: number;
  recuadro: Recuadro;
};

/** Lo que la gente escribe: "GMCP+MX, Arica", "57hfgmcp+mx", con espacios.
 *
 *  La localidad del final se DESCARTA a propósito y no se geocodifica: esta
 *  función no toca la red, y resolver "Arica" pidiéndoselo a un proveedor la
 *  convertiría en otra cosa —con latencia, con límite de consultas y con la
 *  posibilidad de fallar—. Para eso está el parámetro `referencia`. */
function limpiar(codigo: string): string {
  return codigo.trim().split(/[\s,]+/)[0]?.toUpperCase() ?? "";
}

/** Lado mayor del recuadro en metros.
 *
 *  A esta escala —decenas de metros— la Tierra es plana y un grado de latitud
 *  mide METROS_POR_GRADO_LAT (ver geo/coordenada).
 *  El meridiano se encoge con el coseno de la latitud. */
function ladoMayorMetros(r: Recuadro): number {
  const alto = (r.norte - r.sur) * METROS_POR_GRADO_LAT;
  const latMedia = ((r.norte + r.sur) / 2) * (Math.PI / 180);
  const ancho = (r.este - r.oeste) * METROS_POR_GRADO_LAT * Math.cos(latMedia);
  return Math.round(Math.max(alto, ancho) * 10) / 10;
}

/** Resuelve un Plus Code a coordenadas. Devuelve null si el código no es válido.
 *
 *  Nunca lanza, y eso no es cosmético: la librería tira un STRING pelado
 *  ("IllegalArgumentException: …") en vez de un Error, así que un `catch (e)`
 *  de los que esperan `e.message` recibe undefined y rompe en otro lado, lejos
 *  de acá. Se atrapa donde se sabe. */
export function resolverPlusCode(
  codigo: string,
  referencia: Coordenada = CENTRO_ARICA,
): PlusCodeResuelto | null {
  const limpio = limpiar(codigo);
  if (!limpio) return null;

  try {
    if (!olc.isValid(limpio)) return null;

    const eraCorto = olc.isShort(limpio);
    // recoverNearest busca el código completo más cercano a la referencia. Un
    // código corto de Arica recuperado contra Arica cae en Arica; recuperado
    // contra Santiago caería en Santiago, y por eso la referencia es un
    // parámetro y no una constante escondida.
    const codigoCompleto = eraCorto
      ? olc.recoverNearest(limpio, referencia.lat, referencia.lng)
      : limpio;

    const a = olc.decode(codigoCompleto);
    const recuadro: Recuadro = {
      sur: a.latitudeLo,
      oeste: a.longitudeLo,
      norte: a.latitudeHi,
      este: a.longitudeHi,
    };

    return {
      lat: a.latitudeCenter,
      lng: a.longitudeCenter,
      codigoCompleto,
      eraCorto,
      precisionMetros: ladoMayorMetros(recuadro),
      recuadro,
    };
  } catch {
    return null;
  }
}

/** Cuántos dígitos se usan al ANOTAR una casa. Once da un recuadro de unos tres
 *  metros: la puerta, no la cuadra. Diez (el largo habitual, ~14 m) puede caer
 *  en la casa de al lado, y acá al lado es un pasaje entero. */
const DIGITOS = 11;

/** El código de un punto marcado en el mapa. Es la otra mitad: el conductor marca
 *  la casa una vez y esto es lo que se guarda para no volver a buscarla. */
export function plusCodeDe(punto: Coordenada, digitos: number = DIGITOS): string | null {
  if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lng)) return null;
  try {
    return olc.encode(punto.lat, punto.lng, digitos);
  } catch {
    return null;
  }
}
