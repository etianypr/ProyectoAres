"use client";

// La cámara del mapa en modo navegación (sale de ruta-mapa.tsx, spec 002 T038).

import { useEffect, type RefObject } from "react";
import type mapboxgl from "mapbox-gl";
import { aLngLat } from "@/lib/geo/coordenada";
import {
  GRADOS_MINIMOS_PARA_GIRAR,
  MS_DESPLAZAMIENTO,
  PITCH_NAVEGACION,
  SIN_RELLENO,
  ZOOM_MINIMO_PARA_CAMBIAR,
  difAngulo,
  zoomPorVelocidad,
} from "./camara";
import type { Ubicacion } from "./tipos";

export function useCamaraNavegacion({
  mapaRef,
  mapaListo,
  miUbicacion,
  rumbo,
  claveDestino,
  siguiendo,
  refs: { entroModoNavegacionRef, claveOrientadaRef, usuarioMovioRef, gestoRef, zoomManualRef },
}: {
  mapaRef: RefObject<mapboxgl.Map | null>;
  mapaListo: boolean;
  miUbicacion?: Ubicacion | null;
  rumbo?: number | null;
  claveDestino?: string | null;
  siguiendo: boolean;
  /** Estado compartido con el resto del mapa (gestos, encuadre). */
  refs: {
    entroModoNavegacionRef: RefObject<boolean>;
    claveOrientadaRef: RefObject<string | null>;
    usuarioMovioRef: RefObject<boolean>;
    gestoRef: RefObject<boolean>;
    zoomManualRef: RefObject<boolean>;
  };
}) {
  // Modo navegación. Todo el movimiento pasa por easeTo, que desplaza, GIRA e
  // inclina en una sola animación — es exactamente lo que Leaflet no podía
  // hacer y el motivo del enredo que había acá antes.
  //
  // Al ENTRAR (recién abierto con ubicación disponible, o al tocar "centrar")
  // hace el acercamiento con inclinación, como el arranque de un viaje en Maps.
  // Después solo desplaza y gira, sin volver a tocar el zoom, para que el
  // conductor pueda acercar o alejar con los dedos y su zoom se respete.
  //
  // Al soltar el seguimiento el mapa se queda como está: no se endereza al
  // norte ni se baja la inclinación. Girarle la vista mientras tiene el dedo
  // apoyado es lo que hacía que la ruta pareciera acomodarse después del gesto.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !miUbicacion || !siguiendo) {
      if (!siguiendo) {
        // Al retomar el seguimiento hay que volver a acomodar la vista, así que
        // se olvidan las dos cosas: que se entró, y a qué camino se apuntó.
        entroModoNavegacionRef.current = false;
        claveOrientadaRef.current = null;
      }
      return;
    }
    if (gestoRef.current) return;

    const centro = aLngLat(miUbicacion);

    // Acomodarse al camino, que pasa en tres momentos y con una sola condición:
    //
    //   · al ENTRAR a modo navegación;
    //   · en cuanto aparece el rumbo del camino. Al abrir la app, la entrada
    //     corre con la primera lectura de GPS —cuando el tramo todavía no llegó
    //     de Mapbox—, así que no hay hacia dónde mirar; y detenido en el galpón
    //     el iPhone no entrega rumbo, nunca, así que sin esto la vista se
    //     quedaría torcida hasta empezar a andar;
    //   · al cambiar de parada, que es un camino nuevo.
    //
    // La clave se registra solo cuando hay rumbo: mientras no lo haya, la
    // condición sigue pendiente y se dispara sola apenas llegue el tramo.
    const entrando = !entroModoNavegacionRef.current;
    const otroCamino = rumbo != null && claveOrientadaRef.current !== (claveDestino ?? null);

    if (entrando || otroCamino) {
      if (entrando) zoomManualRef.current = false;
      entroModoNavegacionRef.current = true;
      if (rumbo != null) claveOrientadaRef.current = claveDestino ?? null;
      usuarioMovioRef.current = false;
      mapa.easeTo({
        center: centro,
        zoom: zoomManualRef.current ? mapa.getZoom() : zoomPorVelocidad(miUbicacion.velocidad),
        pitch: PITCH_NAVEGACION,
        bearing: rumbo ?? mapa.getBearing(),
        padding: SIN_RELLENO,
        // Entrar es un movimiento anunciado; acomodarse a un camino nuevo tiene
        // que sentirse como un ajuste y no como si el mapa volviera a empezar.
        duration: entrando ? 1200 : 800,
        essential: true,
      });
      return;
    }

    // Sin rumbo conocido se conserva el que ya tiene: pasarle 0 enderezaría
    // el mapa al norte cada vez que el conductor se detiene en un semáforo. Y un
    // cambio de un par de grados tampoco se aplica: es ruido del rumbo
    // estimado, no una curva.
    const actual = mapa.getBearing();
    const girar = rumbo != null && difAngulo(rumbo, actual) >= GRADOS_MINIMOS_PARA_GIRAR;
    const zoom = zoomPorVelocidad(miUbicacion.velocidad);
    const acercar = !zoomManualRef.current && Math.abs(zoom - mapa.getZoom()) >= ZOOM_MINIMO_PARA_CAMBIAR;

    mapa.easeTo({
      center: centro,
      bearing: girar ? rumbo : actual,
      ...(acercar ? { zoom } : {}),
      padding: SIN_RELLENO,
      duration: MS_DESPLAZAMIENTO,
      easing: (t) => t, // lineal: el GPS entrega posiciones a ritmo constante
      essential: true,
    });
  }, [miUbicacion, rumbo, claveDestino, siguiendo, mapaListo, mapaRef, entroModoNavegacionRef, claveOrientadaRef, usuarioMovioRef, gestoRef, zoomManualRef]);
}
