"use client";

// Lo que la pantalla necesita para mostrar el camino a la parada activa (spec 020;
// antes use-guia-navegacion.ts): cuánto falta, el aviso de llamar antes de bajar,
// el punto pegado a la calle, hacia dónde mirar y si la señal del GPS quedó vieja.
//
// ARES ya no guía: no hay cartel ni voz ni rutas tramo a tramo. Guía Google Maps,
// con la burbuja de ARES encima (use-burbuja.ts). Todo se mide sobre el tramo de
// la línea del día que llega a la parada (lib/geo/hacia-parada.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { aLngLat } from "@/lib/geo/coordenada";
import { haciaParada, tramoHacia, type LineaDelDia } from "@/lib/geo/hacia-parada";
import type { Ubicacion } from "../_mapa/ruta-mapa";
import type { Parada } from "./use-dia-trabajo";
import { usePantallaEncendida } from "./use-pantalla-encendida";
import { usePuntoEnRuta } from "./use-punto-en-ruta";
import { useSimularRecorrido } from "@/lib/encomiendas/local/gps-simulado";

/** Con la última lectura más vieja que esto, el punto que se ve ya no es dónde
 *  está el conductor. */
const MS_UBICACION_VIEJA = 12_000;

/** A qué distancia de la parada se avisa que hay que contactar al receptor
 *  (FR-017).
 *
 *  Trescientos metros es más o menos una cuadra y media de Arica: lo suficiente
 *  para que el conductor alcance a llamar y a escuchar la respuesta antes de tener
 *  que estacionar, y no tanto como para que el aviso aparezca cuando todavía
 *  faltan cinco paradas. */
const METROS_AVISO_CONTACTO = 300;

/** Precisión por encima de la cual el punto ya no ubica ni la manzana. */
const PRECISION_DUDOSA_M = 40;

export function useHaciaParada({
  activa,
  ruta,
  miUbicacion,
  hayRuta,
}: {
  activa: Parada | null;
  /** La ruta del día guardada: su trazado y sus tramos. */
  ruta: LineaDelDia | null;
  /** La lectura CRUDA del GPS. */
  miUbicacion: Ubicacion | null;
  hayRuta: boolean;
}) {
  const destinoActivo = useMemo(() => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return null;
    return { lat: activa.pedido.lat, lng: activa.pedido.lng };
  }, [activa]);

  // El tramo que llega a la parada activa. Memorizado: usePuntoEnRuta compara la
  // línea por identidad, y un arreglo nuevo en cada lectura le borraría la memoria.
  const pedidoActivo = activa?.pedido.id ?? null;
  const tramo = useMemo(
    () => (pedidoActivo ? tramoHacia(ruta, pedidoActivo) : null),
    [ruta, pedidoActivo],
  );

  // La pantalla apagada suspende el GPS: sin esto el punto se congela a los
  // treinta segundos de no tocar nada.
  usePantallaEncendida(hayRuta);

  // La lectura cruda del GPS cae adentro de las manzanas. Mientras el auto vaya
  // por el tramo, el punto se dibuja SOBRE él.
  const pegado = usePuntoEnRuta(miUbicacion, tramo?.linea ?? null);

  const hacia = useMemo(
    () => (miUbicacion && destinoActivo ? haciaParada(miUbicacion, destinoActivo, tramo, pegado) : null),
    [miUbicacion, destinoActivo, tramo, pegado],
  );

  const faltan = hacia
    ? {
        metros: hacia.metros,
        segundos: hacia.segundos,
        llegada:
          hacia.segundos != null && miUbicacion?.tomadaEn != null ? miUbicacion.tomadaEn + hacia.segundos * 1000 : null,
      }
    : null;

  // FR-017: llegando a una parada cuyo receptor no contestó el WhatsApp y a la
  // que todavía no se llamó.
  //
  // Se mide por el TRAMO y no en línea recta: lo que importa es cuánto le falta
  // manejar, y en Arica una parada a doscientos metros en línea recta puede estar
  // a ochocientos por calle si en el medio hay una quebrada. Fuera del tramo no
  // se avisa por distancia: adivinarlo con la línea recta sería justo ese error.
  // El estado del receptor igual se ve en la tarjeta (y en la burbuja, "Llamar").
  const seAproximaSinContacto =
    !!activa?.hayQueContactar && !!hacia?.porTramo && hacia.metros <= METROS_AVISO_CONTACTO;

  // Hacia dónde orientar la vista: el camino que viene por delante en el tramo.
  // Se prefiere eso al rumbo del GPS —que en iPhone llega null casi siempre— y
  // sobre todo a la brújula, que apunta hacia donde quedó apoyado el teléfono.
  const rumbo = hacia?.rumbo ?? miUbicacion?.heading ?? null;

  const ubicacionMostrada: Ubicacion | null = useMemo(
    () =>
      pegado && miUbicacion ? { ...miUbicacion, lat: pegado.lat, lng: pegado.lng } : miUbicacion,
    [pegado, miUbicacion],
  );

  // La línea naranja de lo que falta arranca en el punto y no media cuadra más
  // atrás: con el mapa girado, la cola ya recorrida se lee como un camino a tomar.
  const trazadoPorDelante = hacia?.porDelante ?? null;

  // En modo prueba, el GPS simulado avanza por el tramo hasta la parada; fuera de
  // él, en línea recta (gps-simulado.ts).
  const caminoSimulado = useMemo(
    () =>
      trazadoPorDelante ??
      (miUbicacion && destinoActivo ? [aLngLat(miUbicacion), aLngLat(destinoActivo)] : null),
    [trazadoPorDelante, miUbicacion, destinoActivo],
  );
  useSimularRecorrido(caminoSimulado);

  // Que la última lectura haya quedado vieja se mira con un reloj propio:
  // mientras el GPS avisa cada lectura provoca un dibujado, pero cuando DEJA de
  // avisar —que es el caso a denunciar— no hay nada que lo dispare.
  const ubicacionRef = useRef(miUbicacion);
  useEffect(() => {
    ubicacionRef.current = miUbicacion;
  }, [miUbicacion]);

  const [ubicacionVieja, setUbicacionVieja] = useState(false);
  useEffect(() => {
    if (!hayRuta) return;
    const t = setInterval(() => {
      const tomadaEn = ubicacionRef.current?.tomadaEn;
      setUbicacionVieja(tomadaEn != null && Date.now() - tomadaEn > MS_UBICACION_VIEJA);
    }, 2_000);
    return () => clearInterval(t);
  }, [hayRuta]);

  const señalDebil =
    miUbicacion != null &&
    (ubicacionVieja ||
      (miUbicacion.precisionM != null && miUbicacion.precisionM > PRECISION_DUDOSA_M));

  return {
    destinoActivo,
    faltan,
    seAproximaSinContacto,
    rumbo,
    ubicacionMostrada,
    trazadoPorDelante,
    señalDebil,
  };
}
