"use client";

// De dónde arranca la ruta, con la dirección de la empresa guardada para no
// volver a ubicarla en cada armado.

import { geocodificarDireccion } from "@/lib/geo/geocoding";
import type { Coordenada } from "@/lib/geo/coordenada";
import type { PuntoInicio } from "./tipos";

// ----------------------------------------------------------------------------
// Lo que no hace falta volver a preguntar
// ----------------------------------------------------------------------------
//
// Armar una ruta cuesta tres consultas: ubicar la dirección de partida, la
// matriz de distancias y el trazado. Y se arma sola cada vez que se abre la
// pantalla sin ruta guardada (autoGenerar), así que abrir la app, mirar la
// propuesta, cerrarla y volver a entrar valía seis consultas por ver dos veces
// exactamente lo mismo. En un día de prueba fueron 6.839 elementos de matriz
// —unas 56 generaciones— sin que nadie repartiera en serio.
//
// Las dos cachés de acá abajo no cambian nada de lo que el conductor ve; al
// contrario, la propuesta repetida aparece al instante en vez de después de un
// segundo y medio de espera.

/** La dirección de la empresa no se muda. Geocodificarla una vez por armado de
 *  ruta era una consulta regalada. Se guarda contra el TEXTO: si el
 *  administrador la corrige, la clave cambia y se vuelve a ubicar sola. */
const CLAVE_PARTIDA = "pucarani-partida-empresa";

function partidaGuardada(direccion: string): Coordenada | null {
  try {
    const crudo = localStorage.getItem(CLAVE_PARTIDA);
    if (!crudo) return null;
    const { texto, lat, lng } = JSON.parse(crudo);
    return texto === direccion && typeof lat === "number" && typeof lng === "number"
      ? { lat, lng }
      : null;
  } catch {
    // localStorage bloqueado (modo privado) o contenido de una versión vieja:
    // se geocodifica como siempre, que es lo que pasaba antes de esta caché.
    return null;
  }
}

function guardarPartida(direccion: string, coord: Coordenada): void {
  try {
    localStorage.setItem(
      CLAVE_PARTIDA,
      JSON.stringify({ texto: direccion, lat: coord.lat, lng: coord.lng }),
    );
  } catch {
    // Sin espacio o sin permiso: no guardar la caché no rompe nada.
  }
}

export async function resolverInicio(
  inicio: PuntoInicio,
  primerPedido: Coordenada,
): Promise<Coordenada> {
  if (inicio.tipo === "gps") {
    return { lat: inicio.lat, lng: inicio.lng };
  }

  if (inicio.tipo === "direccion") {
    // Ya viene ubicada (el conductor la eligió de la lista de sugerencias).
    if (inicio.lat != null && inicio.lng != null) {
      return { lat: inicio.lat, lng: inicio.lng };
    }
    const coord = await geocodificarDireccion(inicio.direccion);
    // Si el conductor escribió a mano de dónde parte y no se pudo ubicar, se lo
    // decimos en vez de arrancar la ruta desde un punto que no eligió (mismo
    // criterio que tenía la versión del servidor).
    if (!coord) {
      throw new Error(
        `No se pudo ubicar la dirección de partida "${inicio.direccion}" en el mapa. Revísala.`,
      );
    }
    return coord;
  }

  // Dirección de la empresa: si no está configurada o no se pudo ubicar, se
  // parte desde el primer pedido. La ruta sigue siendo válida, solo que el
  // punto de partida es aproximado — preferible a no poder salir a repartir.
  if (!inicio.direccion) return primerPedido;

  const guardada = partidaGuardada(inicio.direccion);
  if (guardada) return guardada;

  const coord = await geocodificarDireccion(inicio.direccion);
  if (coord) guardarPartida(inicio.direccion, coord);
  return coord ?? primerPedido;
}
