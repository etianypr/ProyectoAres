"use client";

// La cámara del mapa en modo navegación (sale de ruta-mapa.tsx, spec 002 T038).

import { useEffect, useRef, type RefObject } from "react";
import type * as maplibregl from "maplibre-gl";
import { aLngLat, distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import {
  GRADOS_MINIMOS_PARA_GIRAR,
  MS_DESPLAZAMIENTO,
  PITCH_NAVEGACION,
  RELLENO_LADOS_ENCUADRE,
  SIN_RELLENO,
  ZOOM_MINIMO_ENCUADRE,
  ZOOM_MINIMO_PARA_CAMBIAR,
  difAngulo,
  encuadreGirado,
  llegandoAParada,
  puntosDelEncuadre,
  zoomDeSeguimiento,
} from "./camara";
import type { Trazado } from "@/lib/geo/coordenada";
import type { Ubicacion } from "./tipos";

export function useCamaraNavegacion({
  mapaRef,
  mapaListo,
  miUbicacion,
  rumbo,
  claveDestino,
  destino,
  siguiendo,
  encuadre = null,
  porDelante = null,
  refs: { entroModoNavegacionRef, claveOrientadaRef, usuarioMovioRef, gestoRef, zoomManualRef },
}: {
  /** La línea naranja, desde el auto hasta la parada: lo que se encuadra (spec 047). */
  porDelante?: Trazado | null;
  mapaRef: RefObject<maplibregl.Map | null>;
  mapaListo: boolean;
  miUbicacion?: Ubicacion | null;
  rumbo?: number | null;
  claveDestino?: string | null;
  /** La parada activa: a 250 m o menos el mapa se acerca para la llegada. */
  destino?: Coordenada | null;
  siguiendo: boolean;
  /** Lo que tapan arriba el carril y abajo la hoja cerrada, en px. Con esto y una
   *  parada activa, seguir = encuadrar el auto y la parada (camara.ts). */
  encuadre?: { arriba: number; abajo: number } | null;
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
  const llegandoRef = useRef(false);
  /** Si lo último fue encuadrar: al pasar de un modo al otro se vuelve a entrar. */
  const encuadrandoRef = useRef(false);
  const arriba = encuadre?.arriba ?? null;
  const abajo = encuadre?.abajo ?? null;
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

    const encuadrar = destino != null && arriba != null && abajo != null;
    if (encuadrar !== encuadrandoRef.current) {
      encuadrandoRef.current = encuadrar;
      entroModoNavegacionRef.current = false;
      claveOrientadaRef.current = null;
    }

    if (encuadrar) {
      // El auto y ~800 m de línea por delante en lo que queda visible entre el
      // carril y la hoja, girado al camino con el mismo piso de grados (camara.ts,
      // spec 047). Se acerca solo: a menos de 800 m, la línea es más corta.
      const entrando = !entroModoNavegacionRef.current;
      const otroCamino = claveOrientadaRef.current !== (claveDestino ?? null);
      entroModoNavegacionRef.current = true;
      claveOrientadaRef.current = claveDestino ?? null;
      usuarioMovioRef.current = false;
      const actual = mapa.getBearing();
      const girar = rumbo != null && (entrando || difAngulo(rumbo, actual) >= GRADOS_MINIMOS_PARA_GIRAR);
      const contenedor = mapa.getContainer();
      // En una pantalla baja (teclado, hoja alta) el relleno no puede comerse el mapa.
      const recorte = Math.max(0, Math.min(1, (contenedor.clientHeight - 120) / Math.max(1, arriba + abajo)));
      const relleno = { top: arriba * recorte, bottom: abajo * recorte, left: RELLENO_LADOS_ENCUADRE, right: RELLENO_LADOS_ENCUADRE };
      const bearing = girar ? rumbo : actual;
      const { centro, zoom } = encuadreGirado(puntosDelEncuadre(miUbicacion, porDelante, destino), bearing, {
        ancho: contenedor.clientWidth,
        alto: contenedor.clientHeight,
        arriba: relleno.top,
        abajo: relleno.bottom,
        lados: RELLENO_LADOS_ENCUADRE,
      });
      const cambiarZoom = entrando || otroCamino || Math.abs(zoom - mapa.getZoom()) >= ZOOM_MINIMO_ENCUADRE;
      mapa.easeTo({
        center: aLngLat(centro),
        ...(cambiarZoom ? { zoom } : {}),
        bearing,
        pitch: 0,
        padding: relleno,
        duration: entrando ? 1000 : otroCamino ? 800 : MS_DESPLAZAMIENTO,
        ...(entrando || otroCamino ? {} : { easing: (t: number) => t }),
        essential: true,
      });
      return;
    }

    const centro = aLngLat(miUbicacion);
    llegandoRef.current = llegandoAParada(destino ? distanciaMetros(miUbicacion, destino) : null, llegandoRef.current);
    const zoomDeseado = zoomDeSeguimiento(miUbicacion.velocidad, llegandoRef.current);

    // Acomodarse al camino, que pasa en tres momentos y con una sola condición:
    //
    //   · al ENTRAR a modo navegación;
    //   · en cuanto aparece el rumbo del camino. Al abrir la app, la entrada
    //     corre con la primera lectura de GPS —cuando el tramo todavía no llegó
    //     de la API—, así que no hay hacia dónde mirar; y detenido en el galpón
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
        zoom: zoomManualRef.current ? mapa.getZoom() : zoomDeseado,
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
    const zoom = zoomDeseado;
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
  }, [miUbicacion, rumbo, claveDestino, destino, siguiendo, arriba, abajo, porDelante, mapaListo, mapaRef, entroModoNavegacionRef, claveOrientadaRef, usuarioMovioRef, gestoRef, zoomManualRef]);
}
