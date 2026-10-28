"use client";

// El punto del conductor sobre el mapa: se crea una vez y después se desliza, gira
// y cambia de figura; su tamaño acompaña al zoom (sale de ruta-mapa.tsx, spec
// 002 T038).

import { useEffect, type RefObject } from "react";
import mapboxgl from "mapbox-gl";
import { aLngLat } from "@/lib/geo/coordenada";
import { ajustarEscalaMarcador, deslizarMarcador, elementoUbicacion } from "./marcadores-dom";
import type { Ubicacion } from "./tipos";

export function useMarcadorConductor({
  mapaRef,
  mapaListo,
  miUbicacion,
  rumbo,
  rumboBrujula,
  siguiendo,
  marcadorUbicacionRef,
  cuadroMarcadorRef,
}: {
  mapaRef: RefObject<mapboxgl.Map | null>;
  mapaListo: boolean;
  miUbicacion?: Ubicacion | null;
  rumbo?: number | null;
  rumboBrujula?: number | null;
  siguiendo: boolean;
  /** Los crea el mapa: al desarmarse los suelta (ver la limpieza en ruta-mapa). */
  marcadorUbicacionRef: RefObject<mapboxgl.Marker | null>;
  cuadroMarcadorRef: RefObject<number | null>;
}) {
  // El marcador del conductor. Se crea UNA vez y después solo se le actualiza la
  // posición, el rumbo y qué figura se muestra.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !miUbicacion) return;

    const centro = aLngLat(miUbicacion);
    const rumboDelHaz = rumboBrujula ?? rumbo;
    const conHaz = !siguiendo && rumboDelHaz != null;
    const conFlecha = siguiendo && rumbo != null;
    // Sin ninguna de las dos se deja en 0: da igual hacia dónde apunte un disco.
    const rotacion = (conHaz ? rumboDelHaz : rumbo) ?? 0;

    if (!marcadorUbicacionRef.current) {
      marcadorUbicacionRef.current = new mapboxgl.Marker({
        element: elementoUbicacion(),
        // Acostado sobre la calle y girando con ella. De acá sale la
        // perspectiva —Mapbox le aplica rotateX(inclinación)— y por eso basta
        // con darle el rumbo real, sin compensar el giro del mapa.
        rotationAlignment: "map",
        pitchAlignment: "map",
      })
        .setLngLat(centro)
        .addTo(mapa);
      // Recién creado puede caer en un mapa alejado —la ruta del día encuadrada
      // entera, antes de la primera lectura de GPS—: sin esto aparece enorme
      // hasta que alguien toque el zoom.
      ajustarEscalaMarcador(marcadorUbicacionRef.current, mapa.getZoom());
      marcadorUbicacionRef.current.setRotation(rotacion);
    } else {
      // Con el mapa suelto va el haz, y lo orienta la brújula si la hay o el
      // último rumbo conocido si no. Manejando va la flecha, que sigue al camino.
      // Es UNA sola rotación —la del marcador entero— porque las dos figuras
      // nunca se muestran juntas: dos direcciones sobre el mismo punto no se leen.
      deslizarMarcador(marcadorUbicacionRef.current, centro, rotacion, cuadroMarcadorRef);
    }

    const el = marcadorUbicacionRef.current.getElement();
    const mostrar = (selector: string, visible: boolean) => {
      const g = el.querySelector<SVGGElement>(selector);
      if (g) g.style.opacity = visible ? "1" : "0";
    };
    mostrar("[data-cono]", conHaz);
    mostrar("[data-flecha]", conFlecha);
  }, [miUbicacion, rumbo, rumboBrujula, siguiendo, mapaListo, mapaRef, marcadorUbicacionRef, cuadroMarcadorRef]);

  // El zoom lo cambian los dedos del conductor y las animaciones de cámara, sin
  // pasar nunca por React: el tamaño del punto hay que ajustarlo escuchando al
  // mapa. "zoom" se dispara en cada cuadro del pellizco, así que el punto
  // acompaña el gesto en vez de saltar al soltar.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;

    const alCambiarZoom = () => {
      const marcador = marcadorUbicacionRef.current;
      if (marcador) ajustarEscalaMarcador(marcador, mapa.getZoom());
    };

    mapa.on("zoom", alCambiarZoom);
    return () => {
      mapa.off("zoom", alCambiarZoom);
    };
  }, [mapaListo, mapaRef, marcadorUbicacionRef]);
}
