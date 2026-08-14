"use client";

// Armado de la ruta del día, en el TELÉFONO. Antes esto era generarRuta() en
// src/lib/encomiendas/actions.ts: unas 190 líneas, de las cuales ~120 eran
// reconciliación contra la base (leer la ruta existente, conservar las paradas
// entregadas, borrar las demás, calcular desde qué número seguir la secuencia
// para no chocar con la clave única, y volver a insertar). Nada de eso existe
// acá: la ruta es un objeto que se reemplaza, y lo único que hay que preservar
// —lo ya cerrado en el día— lo garantiza guardarRuta() en un solo lugar.
//
// El armado son DOS pasos, y esa separación es a propósito:
//
//   calcularRutaLocal()   ordena las paradas y pide el trazado, SIN guardar
//                         nada. Lo que devuelve es una propuesta, que la
//                         pantalla muestra en el mapa para que el chofer la vea
//                         antes de comprometerse (ver vista-previa-ruta.tsx).
//   confirmarRutaLocal()  recién ahí la ruta queda guardada en el teléfono.
//
// Antes era un solo paso que guardaba de una: rehacer la ruta a media mañana
// reordenaba las paradas y el chofer se enteraba mirando el mapa después.
//
// Lo que no cambió es el cálculo en sí: ordenarParadas() y el pedido del trazado
// por calles son las mismas funciones que ya se usaban, y ya corrían en el
// navegador para la navegación paso a paso (ver use-navegacion.ts).

import { geocodificarDireccion, type Coordenada } from "@/lib/geocoding";
import { matrizDistancias, obtenerRutaCalles, ordenarParadas } from "@/lib/rutas";
import {
  fijarCoordenadas,
  guardarRuta,
  leerRuta,
  pedidosPendientes,
  type PedidoLocal,
  type RutaLocal,
} from "./almacen";

// Las direcciones se ubican al CARGAR cada pedido, una por una, así que acá
// solo se reintentan las que fallaron. Se limita cuántas para no dejar al
// chofer treinta segundos mirando una pantalla trabada; las que no entren en
// este intento se reintentan en la próxima generación.
const MAX_REINTENTOS_UBICAR = 5;

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
// Las dos cachés de acá abajo no cambian nada de lo que el chofer ve; al
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

/** Huella de TODO lo que entra en el cálculo de una ruta. Si no cambió ni un
 *  pedido, ni su ubicación, ni de dónde se parte, la ruta que saldría es la
 *  misma y no hay nada que preguntarle a Mapbox. */
function huella(fecha: string, base: Coordenada, ubicados: PedidoUbicado[]): string {
  const paradas = ubicados
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .sort()
    .join("|");
  // La partida se redondea a ~10 m: partiendo del GPS, un metro de diferencia
  // entre dos lecturas no cambia el orden de treinta paradas.
  return `${fecha}|${base.lat.toFixed(4)},${base.lng.toFixed(4)}|${paradas}`;
}

/** Última propuesta calculada, en memoria. Sobrevive a cerrar y reabrir la hoja
 *  y a descartar la propuesta —que es cuando se repetía— pero no a recargar la
 *  página, y eso está bien: recargar es justo cuando conviene volver a
 *  preguntar por si el tráfico cambió. */
let ultimaPropuesta: { huella: string; propuesta: PropuestaRuta } | null = null;

/** De dónde arranca la ruta. La dirección de la empresa la pasa la pantalla
 *  (es un dato de la empresa, no de un destinatario, así que sigue viviendo en
 *  la base sin problema). */
export type PuntoInicio =
  | { tipo: "empresa"; direccion: string | null }
  | { tipo: "gps"; lat: number; lng: number }
  /** lat/lng vienen cuando el chofer eligió la dirección de una lista de
   *  sugerencias: ya está ubicada y no hay que geocodificar el texto. */
  | { tipo: "direccion"; direccion: string; lat?: number; lng?: number };

/** Pedido que sí se pudo ubicar en el mapa: entra en la ruta. */
export type PedidoUbicado = PedidoLocal & { lat: number; lng: number };

/** Ruta calculada y todavía NO guardada. Es lo que se muestra en la
 *  previsualización; guardarla es cosa de confirmarRutaLocal. */
