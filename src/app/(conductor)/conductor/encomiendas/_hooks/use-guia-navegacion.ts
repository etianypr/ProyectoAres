"use client";

// Todo lo que la pantalla necesita para guiar al conductor hasta la parada activa
// (spec 002, T036): el tramo paso a paso, la voz, el punto pegado al camino,
// hacia dónde mirar, y si la señal del GPS quedó vieja. Sale de pantalla.tsx tal
// cual estaba; el orden de los hooks es el mismo.

import { useEffect, useMemo, useRef, useState } from "react";
import { metrosRestantes, recortarTrazado, rumboDelCamino } from "@/lib/geo/trazado";
import type { Ubicacion } from "../_mapa/ruta-mapa";
import type { Parada } from "./use-dia-trabajo";
import { useNavegacion } from "./use-navegacion";
import { useVozNavegacion } from "./use-voz";
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

export function useGuiaNavegacion({
  activa,
  miUbicacion,
  propuestaALaVista,
  hayRuta,
}: {
  activa: Parada | null;
  /** La lectura CRUDA del GPS. */
  miUbicacion: Ubicacion | null;
  /** Con una propuesta a la vista la voz se calla. */
  propuestaALaVista: boolean;
  hayRuta: boolean;
}) {
  // Instrucción paso a paso hacia la parada activa.
  const destinoActivo = useMemo(() => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return null;
    return { lat: activa.pedido.lat, lng: activa.pedido.lng };
  }, [activa]);

  // Recibe la posición CRUDA, no la pegada al camino: es la que decide si el
  // conductor se salió de la ruta, y un punto pegado está sobre la ruta por
  // definición — alimentarlo con eso haría que un desvío no se detecte nunca.
  const navegacion = useNavegacion(!!destinoActivo, miUbicacion, destinoActivo);

  // Con una propuesta a la vista la voz se calla: el conductor está parado
  // decidiendo si la usa, y lo que sonaría son indicaciones de la ruta anterior.
  const voz = useVozNavegacion(!propuestaALaVista, navegacion);

  // La pantalla apagada suspende el GPS: sin esto el punto se congela a los
  // treinta segundos de no tocar nada, que es lo que pasa manejando.
  usePantallaEncendida(hayRuta);

  // La lectura cruda del GPS cae adentro de las manzanas. Mientras haya trazado
  // que seguir, el punto se dibuja SOBRE él.
  const pegado = usePuntoEnRuta(miUbicacion, navegacion.trazado);

  // FR-017: si hay que avisarle que llame. Está llegando a una parada cuyo
  // receptor no contestó el WhatsApp y a la que todavía no llamó.
  //
  // Se mide sobre el TRAZADO y no en línea recta: lo que importa es cuánto le
  // falta manejar, y en Arica una parada a doscientos metros en línea recta puede
  // estar a ochocientos por calle si en el medio hay una quebrada. En línea recta
  // el aviso saltaría demasiado pronto y dejaría de significar algo.
  //
  // Sin trazado (sin señal) no se avisa por distancia: no hay con qué medir, y
  // adivinarlo con la línea recta sería justo el error de arriba. El estado del
  // receptor igual se ve en la tarjeta.
  const seAproximaSinContacto = useMemo(() => {
    if (!activa?.hayQueContactar) return false;
    const desde = pegado ?? miUbicacion;
    if (!desde || !navegacion.trazado) return false;
    return metrosRestantes(desde, navegacion.trazado) <= METROS_AVISO_CONTACTO;
  }, [activa, pegado, miUbicacion, navegacion.trazado]);

  // Hacia dónde orientar la vista: el camino que viene por delante en la propia
  // ruta, medido desde el punto ya pegado. Se prefiere eso al rumbo del GPS —que
  // en iPhone llega null casi siempre— y sobre todo a la brújula, que apunta
  // hacia donde quedó apoyado el teléfono y no hacia donde va el camino.
  const rumbo = useMemo(() => {
    const desde = pegado ?? miUbicacion;
    if (desde && navegacion.trazado) {
      const delCamino = rumboDelCamino(desde, navegacion.trazado, 45, pegado?.indice);
      if (delCamino != null) return delCamino;
    }
    return miUbicacion?.heading ?? null;
  }, [pegado, miUbicacion, navegacion.trazado]);

  const ubicacionMostrada: Ubicacion | null = useMemo(
    () =>
      pegado && miUbicacion ? { ...miUbicacion, lat: pegado.lat, lng: pegado.lng } : miUbicacion,
    [pegado, miUbicacion],
  );

  // La línea azul arranca en el punto y no media cuadra más atrás: con el mapa
  // girado, la cola del tramo ya recorrido apunta hacia atrás y se lee como un
  // camino a tomar.
  const trazadoPorDelante = useMemo(
    () =>
      pegado && navegacion.trazado
        ? recortarTrazado(navegacion.trazado, pegado)
        : navegacion.trazado,
    [pegado, navegacion.trazado],
  );

  // En modo prueba, el GPS simulado avanza por esta línea (gps-simulado.ts).
  useSimularRecorrido(trazadoPorDelante);

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
    navegacion,
    voz,
    seAproximaSinContacto,
    rumbo,
    ubicacionMostrada,
    trazadoPorDelante,
    señalDebil,
  };
}
