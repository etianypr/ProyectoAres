"use client";

// GPS simulado del modo prueba (terreno 2026-10-28): probar la ruta sin salir a
// la calle —en un PC el "GPS" decía Santiago—. Con el modo prueba encendido y
// esto activo, la app no lee la ubicación del aparato: el punto parte en la
// central de carga y, con una ruta, avanza solo por la línea de navegación hasta
// la parada activa, a velocidad de ciudad (o más rápido), y se detiene en la
// puerta. Al cerrar esa parada, la navegación pide el tramo siguiente y el punto
// sigue por él.
//
// Imita la API de navigator.geolocation (watchPosition, clearWatch,
// getCurrentPosition): quien lee la ubicación no tiene que saber si es simulada.

import { useEffect, useSyncExternalStore } from "react";
import { CENTRO_ARICA, distanciaMetros, rumboEntre, type Coordenada, type Trazado } from "@/lib/geo/coordenada";
import { enModoPrueba, useModoPrueba } from "./modo-prueba";

const CLAVE = "ares-gps-simulado";
const EVENTO = "ares-gps-simulado";
/** Donde generar-ruta/partida.ts guarda la central ya ubicada. */
const CLAVE_PARTIDA = "pucarani-partida-empresa";
/** 30 km/h: lo que se anda en Arica entre parada y parada. */
const METROS_POR_SEGUNDO = 30 / 3.6;
const MS_LECTURA = 1000;

export const VELOCIDADES = [1, 5, 20] as const;
export type ConfigGps = { activo: boolean; velocidad: number };

/** Sin nada guardado, activo: en modo prueba lo normal es no tener el GPS real. */
export function leerConfigGps(): ConfigGps {
  try {
    const c = JSON.parse(globalThis.localStorage?.getItem(CLAVE) ?? "null") as Partial<ConfigGps> | null;
    return { activo: c?.activo ?? true, velocidad: c?.velocidad ?? 5 };
  } catch {
    return { activo: true, velocidad: 5 };
  }
}

export function fijarConfigGps(cambios: Partial<ConfigGps>): void {
  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify({ ...leerConfigGps(), ...cambios }));
  } catch {
    // Sin almacenamiento queda lo de siempre.
  }
  globalThis.dispatchEvent?.(new Event(EVENTO));
}

/** ¿La ubicación de la app es la simulada? Solo en modo prueba. */
export function gpsSimulado(): boolean {
  return enModoPrueba() && leerConfigGps().activo;
}

// ----------------------------------------------------------------------------
// El recorrido: puro.
// ----------------------------------------------------------------------------

/** El punto a `metros` del comienzo del camino ([lng, lat] por punto), y hacia
 *  dónde va. Pasado el final, el final. */
export function puntoEnCamino(camino: Trazado, metros: number): { lat: number; lng: number; rumbo: number | null; alFinal: boolean } {
  let resto = Math.max(0, metros);
  for (let i = 1; i < camino.length; i++) {
    const a = { lng: camino[i - 1][0], lat: camino[i - 1][1] };
    const b = { lng: camino[i][0], lat: camino[i][1] };
    const tramo = distanciaMetros(a, b);
    if (tramo > 0 && resto <= tramo) {
      const t = resto / tramo;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, rumbo: rumboEntre(a, b), alFinal: false };
    }
    resto -= tramo;
  }
  const ultimo = camino[camino.length - 1];
  const penultimo = camino[camino.length - 2];
  return {
    lat: ultimo[1],
    lng: ultimo[0],
    rumbo: penultimo ? rumboEntre({ lng: penultimo[0], lat: penultimo[1] }, { lng: ultimo[0], lat: ultimo[1] }) : null,
    alFinal: true,
  };
}

/** Cuánto camino hay hasta el vértice más cercano a `p`: por dónde retomar un
 *  camino nuevo que empieza donde ya está el punto. */
function metrosHasta(camino: Trazado, p: Coordenada): number {
  let mejor = 0;
  let menor = Infinity;
  let acumulado = 0;
  for (let i = 0; i < camino.length; i++) {
    if (i > 0) acumulado += distanciaMetros({ lng: camino[i - 1][0], lat: camino[i - 1][1] }, { lng: camino[i][0], lat: camino[i][1] });
    const d = distanciaMetros(p, { lng: camino[i][0], lat: camino[i][1] });
    if (d < menor) {
      menor = d;
      mejor = acumulado;
    }
  }
  return mejor;
}

