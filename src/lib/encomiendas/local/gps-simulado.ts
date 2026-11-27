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
import { redCargada } from "@/lib/geo/red/grafo";
import { aristaConexa } from "@/lib/geo/red/conexa";
import { pegarALaRed } from "@/lib/geo/red/pegar";

const CLAVE = "ares-gps-simulado";
const EVENTO = "ares-gps-simulado";
/** Donde generar-ruta/partida.ts guarda la central ya ubicada. */
const CLAVE_PARTIDA = "dashund-partida-empresa";
/** 30 km/h: lo que se anda en Arica entre parada y parada. */
const METROS_POR_SEGUNDO = 30 / 3.6;
/** Una lectura por segundo, como el GPS de verdad; a ×10 y ×20, cuatro: si no,
 *  el punto saltaría 80-170 m de una lectura a otra. */
function msLectura(): number {
  return leerConfigGps().velocidad > 5 ? 250 : 1000;
}

export const VELOCIDADES = [1, 5, 10, 20] as const;
type ConfigGps = { activo: boolean; velocidad: number };

/** Sin nada guardado, activo: en modo prueba lo normal es no tener el GPS real. */
function leerConfigGps(): ConfigGps {
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
let reloj: ReturnType<typeof setTimeout> | null = null;
/** Cuándo avanzó por última vez: se avanza por el tiempo que pasó de verdad. */
let ultimoAvance = 0;
/** Tras un desvío simulado el punto espera aquí (ver pedirDesvio). */
let quietoHasta = 0;

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
  const ahora = Date.now();
  const segundos = ultimoAvance ? (ahora - ultimoAvance) / 1000 : 0;
  ultimoAvance = ahora;
  if (ahora < quietoHasta) {
    velocidad = 0;
  } else if (camino && camino.length > 1) {
    const ritmo = METROS_POR_SEGUNDO * leerConfigGps().velocidad;
    recorrido += ritmo * segundos;
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

/** El reloj se vuelve a programar en cada lectura: así cambiar la velocidad
 *  cambia también cada cuánto se lee. */
function programar(): void {
  reloj = setTimeout(() => {
    avanzar();
    if (oyentes.size > 0) programar();
    else reloj = null;
  }, msLectura());
}

/** El camino a seguir: la línea de navegación hasta la parada activa. Se
 *  retoma desde donde está el punto (el camino nuevo empieza ahí). */
function seguirCamino(nuevo: Trazado | null): void {
  if (nuevo === camino) return;
  camino = nuevo && nuevo.length > 1 ? nuevo : null;
  recorrido = camino && posicion ? metrosHasta(camino, posicion) : 0;
}

/** Cuánto se corre el punto al simular un desvío: una cuadra de Arica y algo. */
const METROS_DESVIO = 120;
/** Lo que espera ahí: que la pantalla note el desvío (dos lecturas) y trace de nuevo. */
const MS_QUIETO_DESVIO = 3_000;

/** El punto `metros` más allá hacia `rumbo`. Pura. */
export function desplazar(p: Coordenada, rumbo: number, metros: number): Coordenada {
  const r = (rumbo * Math.PI) / 180;
  const lat = p.lat + (Math.cos(r) * metros) / 111_195;
  return { lat, lng: p.lng + (Math.sin(r) * metros) / (111_195 * Math.cos((p.lat * Math.PI) / 180)) };
}

/**
 * Simula que el conductor tomó otra calle (spec 047): el punto salta una cuadra a
 * la derecha, a la calle más cercana, y espera ahí 3 s con el mismo rumbo. La
 * pantalla ve que se salió de la línea y traza una nueva desde él, que el punto
 * sigue. false si no hay simulador andando.
 */
export function pedirDesvio(): boolean {
  if (!posicion || oyentes.size === 0) return false;
  const lado = desplazar(posicion, (rumbo ?? 0) + 90, METROS_DESVIO);
  const red = redCargada();
  posicion = (red && pegarALaRed(red, lado, 200, aristaConexa)?.punto) || lado;
  camino = null;
  recorrido = 0;
  velocidad = 0;
  quietoHasta = Date.now() + MS_QUIETO_DESVIO;
  const l = lectura();
  for (const avisar of oyentes.values()) avisar(l);
  return true;
}

/** Imita navigator.geolocation. */
const geolocalizacionSimulada = {
  watchPosition(avisar: Avisar): number {
    const id = siguienteId++;
    oyentes.set(id, avisar);
    setTimeout(() => avisar(lectura()), 0);
    if (!reloj) {
      ultimoAvance = Date.now();
      programar();
    }
    return id;
  },
  clearWatch(id: number): void {
    oyentes.delete(id);
    if (oyentes.size === 0 && reloj) {
      clearTimeout(reloj);
      reloj = null;
    }
  },
  getCurrentPosition(avisar: Avisar): void {
    setTimeout(() => avisar(lectura()), 0);
  },
};

type FuenteUbicacion = Pick<Geolocation, "watchPosition" | "clearWatch" | "getCurrentPosition">;

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
