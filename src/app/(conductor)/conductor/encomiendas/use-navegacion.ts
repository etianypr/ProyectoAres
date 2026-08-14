"use client";

import { useEffect, useRef, useState } from "react";
import {
  distanciaAPolilinea,
  metrosRestantes,
  obtenerNavegacion,
  type PasoNavegacion,
} from "@/lib/rutas";
import type { Coordenada } from "@/lib/geocoding";

// Un tramo pedido a Mapbox NO trae una instrucción: trae TODAS las maniobras
// hasta la parada, cada una con su trazado y sus avisos de voz. Recorrerlo es
// cosa del teléfono — de qué maniobra estamos y cuántos metros faltan se
// calcula con cada lectura de GPS, sin consultar nada.
//
// Solo se vuelve a pedir cuando el tramo dejó de servir:
//   · cambió la parada de destino
//   · el chofer se salió del camino (dobló donde no era, o la ruta arrancó por
//     la calzada equivocada)
//   · no hay tramo todavía, o el anterior no llegó
//
// Antes se re-pedía cada 150 metros, y no era un capricho: el cartel mostraba
// siempre el PRIMER paso del último tramo, así que pedir otro era la única
// forma de que la indicación avanzara. Una jornada de 60 km eran unas 400
// consultas por chofer. Ahora son unas pocas por parada, y el cartel cambia en
// el momento en que se cumple la maniobra en vez de esperar a que conteste la
// red — o sea que además de costar menos, se siente mejor.

/** Se da por cumplida una maniobra al llegar a esta distancia de ella. Del
 *  orden del error del GPS en ciudad: más chico y un paso no terminaría nunca. */
const UMBRAL_MANIOBRA_M = 25;

/** Apartarse más que esto del trazado es haberse salido del camino. Tiene que
 *  superar el ancho de una avenida con bandejón y el rebote del GPS entre
 *  edificios, o se pediría una ruta nueva en cada semáforo. */
const UMBRAL_FUERA_DE_RUTA_M = 60;

/** Dos lecturas seguidas afuera antes de recalcular: una sola puede ser un
 *  salto del GPS, y recalcular de más es justo lo que se vino a evitar. */
const LECTURAS_FUERA_PARA_RECALCULAR = 2;

/** Piso entre dos consultas para un mismo destino: el freno para que un GPS
 *  ruidoso en el centro no dispare una consulta por segundo. No aplica cuando
 *  cambia la parada — eso tiene que verse al toque. */
const MS_MINIMO_ENTRE_CONSULTAS = 10_000;

/** Tras una consulta que no trajo camino (sin señal, o Mapbox no respondió) se
 *  espera esto antes de reintentar. Sin la espera, el reintento saldría con la
 *  siguiente lectura de GPS —una o dos por segundo— y un tramo sin cobertura se
 *  comería la cuota del mes en un rato. */
const MS_ESPERA_REINTENTO = 5_000;

function mismoPunto(a: Coordenada | null | undefined, b: Coordenada | null | undefined): boolean {
  return a != null && b != null && a.lat === b.lat && a.lng === b.lng;
}

type Tramo = {
  destino: Coordenada;
  pasos: PasoNavegacion[];
  geometria: [number, number][];
  /** Si la consulta que lo trajo llevaba el rumbo del auto. Sin rumbo, Mapbox
   *  puede haber enganchado la salida en la calzada contraria. */
  conRumbo: boolean;
};

export type Navegacion = {
  /** Maniobra que se está recorriendo. Su `banner` nombra hacia dónde se va y
   *  sus `avisos` son los que hay que decir en voz alta. */
  paso: PasoNavegacion | null;
  /** La maniobra que viene DESPUÉS de recorrer `paso`: es la que hay que
   *  dibujar como flecha. La de `paso` ya se ejecutó al empezarlo. */
  siguiente: PasoNavegacion | null;
  /** Metros hasta la maniobra, recalculados con CADA lectura de GPS siguiendo
   *  el trazado (no en línea recta). */
  metrosAManiobra: number | null;
  /** Trazado por calles desde donde se pidió hasta la parada activa,
   *  [lng, lat] por punto — esto es lo que se dibuja como "por dónde ir". */
  geometria: [number, number][] | null;
};

