// El modelo geográfico del sistema: una forma de escribir un punto, una cuenta
// de distancia y los límites de Arica. Todo lo demás de geo importa de acá.
//
// Dos convenciones conviven y NO se mezclan:
//   Coordenada   {lat, lng}   la del dominio: pedidos, GPS, geocodificador.
//   PuntoLngLat  [lng, lat]   la de GeoJSON, Mapbox y ORS: trazados del mapa.
// Se pasa de una a otra solo con aLngLat() / deLngLat().

export type Coordenada = { lat: number; lng: number };

/** Punto de un trazado en el orden de GeoJSON: primero la longitud. */
export type PuntoLngLat = [lng: number, lat: number];

/** El camino por calles, como polilínea. */
export type Trazado = PuntoLngLat[];

export type Recuadro = { sur: number; oeste: number; norte: number; este: number };

/** Centro de Arica: referencia de los Plus Codes cortos y centro inicial del mapa. */
export const CENTRO_ARICA: Coordenada = { lat: -18.4783, lng: -70.3126 };

/** Zona de reparto: Arica y su valle. Acota las búsquedas de direcciones. */
export const RECUADRO_ARICA: Recuadro = { sur: -18.65, oeste: -70.45, norte: -18.35, este: -70.1 };

/** Metros por grado de latitud, para proyecciones planas locales (decenas a
 *  cientos de metros, donde la curvatura no se nota). */
export const METROS_POR_GRADO_LAT = 111_320;

export const aLngLat = (c: Coordenada): PuntoLngLat => [c.lng, c.lat];
export const deLngLat = ([lng, lat]: PuntoLngLat): Coordenada => ({ lat, lng });

const aRad = (d: number) => (d * Math.PI) / 180;

/** Distancia en línea recta entre dos puntos, en metros (haversine). */
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const R = 6371000;
  const dLat = aRad(b.lat - a.lat);
  const dLng = aRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(a.lat)) * Math.cos(aRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rumbo de A hacia B, en grados horarios desde el norte. */
export function rumboEntre(a: Coordenada, b: Coordenada): number {
  const dLng = aRad(b.lng - a.lng);
  const lat1 = aRad(a.lat);
  const lat2 = aRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
