"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Las dos fórmulas —distancia y rumbo entre dos puntos— viven en lib/rutas.ts,
// que es donde se usan para el trazado y la navegación. Acá estaban repetidas
// palabra por palabra.
import { distanciaMetros, rumboEntre } from "@/lib/rutas";
import type { Ubicacion } from "./ruta-mapa";

// Bajo este umbral, el "movimiento" entre dos lecturas es puro temblor de la
// señal GPS estando quieto — calcular un rumbo con eso daría una flecha
// girando sola sin sentido.
const DISTANCIA_MINIMA_RUMBO_M = 8;

// ----------------------------------------------------------------------------
// Qué lecturas se tiran
// ----------------------------------------------------------------------------
// El GPS no avisa "esta no la sé": manda igual una posición, con un radio de
// error de 150 metros. Ese es el punto que aparece adentro de una manzana o
// sobre el mar. Mientras hay ruta activa se corrige pegándolo al camino (ver
// ajustarATrazado), pero sin ruta —antes de generarla, o con el día terminado—
// no hay a qué pegarlo, así que la única defensa es no dibujarlo.
//
// 60 m es el corte: por debajo, una lectura sirve para ubicar la cuadra; por
// encima no ubica ni la manzana. La PRIMERA lectura entra igual aunque sea
// mala, porque dejar el mapa clavado en el centro de Arica esperando una buena
// es peor que un punto impreciso que después se afina.
const PRECISION_MAXIMA_M = 60;

// Más rápido que esto entre dos lecturas no es un auto: es el GPS rebotando
// entre edificios o reenganchando satélites. 55 m/s son ~200 km/h.
const VELOCIDAD_IMPOSIBLE_MS = 55;

// Debajo de esta velocidad el aparato está detenido y el rumbo entre dos
// lecturas es ruido. Solo se usa cuando el GPS informa velocidad — iOS muchas
// veces no lo hace, y ahí manda el respaldo por distancia de arriba.
const VELOCIDAD_MINIMA_RUMBO_MS = 1;

// Sin ubicación no hay NADA del modo navegación (ni flecha, ni giro del mapa,
// ni instrucciones): antes los errores se descartaban en silencio, así que
// cuando el permiso estaba denegado la pantalla simplemente no hacía nada y
// no había forma de saber por qué. Estos mensajes se muestran en pantalla.
function mensajeError(e: GeolocationPositionError): string {
  if (e.code === e.PERMISSION_DENIED) {
    // Los navegadores tratan un origen no seguro (http://) como permiso
    // denegado, sin distinguirlo — de ahí este chequeo para no dar un
    // mensaje que manda a revisar un permiso que no es el problema.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "El navegador solo entrega la ubicación en sitios seguros. Abre la app con una dirección https:// (o localhost).";
    }
    return "Permiso de ubicación denegado. Actívalo para este sitio en los ajustes del navegador y vuelve a entrar.";
  }
  if (e.code === e.POSITION_UNAVAILABLE) {
    return "No se pudo determinar tu ubicación (sin señal de GPS).";
  }
  if (e.code === e.TIMEOUT) {
    return "La ubicación tardó demasiado en responder. Toca el botón de centrar para reintentar.";
  }
  return "No se pudo obtener tu ubicación.";
}

export type EstadoUbicacion = {
  ubicacion: Ubicacion | null;
  /** Mensaje listo para mostrar, o null si todo va bien / aún no se sabe. */
  error: string | null;
  /** Pide la posición una vez, a mano (botón "centrar"): dispara el diálogo
   *  de permiso si todavía no se decidió, y deja el error a la vista. */
  pedirAhora: () => void;
};

// Posición GPS del chofer, actualizada sola cuando el navegador detecta un
// cambio de posición relevante (watchPosition, no un intervalo fijo — así no
// gasta batería de más).
//
// También calcula el rumbo (hacia dónde se dirige) para el modo navegación
// del mapa: se usa el que entrega el propio GPS cuando está disponible
// (`coords.heading`, común en Android caminando/manejando) y, si no, se
// estima comparando con la posición anterior — pero solo si se movió lo
// suficiente como para que el cálculo no sea ruido puro estando detenido; en
// ese caso se conserva el último rumbo conocido en vez de perder la
// orientación cada vez que el chofer para en un semáforo.
export function useUbicacionActual(activo: boolean): EstadoUbicacion {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anteriorRef = useRef<{ lat: number; lng: number; tomadaEn: number } | null>(null);
  const rumboRef = useRef<number | null>(null);

  const aplicar = useCallback((pos: GeolocationPosition) => {
    const actual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const precisionM = pos.coords.accuracy ?? null;
    const tomadaEn = pos.timestamp || Date.now();
    const anterior = anteriorRef.current;

    // Una lectura tirada NO es un error que mostrar: el GPS sigue funcionando y
    // la próxima puede venir bien. Se descarta en silencio y el punto se queda
    // en la última buena; que quedó vieja se ve en la pantalla por otro lado
    // (ver el aviso de señal débil en ruta-conductor).
    if (anterior) {
      if (precisionM != null && precisionM > PRECISION_MAXIMA_M) return;

      const segundos = Math.max(0.001, (tomadaEn - anterior.tomadaEn) / 1000);
      if (distanciaMetros(anterior, actual) / segundos > VELOCIDAD_IMPOSIBLE_MS) return;
    }

    let heading = pos.coords.heading;
    const velocidad = pos.coords.speed;
    // Detenido, el rumbo entre dos lecturas es el temblor de la señal. Cuando el
    // aparato informa velocidad se le cree a ella; si no, decide la distancia.
    const quieto = velocidad != null && !Number.isNaN(velocidad)
      ? velocidad < VELOCIDAD_MINIMA_RUMBO_MS
      : false;

    if (heading == null || Number.isNaN(heading)) {
      if (
        !quieto &&
        anterior &&
        distanciaMetros(anterior, actual) >= DISTANCIA_MINIMA_RUMBO_M
      ) {
        heading = rumboEntre(anterior, actual);
      } else {
        // Se conserva el último conocido: perder la orientación en cada
        // semáforo enderezaría el mapa al norte a mitad de cuadra.
        heading = rumboRef.current;
      }
    }

    rumboRef.current = heading;
    anteriorRef.current = { ...actual, tomadaEn };
    setError(null);
    setUbicacion({ ...actual, heading, precisionM, tomadaEn, velocidad });
  }, []);

  useEffect(() => {
    if (!activo || typeof navigator === "undefined" || !navigator.geolocation) return;

    // maximumAge: 0 — sin esto el navegador puede entregar una posición
    // guardada de hasta 15 segundos antes, y al arrancar la jornada eso es la
    // del galpón de ayer. Manejando, 15 segundos son tres cuadras.
    const watchId = navigator.geolocation.watchPosition(
      aplicar,
      (e) => setError(mensajeError(e)),
      { enableHighAccuracy: true, maximumAge: 0 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activo, aplicar]);

  const pedirAhora = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Este navegador no puede entregar tu ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(aplicar, (e) => setError(mensajeError(e)), {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  }, [aplicar]);

  return { ubicacion, error, pedirAhora };
}