// ----------------------------------------------------------------------------
// El simulador: un solo punto para toda la app.
// ----------------------------------------------------------------------------

type Avisar = (posicion: GeolocationPosition) => void;

let posicion: Coordenada | null = null;
let rumbo: number | null = null;
let velocidad = 0;
let camino: Trazado | null = null;
let recorrido = 0;
const oyentes = new Map<number, Avisar>();
let siguienteId = 1;
let reloj: ReturnType<typeof setInterval> | null = null;

function inicio(): Coordenada {
  try {
    const p = JSON.parse(globalThis.localStorage?.getItem(CLAVE_PARTIDA) ?? "null") as { lat?: number; lng?: number } | null;
    if (typeof p?.lat === "number" && typeof p?.lng === "number") return { lat: p.lat, lng: p.lng };
  } catch {
    // Sin la central guardada, el centro de Arica.
  }
  return CENTRO_ARICA;
}

function lectura(): GeolocationPosition {
  const p = posicion ?? (posicion = inicio());
  return {
    coords: { latitude: p.lat, longitude: p.lng, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: rumbo, speed: velocidad },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition;
}

function avanzar(): void {
  if (camino && camino.length > 1) {
    const ritmo = METROS_POR_SEGUNDO * leerConfigGps().velocidad;
    recorrido += ritmo * (MS_LECTURA / 1000);
    const p = puntoEnCamino(camino, recorrido);
    posicion = { lat: p.lat, lng: p.lng };
    rumbo = p.rumbo ?? rumbo;
    velocidad = p.alFinal ? 0 : ritmo;
  } else {
    velocidad = 0;
  }
  const l = lectura();
  for (const avisar of oyentes.values()) avisar(l);
}

/** El camino a seguir: la línea de navegación hasta la parada activa. Se
 *  retoma desde donde está el punto (el camino nuevo empieza ahí). */
export function seguirCamino(nuevo: Trazado | null): void {
  if (nuevo === camino) return;
  camino = nuevo && nuevo.length > 1 ? nuevo : null;
  recorrido = camino && posicion ? metrosHasta(camino, posicion) : 0;
}

/** Imita navigator.geolocation. */
export const geolocalizacionSimulada = {
  watchPosition(avisar: Avisar): number {
    const id = siguienteId++;
    oyentes.set(id, avisar);
    setTimeout(() => avisar(lectura()), 0);
    reloj ??= setInterval(avanzar, MS_LECTURA);
    return id;
  },
  clearWatch(id: number): void {
    oyentes.delete(id);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  },
  getCurrentPosition(avisar: Avisar): void {
    setTimeout(() => avisar(lectura()), 0);
  },
};

export type FuenteUbicacion = Pick<Geolocation, "watchPosition" | "clearWatch" | "getCurrentPosition">;

/** De dónde sale la ubicación: el simulador en modo prueba, el aparato si no. */
export function fuenteUbicacion(): FuenteUbicacion | null {
  if (gpsSimulado()) return geolocalizacionSimulada as unknown as FuenteUbicacion;
  return typeof navigator !== "undefined" && navigator.geolocation ? navigator.geolocation : null;
}

// ----------------------------------------------------------------------------
// Para la pantalla.
// ----------------------------------------------------------------------------

function suscribir(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

let ultima: ConfigGps = { activo: true, velocidad: 5 };
function configEstable(): ConfigGps {
  const c = leerConfigGps();
  if (c.activo !== ultima.activo || c.velocidad !== ultima.velocidad) ultima = c;
  return ultima;
}

export function useConfigGps(): ConfigGps {
  return useSyncExternalStore(suscribir, configEstable, () => ultima);
}

/** ¿La ubicación es la simulada? Cambia al encender o apagar cualquiera de los dos. */
export function useGpsSimulado(): boolean {
  const prueba = useModoPrueba();
  const { activo } = useConfigGps();
  return prueba && activo;
}

/** La pantalla le pasa al simulador el camino por delante (navegación). */
export function useSimularRecorrido(trazado: Trazado | null): void {
  const simulado = useGpsSimulado();
  useEffect(() => {
    if (simulado) seguirCamino(trazado);
  }, [simulado, trazado]);
}
