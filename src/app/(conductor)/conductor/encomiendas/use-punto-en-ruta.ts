"use client";

// Dónde dibujar al chofer: su lectura de GPS pegada al camino que está
// siguiendo (ver ajustarATrazado en lib/rutas).
//
// La cuenta es pura y vive allá; lo único que necesita este hook es MEMORIA del
// vértice donde quedó emparejado la vez anterior, porque la búsqueda se hace en
// una ventana alrededor de él y no sobre el trazado entero. Sin esa ventana, una
// ruta que vuelve a pasar cerca —en una ciudad en damero como Arica, todo el
// tiempo— puede enganchar el punto diez cuadras más adelante.
//
// Al cambiar de tramo el índice vuelve a cero, y de ahí sale gratis lo que se
// pidió: en la PRIMERA lectura de un tramo nuevo se busca desde el principio, o
// sea que el punto cae en el inicio de la ruta —la salida al camino— y no
// adentro de la casa o del galpón, que es donde está la lectura cruda.

import { useState } from "react";
import { ajustarATrazado, type PosicionPegada } from "@/lib/rutas";
import type { Coordenada } from "@/lib/geocoding";

export function usePuntoEnRuta(
  posicion: Coordenada | null,
  geometria: [number, number][] | null,
): PosicionPegada | null {
  const [indice, setIndice] = useState(0);
  // El trazado se compara por IDENTIDAD y no por contenido: useNavegacion
  // devuelve un arreglo nuevo por cada tramo pedido, así que un cambio de
  // referencia es exactamente "esta es otra ruta".
  const [geometriaAnterior, setGeometriaAnterior] = useState(geometria);

  // Ajustado durante el render y no en un efecto, igual que useNavegacion con
  // su tramo: el índice hace falta en ESTE dibujado. Con un efecto, la primera
  // lectura del tramo nuevo se emparejaría con el índice del tramo viejo — que
  // puede estar a kilómetros— y el punto pegaría un salto antes de acomodarse.
  let desdeIndice = indice;
  if (geometriaAnterior !== geometria) {
    setGeometriaAnterior(geometria);
    desdeIndice = 0;
    setIndice(0);
  }

  if (!posicion || !geometria) return null;

  const pegado = ajustarATrazado(posicion, geometria, { desdeIndice });

  // Solo avanza, y se compara contra el índice de ESTA vuelta (que en un tramo
  // recién llegado es 0) y no contra el que quedó guardado del tramo anterior,
  // que puede estar kilómetros más adelante.
  if (pegado && pegado.indice > desdeIndice) setIndice(pegado.indice);

  return pegado;
}
