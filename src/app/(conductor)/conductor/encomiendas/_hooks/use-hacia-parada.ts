"use client";

// Lo que la pantalla necesita para mostrar el camino a la parada activa (spec 020;
// antes use-guia-navegacion.ts): cuánto falta, el punto pegado a la calle, hacia
// dónde mirar y si la señal del GPS quedó vieja. El aviso «Llámalo antes de bajar»
// se fue (dueño, 2026-11-09: consejo obvio).
//
// Desde la spec 047 guía ARES (sin voz ni cartel): la línea naranja, el mapa
// desde arriba que se acerca solo y, si el auto se sale de la línea, una nueva
// desde el auto con la red propia (lib/geo/desvio.ts y red/desde-el-auto.ts).
// Google Maps queda de respaldo (use-burbuja.ts). Todo se mide sobre el tramo de
// la línea del día que llega a la parada, o sobre el del desvío
// (lib/geo/hacia-parada.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { aLngLat } from "@/lib/geo/coordenada";
import { haciaParada, rumboAlLlegar, tramoHacia, type LineaDelDia, type TramoHacia } from "@/lib/geo/hacia-parada";
import { hayQueRetrazar, SIN_DESVIO } from "@/lib/geo/desvio";
import { redCargada } from "@/lib/geo/red/grafo";
import { trazarDesdeElAuto } from "@/lib/geo/red/desde-el-auto";
import type { Ubicacion } from "../_mapa/ruta-mapa";
import type { Parada } from "./use-dia-trabajo";
import { usePantallaEncendida } from "./use-pantalla-encendida";
import { usePuntoEnRuta } from "./use-punto-en-ruta";
import { useSimularRecorrido } from "@/lib/encomiendas/local/gps-simulado";
import { destinoParaNavegar } from "@/lib/geo/ruta-por-calles";
import { useRedDeCalles } from "./use-red-de-calles";

/** Con la última lectura más vieja que esto, el punto que se ve ya no es dónde
 *  está el conductor. */
const MS_UBICACION_VIEJA = 12_000;

/** Precisión por encima de la cual el punto ya no ubica ni la manzana. */
const PRECISION_DUDOSA_M = 40;

const MS_RUMBO_FRESCO = 30_000;

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
  // Donde se entrega la parada activa: en un condominio, su entrada (spec 031), que
  // es donde termina su tramo. Con eso la cámara se acerca, el GPS simulado camina y
  // la línea recta (fuera del tramo) apuntan al mismo lugar que «Navegar».
  const redLista = useRedDeCalles(hayRuta);
  const destinoActivo = useMemo(() => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return null;
    return destinoParaNavegar({ lat: activa.pedido.lat, lng: activa.pedido.lng });
    // redLista: cuando el mapa de calles termina de cargar, la entrada se recalcula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa, redLista]);

  // El tramo que llega a la parada activa. Memorizado: usePuntoEnRuta compara la
  // línea por identidad, y un arreglo nuevo en cada lectura le borraría la memoria.
  const pedidoActivo = activa?.pedido.id ?? null;
  const tramoDelDia = useMemo(
    () => (pedidoActivo ? tramoHacia(ruta, pedidoActivo) : null),
    [ruta, pedidoActivo],
  );
  // Si el auto se salió de la línea, la trazada desde él (spec 047). Vive solo en
  // memoria: la ruta guardada no cambia. Vale para su parada.
  const [desvio, setDesvio] = useState<{ pedidoId: string; tramo: TramoHacia } | null>(null);
  const tramo = desvio && desvio.pedidoId === pedidoActivo ? desvio.tramo : tramoDelDia;

  // La pantalla apagada suspende el GPS: sin esto el punto se congela a los
  // treinta segundos de no tocar nada.
  usePantallaEncendida(hayRuta);

  // La lectura cruda del GPS cae adentro de las manzanas. Mientras el auto vaya
  // por el tramo, el punto se dibuja SOBRE él.
  const pegado = usePuntoEnRuta(miUbicacion, tramo?.linea ?? null);

  // ¿Trazar de nuevo desde el auto? Con cada lectura nueva, al dibujar (como el
  // pegado): desvio.ts decide y la red propia traza, sin consultas. La hora es la
  // de la lectura, no la del reloj: el dibujado queda puro.
  const [estadoDesvio, setEstadoDesvio] = useState(SIN_DESVIO);
  const [lecturaVista, setLecturaVista] = useState(miUbicacion);
  if (miUbicacion !== lecturaVista) {
    setLecturaVista(miUbicacion);
    const parada = activa && activa.pedido.lat != null && activa.pedido.lng != null ? { lat: activa.pedido.lat, lng: activa.pedido.lng } : null;
    if (miUbicacion && parada && pedidoActivo) {
      const { retrazar, estado } = hayQueRetrazar(estadoDesvio, {
        clave: pedidoActivo,
        metrosALaLinea: pegado?.desvioM ?? null,
        sinLinea: tramo == null,
        precisionM: miUbicacion.precisionM,
        ahora: miUbicacion.tomadaEn ?? 0,
      });
      setEstadoDesvio(estado);
      // Un rumbo de hace más de 30 s (detenido) no dice hacia dónde sale el auto.
      const fresco = miUbicacion.rumboEn == null || (miUbicacion.tomadaEn ?? 0) - miUbicacion.rumboEn < MS_RUMBO_FRESCO;
      const red = retrazar ? redCargada() : null;
      const camino = red && trazarDesdeElAuto(red, miUbicacion, fresco ? miUbicacion.heading : null, parada, rumboAlLlegar(tramoDelDia?.linea));
      if (camino) setDesvio({ pedidoId: pedidoActivo, tramo: camino });
    }
  }

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
    rumbo,
    ubicacionMostrada,
    trazadoPorDelante,
    señalDebil,
  };
}