const VACIA: Navegacion = { paso: null, siguiente: null, metrosAManiobra: null, geometria: null };

export function useNavegacion(
  activo: boolean,
  /** La posición del chofer trae además el rumbo, que se le pasa a Mapbox para
   *  que enganche el arranque de la ruta en la calzada correcta. */
  origen: (Coordenada & { heading?: number | null }) | null,
  destino: Coordenada | null,
): Navegacion {
  const [tramo, setTramo] = useState<Tramo | null>(null);
  /** En qué maniobra del tramo va el chofer. Solo avanza; se ajusta durante el
   *  render (ver más abajo). */
  const [indicePaso, setIndicePaso] = useState(0);
  const [tramoAnterior, setTramoAnterior] = useState<Tramo | null>(null);
  /** Se incrementa para forzar un reintento cuando no hay nada más que lo
   *  dispare (ver el temporizador de más abajo). */
  const [reintento, setReintento] = useState(0);

  // Consulta en vuelo: el id descarta respuestas que quedaron viejas, y el
  // destino evita pedir dos veces el mismo camino.
  const enVueloRef = useRef<{ id: number; destino: Coordenada } | null>(null);
  const ultimoIdRef = useRef(0);
  const ultimaConsultaRef = useRef(0);
  /** Lecturas seguidas fuera del trazado. */
  const fueraRef = useRef(0);
  /** Espera tras un fallo, atada al destino que falló: un destino nuevo se
   *  intenta de inmediato (el chofer no tiene indicación de nada). */
  const esperaRef = useRef<{ destino: Coordenada; hasta: number } | null>(null);
  const reintentoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reintentoRef.current) clearTimeout(reintentoRef.current);
    },
    [],
  );

  const habilitado = activo && origen != null && destino != null;
  // Al dejar de estar habilitado (sin parada activa, o modo solo-lectura) se
  // limpia lo que se estaba mostrando — ajustado durante el render, no en un
  // efecto, siguiendo el mismo patrón que ruta-conductor.tsx.
  const [habilitadoAnterior, setHabilitadoAnterior] = useState(false);
  if (habilitado !== habilitadoAnterior) {
    setHabilitadoAnterior(habilitado);
    if (!habilitado) setTramo(null);
  }

  // ---------------------------------------------------------------- pedir
  useEffect(() => {
    if (!habilitado || !origen || !destino) {
      enVueloRef.current = null;
      esperaRef.current = null;
      fueraRef.current = 0;
      // Lo que venga en camino es de otra parada (o de antes de apagarse).
      ultimoIdRef.current++;
      return;
    }

    const rumbo = origen.heading ?? null;
    const sirve = tramo != null && mismoPunto(tramo.destino, destino);

    // ¿Sigue sobre el camino? Se mide contra el trazado completo del tramo.
    if (sirve && tramo) {
      const desvio = distanciaAPolilinea(origen, tramo.geometria);
      fueraRef.current = desvio > UMBRAL_FUERA_DE_RUTA_M ? fueraRef.current + 1 : 0;
    }

    const cambioDestino = !sirve;
    // Arrancando el viaje el chofer está DETENIDO, y detenido el GPS no entrega
    // rumbo: la primera consulta —justo la de salir a la calle— sale a ciegas y
    // Mapbox engancha la posición a la calzada que le quede más cerca. En una
    // avenida dividida, con las dos calzadas a doce metros, eso es cara o
    // sello; si sale cruz, la ruta arranca dando toda la vuelta a la manzana.
    // En cuanto aparece el rumbo —a los primeros metros de andar— se vuelve a
    // pedir. Es una consulta de más por parada, como mucho.
    const aparecioElRumbo = sirve && tramo != null && !tramo.conRumbo && rumbo != null;
    const seSalio = sirve && fueraRef.current >= LECTURAS_FUERA_PARA_RECALCULAR;

    if (!cambioDestino && !aparecioElRumbo && !seSalio) return;

    // Ya se está pidiendo el camino a ESTE mismo destino: no se duplica la
    // consulta y —sobre todo— no se cancela la que viene en camino.
    if (mismoPunto(enVueloRef.current?.destino, destino)) return;

    const espera = esperaRef.current;
    if (espera && mismoPunto(espera.destino, destino) && Date.now() < espera.hasta) return;

    // El piso entre consultas no corre cuando cambió la parada: esa indicación
    // el chofer la necesita ahora.
    if (!cambioDestino && Date.now() - ultimaConsultaRef.current < MS_MINIMO_ENTRE_CONSULTAS) {
      return;
    }

    const id = ++ultimoIdRef.current;
    enVueloRef.current = { id, destino };
    ultimaConsultaRef.current = Date.now();

    void obtenerNavegacion(origen, destino, rumbo).then((res) => {
      // Otra consulta más nueva ya la reemplazó (cambió la parada, o el hook se
      // apagó): esta respuesta es de un camino que ya no se va a recorrer.
      if (id !== ultimoIdRef.current) return;
      enVueloRef.current = null;

      if (!res || res.pasos.length === 0) {
        esperaRef.current = { destino, hasta: Date.now() + MS_ESPERA_REINTENTO };
        // Estando quieto el GPS puede dejar de avisar, y sin aviso no hay
        // re-dibujado que reintente. El margen extra evita que el reintento
        // llegue un milisegundo antes de que venza la espera y se descarte.
        // Uno solo a la vez: si el anterior no alcanzó a disparar, se reemplaza.
        if (reintentoRef.current) clearTimeout(reintentoRef.current);
        reintentoRef.current = setTimeout(
          () => setReintento((n) => n + 1),
          MS_ESPERA_REINTENTO + 250,
        );
        return;
      }

      fueraRef.current = 0;
      setTramo({ destino, pasos: res.pasos, geometria: res.geometria, conRumbo: rumbo != null });
    });
  }, [habilitado, origen, destino, tramo, reintento]);

  // ------------------------------------------------------------- avanzar
  // El paso avanza SOLO, en el teléfono, cuando el chofer llega a la maniobra.
  // Es lo que reemplaza a la consulta cada 150 metros. Se avanza en bucle
  // porque dos maniobras pueden caer casi juntas ("gire y enseguida siga por la
  // derecha") y una sola lectura de GPS puede dejar las dos atrás.
  //
  // Va durante el render y no en un efecto (mismo patrón que el ajuste de
  // "habilitado" de arriba) por dos motivos: el índice se necesita en ESTE
  // dibujado —cada lectura de GPS ya provoca uno, no hace falta otro— y sobre
  // todo tiene que ser un contador que solo avanza. Recalcularlo desde cero
  // daría mal: metrosRestantes() a un paso que quedó tres kilómetros atrás no
  // devuelve cero, devuelve tres kilómetros, y el cartel se quedaría clavado en
  // la primera maniobra del tramo.
  let indice = indicePaso;
  if (tramoAnterior !== tramo) {
    setTramoAnterior(tramo);
    // El tramo nuevo arranca donde está el chofer, así que se empieza de cero.
    indice = 0;
    setIndicePaso(0);
  }
  if (habilitado && tramo && origen) {
    let avanzado = Math.min(indice, tramo.pasos.length - 1);
    while (
      avanzado < tramo.pasos.length - 1 &&
      metrosRestantes(origen, tramo.pasos[avanzado].geometria) <= UMBRAL_MANIOBRA_M
    ) {
      avanzado++;
    }
    if (avanzado !== indice) {
      indice = avanzado;
      setIndicePaso(avanzado);
    }
  }

  // El tramo de la parada anterior no se muestra ni un instante.
  if (!habilitado || !tramo || !mismoPunto(tramo.destino, destino)) return VACIA;

  const paso = tramo.pasos[indice] ?? null;

  return {
    paso,
    // La flecha del cartel es la maniobra QUE VIENE. La de `paso` es la que se
    // ejecutó al empezarlo, así que dibujarla mostraba el giro ya hecho: yendo
    // derecho hacia un giro a la derecha, la flecha decía "siga derecho".
    siguiente: tramo.pasos[indice + 1] ?? null,
    metrosAManiobra:
      origen && paso && paso.geometria.length > 0
        ? metrosRestantes(origen, paso.geometria)
        : (paso?.distanciaM ?? null),
    geometria: tramo.geometria.length > 0 ? tramo.geometria : null,
  };
}