export type PropuestaRuta = {
  fecha: string;
  /** Punto de partida ya resuelto a coordenadas. */
  inicio: Coordenada;
  /** Las paradas que faltan, en el orden de visita propuesto. */
  paradas: PedidoUbicado[];
  /** Trazado por calles de todo el recorrido, [lng, lat] por punto. */
  geometria: [number, number][] | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Pendientes que quedaron FUERA porque su dirección no se pudo ubicar en el
   *  mapa. Siguen pendientes, así que se arrastran al día siguiente igual; la
   *  pantalla los muestra para que el chofer corrija la dirección. */
  sinUbicar: PedidoLocal[];
  /** true si el trazado por calles no se pudo pedir (sin señal, o el servicio
   *  no respondió). La ruta sirve igual: están los puntos y el orden. */
  sinTrazado: boolean;
  /** Cuántas paradas de hoy ya están cerradas (entregadas u omitidas). No se
   *  reordenan ni se pierden: quedan primero en la ruta guardada. */
  cerradas: number;
};

export type ResultadoRuta = {
  ruta: RutaLocal;
  sinUbicar: PedidoLocal[];
  sinTrazado: boolean;
};

function tieneCoordenadas(p: PedidoLocal): p is PedidoUbicado {
  return p.lat != null && p.lng != null;
}

// Reintenta ubicar en el mapa los pedidos que quedaron sin coordenadas y guarda
// las que se consigan. Devuelve la lista completa de pendientes ya actualizada.
async function reintentarUbicar(pendientes: PedidoLocal[]): Promise<PedidoLocal[]> {
  const sinUbicar = pendientes.filter((p) => !tieneCoordenadas(p));
  if (sinUbicar.length === 0) return pendientes;

  const encontradas: { id: string; lat: number; lng: number }[] = [];
  const aIntentar = sinUbicar.slice(0, MAX_REINTENTOS_UBICAR);

  // Secuencial a propósito: en paralelo se pasaría del límite de consultas por
  // segundo de OpenStreetMap. El espaciado ya no se hace acá — lo garantiza el
  // propio geocodificador (ver la fila de turnos en lib/geocoding.ts), y así una
  // dirección que Mapbox resuelve sola no paga ninguna espera.
  for (const pedido of aIntentar) {
    const coord = await geocodificarDireccion(pedido.direccion);
    if (coord) encontradas.push({ id: pedido.id, lat: coord.lat, lng: coord.lng });
  }

  await fijarCoordenadas(encontradas);

  const porId = new Map(encontradas.map((c) => [c.id, c] as const));
  return pendientes.map((p) => {
    const coord = porId.get(p.id);
    return coord ? { ...p, lat: coord.lat, lng: coord.lng } : p;
  });
}

