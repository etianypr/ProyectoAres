// Lo que el mapa del conductor recibe: paradas, la ubicación y la ruta propuesta
// (sale de ruta-mapa.tsx, spec 002 T038).

import type { Trazado } from "@/lib/geo/coordenada";

export type PuntoMapa = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  activa: boolean;
  completada: boolean;
};

export type Ubicacion = {
  lat: number;
  lng: number;
  /** Rumbo en grados (0-360, 0 = norte), o null si todavía no se conoce
   *  (recién montado, o el conductor está detenido y nunca se movió). */
  heading: number | null;
  /** Cuándo se midió ese rumbo (ms). Detenido se conserva el último, y uno de
   *  hace minutos no sirve para elegir la calzada de salida (spec 017, N9). */
  rumboEn?: number | null;
  /** Radio de error que declara el GPS, en metros. Con esto se descartan las
   *  lecturas que pondrían el punto adentro de una manzana (ver
   *  use-ubicacion-actual). */
  precisionM?: number | null;
  /** Cuándo la tomó el GPS (ms). Sirve para saber que el punto quedó viejo:
   *  filtrar lecturas malas sin decirlo dejaría el punto congelado. */
  tomadaEn?: number;
  /** Velocidad en m/s cuando el aparato la entrega (iOS a veces no). */
  velocidad?: number | null;
};

/** Ruta calculada y todavía sin guardar, para que el conductor la vea antes de
 *  aceptarla. Mientras esté puesta, el mapa muestra ESTA ruta —encuadrada
 *  completa, de norte y sin inclinación, como un mapa de papel— en vez de la
 *  vista de manejo. */
export type PreviaRuta = {
  puntos: PuntoMapa[];
  trazado: Trazado | null;
};
