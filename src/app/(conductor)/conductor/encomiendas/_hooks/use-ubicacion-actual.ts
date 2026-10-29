"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { distanciaMetros, rumboEntre } from "@/lib/geo/coordenada";
import { alVolverAPrimerPlano } from "@/lib/nativo/entorno";
import { fuenteUbicacion, gpsSimulado, useGpsSimulado } from "@/lib/encomiendas/local/gps-simulado";
import type { Ubicacion } from "../_mapa/ruta-mapa";

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

// Sin ninguna lectura en este tiempo, el seguimiento se da por muerto y se arma
// de nuevo (spec 017, N7). Pasa al volver de una llamada o de otra app: el
// WebView deja el seguimiento colgado sin avisar con un error.
const MS_SIN_LECTURAS_PARA_REARMAR = 30_000;

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

// Posición GPS del conductor, actualizada sola cuando el navegador detecta un
// cambio de posición relevante (watchPosition, no un intervalo fijo — así no
// gasta batería de más).
//
// También calcula el rumbo (hacia dónde se dirige) para el modo navegación
// del mapa: se usa el que entrega el propio GPS cuando está disponible
// (`coords.heading`, común en Android caminando/manejando) y, si no, se
// estima comparando con la posición anterior — pero solo si se movió lo
// suficiente como para que el cálculo no sea ruido puro estando detenido; en
// ese caso se conserva el último rumbo conocido en vez de perder la
// orientación cada vez que el conductor para en un semáforo.
export function useUbicacionActual(activo: boolean): EstadoUbicacion {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anteriorRef = useRef<{ lat: number; lng: number; tomadaEn: number; precisionM: number | null } | null>(
    null,
  );
  const rumboRef = useRef<{ grados: number; en: number } | null>(null);
  /** Cuándo llegó la última lectura, sirva o no: es lo que dice si el GPS sigue vivo. */
  const ultimaLecturaRef = useRef(0);
  /** Cambia para armar de nuevo el seguimiento (ver MS_SIN_LECTURAS_PARA_REARMAR). */
  const [armado, setArmado] = useState(0);

  const aplicar = useCallback((pos: GeolocationPosition) => {
    const actual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const precisionM = pos.coords.accuracy ?? null;
    const tomadaEn = pos.timestamp || Date.now();
    const anterior = anteriorRef.current;
    ultimaLecturaRef.current = Date.now();

    // Una lectura tirada NO es un error que mostrar: el GPS sigue funcionando y
    // la próxima puede venir bien. Se descarta en silencio y el punto se queda
    // en la última buena; que quedó vieja se ve en la pantalla por otro lado
    // (ver el aviso de "GPS débil" en carril-superior.tsx).
    if (anterior) {
      // La primera lectura entra aunque sea mala, y antes eso la dejaba de
      // referencia: las buenas que venían después "saltaban" más rápido de lo
      // posible desde ella y se tiraban todas (spec 017, N8). Si la que hay es
      // mala, cualquier lectura más precisa la reemplaza, sin freno de velocidad.
      const anteriorBuena = anterior.precisionM == null || anterior.precisionM <= PRECISION_MAXIMA_M;
      if (precisionM != null && precisionM > PRECISION_MAXIMA_M) {
        if (anteriorBuena || precisionM >= (anterior.precisionM ?? Infinity)) return;
      }

      const segundos = Math.max(0.001, (tomadaEn - anterior.tomadaEn) / 1000);
      // El simulado a ×10 o ×20 va "imposiblemente" rápido a propósito: el filtro
      // es para los saltos falsos del GPS de verdad.
      if (anteriorBuena && !gpsSimulado() && distanciaMetros(anterior, actual) / segundos > VELOCIDAD_IMPOSIBLE_MS) return;
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
        // semáforo enderezaría el mapa al norte a mitad de cuadra. Va con la
        // hora en que se midió, para que la navegación sepa cuándo ya no sirve.
        heading = null;
      }
    }

    if (heading != null) rumboRef.current = { grados: heading, en: tomadaEn };
    anteriorRef.current = { ...actual, tomadaEn, precisionM };
    setError(null);
    setUbicacion({
      ...actual,
      heading: rumboRef.current?.grados ?? null,
      rumboEn: rumboRef.current?.en ?? null,
      precisionM,
      tomadaEn,
      velocidad,
    });
  }, []);

  // En modo prueba con el GPS simulado, la ubicación sale del simulador
  // (gps-simulado.ts); al encenderlo o apagarlo se vuelve a armar.
  const simulado = useGpsSimulado();
  useEffect(() => {
    const fuente = fuenteUbicacion();
    if (!activo || !fuente) return;

    // maximumAge: 0 — sin esto el navegador puede entregar una posición
    // guardada de hasta 15 segundos antes, y al arrancar el día eso es la
    // del galpón de ayer. Manejando, 15 segundos son tres cuadras.
    ultimaLecturaRef.current = Date.now();
    const watchId = fuente.watchPosition(
      aplicar,
      (e) => setError(mensajeError(e)),
      { enableHighAccuracy: true, maximumAge: 0 },
    );

    return () => fuente.clearWatch(watchId);
  }, [activo, aplicar, armado, simulado]);

  // Se arma de nuevo al volver a primer plano y cuando deja de llegar todo
  // (spec 017, N7). Armarlo de más no cuesta nada; quedarse sin GPS manejando,
  // sí: el punto se congela y la navegación deja de avanzar.
  useEffect(() => {
    if (!activo) return;
    const rearmar = () => setArmado((n) => n + 1);
    const quitar = alVolverAPrimerPlano(rearmar);
    const vigia = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (Date.now() - ultimaLecturaRef.current > MS_SIN_LECTURAS_PARA_REARMAR) rearmar();
    }, MS_SIN_LECTURAS_PARA_REARMAR / 2);
    return () => {
      quitar();
      clearInterval(vigia);
    };
  }, [activo]);

  const pedirAhora = useCallback(() => {
    const fuente = fuenteUbicacion();
    if (!fuente) {
      setError("Este navegador no puede entregar tu ubicación.");
      return;
    }
    fuente.getCurrentPosition(
      (pos) => {
        aplicar(pos);
        // Si el seguimiento había fallado (permiso concedido recién, en los
        // ajustes), esta lectura prueba que ya se puede: se arma de nuevo.
        setArmado((n) => n + 1);
      },
      (e) => setError(mensajeError(e)),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [aplicar]);

  return { ubicacion, error, pedirAhora };
}