async function resolverInicio(
  inicio: PuntoInicio,
  primerPedido: Coordenada,
): Promise<Coordenada> {
  if (inicio.tipo === "gps") {
    return { lat: inicio.lat, lng: inicio.lng };
  }

  if (inicio.tipo === "direccion") {
    // Ya viene ubicada (el chofer la eligió de la lista de sugerencias).
    if (inicio.lat != null && inicio.lng != null) {
      return { lat: inicio.lat, lng: inicio.lng };
    }
    const coord = await geocodificarDireccion(inicio.direccion);
    // Si el chofer escribió a mano de dónde parte y no se pudo ubicar, se lo
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

// Calcula (sin guardar) la ruta de "fecha" con todos los pedidos pendientes del
// teléfono, incluidos los arrastrados de días anteriores. Lanza Error con un
// mensaje mostrable cuando no hay nada que rutear.
export async function calcularRutaLocal(
  fecha: string,
  inicio: PuntoInicio,
): Promise<PropuestaRuta> {
  const [pendientesIniciales, rutaActual] = await Promise.all([
    pedidosPendientes(),
    leerRuta(fecha),
  ]);
  if (pendientesIniciales.length === 0) {
    throw new Error("No hay pedidos pendientes para armar una ruta.");
  }

  // Lo ya cerrado hoy NO se vuelve a rutear. Importa para las OMITIDAS: omitir
  // no cierra el pedido (sigue pendiente para otro día), así que aparecían acá
  // y entraban en el trazado, pero guardarRuta las descartaba después por estar
  // ya cerradas — el mapa terminaba mostrando una línea que pasaba por una
  // parada que no estaba en la ruta.
  const cerradas = (rutaActual?.paradas ?? []).filter((p) => p.entrega !== "pendiente");
  const yaCerrado = new Set(cerradas.map((p) => p.pedidoId));

  const pendientes = (await reintentarUbicar(pendientesIniciales)).filter(
    (p) => !yaCerrado.has(p.id),
  );
  if (pendientes.length === 0) {
    throw new Error("Todos los pedidos pendientes ya se marcaron en esta jornada.");
  }

  const ubicados = pendientes.filter(tieneCoordenadas);
  const sinUbicar = pendientes.filter((p) => !tieneCoordenadas(p));

  // A diferencia de la versión del servidor, un pedido con la dirección mal
  // escrita ya NO bloquea la jornada completa: se arma la ruta con los que sí
  // se pudieron ubicar y los otros quedan a la vista para corregir. No se
  // pierde nada — siguen pendientes y reaparecen mañana.
  if (ubicados.length === 0) {
    throw new Error(
      sinUbicar.length === 1
        ? "El único pedido pendiente no se pudo ubicar en el mapa. Revisa su dirección."
        : `Ninguno de los ${sinUbicar.length} pedidos pendientes se pudo ubicar en el mapa. Revisa sus direcciones.`,
    );
  }

  const base = await resolverInicio(inicio, { lat: ubicados[0].lat, lng: ubicados[0].lng });

  // Misma partida y mismos pedidos que la vez anterior: la ruta ya está
  // calculada. Se devuelve esa, con el recuento de cerradas al día (que sí pudo
  // cambiar si el chofer marcó algo mientras la propuesta estaba en pantalla).
  const clave = huella(fecha, base, ubicados);
  if (ultimaPropuesta?.huella === clave) {
    return { ...ultimaPropuesta.propuesta, sinUbicar, cerradas: cerradas.length };
  }

  const puntos: Coordenada[] = [base, ...ubicados.map((p) => ({ lat: p.lat, lng: p.lng }))];

  // Distancias reales por calles para decidir el orden. Si son más de 25 puntos
  // o la API no responde, matrizDistancias devuelve null y ordenarParadas cae
  // solo a la línea recta, como antes.
  const matriz = await matrizDistancias(puntos);
  const ordenIndices = ordenarParadas(puntos, matriz);
  // El índice 0 es la base; el resto mapea a ubicados[i - 1].
  const paradas = ordenIndices.slice(1).map((i) => ubicados[i - 1]);

  // El límite de 25 puntos por consulta de Mapbox (una jornada de 30 paradas no
  // entra) lo resuelve obtenerRutaCalles partiendo el pedido en tramos y
  // pegando los trazados.
  const trazado = await obtenerRutaCalles(ordenIndices.map((i) => puntos[i]));

  const propuesta: PropuestaRuta = {
    fecha,
    inicio: base,
    paradas,
    geometria: trazado?.geometria ?? null,
    distanciaM: trazado?.distanciaM ?? null,
    duracionS: trazado?.duracionS ?? null,
    sinUbicar,
    sinTrazado: trazado == null,
    cerradas: cerradas.length,
  };

  // Sin trazado no se guarda: quedó a medias por falta de señal y volver a
  // pedirla es justamente lo que hay que hacer la próxima vez.
  if (!propuesta.sinTrazado) ultimaPropuesta = { huella: clave, propuesta };
  return propuesta;
}

/** Guarda la propuesta como la ruta del día. Entre calcular y confirmar el
 *  chofer pudo cerrar una parada o agregar un pedido: guardarRuta vuelve a leer
 *  lo guardado y conserva lo cerrado, así que la propuesta nunca lo pisa. */
export async function confirmarRutaLocal(propuesta: PropuestaRuta): Promise<ResultadoRuta> {
  const ruta = await guardarRuta({
    fecha: propuesta.fecha,
    pedidoIdsEnOrden: propuesta.paradas.map((p) => p.id),
    geometria: propuesta.geometria,
    distanciaM: propuesta.distanciaM,
    duracionS: propuesta.duracionS,
  });

  return { ruta, sinUbicar: propuesta.sinUbicar, sinTrazado: propuesta.sinTrazado };
}
