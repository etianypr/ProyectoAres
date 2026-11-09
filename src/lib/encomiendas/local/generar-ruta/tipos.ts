// Tipos del armado de la ruta (spec 002 T032: antes en generar-ruta.ts).

import type { Coordenada, Trazado } from "@/lib/geo/coordenada";
import type { FallaOrs } from "@/lib/geo/ors/cliente";
import type { ParadaLejana } from "./lejanas";
import type { Pedido, Ruta, TramoDelDia } from "../almacen";

/** De dónde arranca la ruta. La dirección de la empresa la pasa la pantalla
 *  (es un dato de la empresa, no de un destinatario, así que sigue viviendo en
 *  la base sin problema). */
export type PuntoInicio =
  | { tipo: "empresa"; direccion: string | null }
  | { tipo: "gps"; lat: number; lng: number }
  /** lat/lng vienen cuando el conductor eligió la dirección de una lista de
   *  sugerencias: ya está ubicada y no hay que geocodificar el texto. */
  | { tipo: "direccion"; direccion: string; lat?: number; lng?: number };

/** Pedido que sí se pudo ubicar en el mapa: entra en la ruta. */
export type PedidoUbicado = Pedido & { lat: number; lng: number };

/** Ruta calculada y todavía NO guardada. Es lo que se muestra en la
 *  previsualización; guardarla es cosa de confirmarRutaLocal. */
export type PropuestaRuta = {
  fecha: string;
  /** Punto de partida ya resuelto a coordenadas. */
  partida: Coordenada;
  /** Donde termina: la central, aunque se parta de "Mi ubicación" u otra
   *  dirección (terreno 2026-10-29). Sin esto, donde partió. */
  llegada?: Coordenada;
  /** Las paradas que faltan, en el orden de visita propuesto. */
  paradas: PedidoUbicado[];
  /** Trazado por calles de todo el recorrido, [lng, lat] por punto. */
  trazado: Trazado | null;
  /** Sus tramos, con el pedido al que llega cada uno (ver Ruta.tramos). */
  tramos: TramoDelDia[] | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Pendientes que quedaron FUERA porque su dirección no se pudo ubicar en el
   *  mapa. La pantalla los muestra para que el conductor corrija la dirección. */
  sinUbicar: Pedido[];
  /** true si el trazado por calles no se pudo pedir (sin señal, o el servicio
   *  no respondió). La ruta sirve igual: están los puntos y el orden. */
  sinTrazado: boolean;
  /** Por qué no hay trazado (spec 024): el cupo de ORS no es «Sin señal». */
  motivoSinTrazado?: FallaOrs | null;
  /** Cuántas paradas de hoy ya están cerradas (entregadas u omitidas). No se
   *  reordenan ni se pierden: quedan primero en la ruta guardada. */
  cerradas: number;
  /** Todo lo que el conductor tiene que saber antes de salir, en frases
   *  mostrables. Se guardan CON la ruta (ver Ruta.advertencias) y no solo
   *  se muestran en la previsualización: en terreno, tres horas después, siguen
   *  siendo la explicación de por qué un pedido no está en la lista. */
  advertencias: string[];
  /** Las propuestas que vale comparar, de una a tres, con la recomendada
   *  primero. `paradas` de arriba son siempre las de la elegida.
   *
   *  Con una sola alternativa la pantalla no muestra ninguna comparación: es el
   *  caso en que el documento principal pide no obligar al conductor a elegir. */
  alternativas: Alternativa[];
  /** Cuál de `alternativas` está puesta ahora mismo. */
  elegida: EstrategiaRuta;
  /** Paradas lejos de todas las demás, con lo que suman (ver lejanas.ts). */
  lejanas: ParadaLejana[];
  /** La propuesta como la armó ARES, si el conductor invirtió el orden (spec 024):
   *  con ella se ve cuánto cuesta el invertido, y volver no pide el trazado otra vez. */
  deAres?: PropuestaRuta;
  /** La invertida ya dibujada, guardada al volver a la de ARES: ir y volver otra
   *  vez no pide más trazados (en la prueba, 15 consultas por cada vuelta). */
  alReves?: PropuestaRuta;
  /** El trazado todavía es del orden anterior: hay que pedir el de este (retrazar). */
  esperaTrazado?: boolean;
};

export type ResultadoRuta = {
  ruta: Ruta;
  sinUbicar: Pedido[];
  sinTrazado: boolean;
};

export type EstrategiaRuta = "corta" | "horarios" | "confirmados";

/** Una ruta candidata, ya ordenada y medida, todavía SIN trazado. */
export type Alternativa = {
  estrategia: EstrategiaRuta;
  /** Para el botón de la comparación. */
  titulo: string;
  /** Por qué mirarla. Una frase. */
  motivo: string;
  paradas: PedidoUbicado[];
  /** Metros según la matriz de calles. Es la cifra con la que se comparan las
   *  alternativas entre sí; la definitiva la trae el trazado. */
  metrosEstimados: number;
  /** Lo que cuesta para el orden: los metros con el tiempo (spec 024, pesos.ts),
   *  en la escala de los metros. Con esto se elige la recomendada. */
  costoEstimado: number;
  /** Receptores que confirmaron o eligieron un horario. */
  confirmados: number;
  /** Los que todavía no contestaron: hay que llamarlos al aproximarse. */
  pendientesDeContacto: number;
  /** Bloques horarios que la estimación dice que se alcanzan. */
  bloquesCumplidos: number;
  /** Y los que no. Es la cifra que más pesa al elegir la recomendada. */
  bloquesIncumplidos: number;
  /** Nombres de los receptores a cuyo bloque se llegaría fuera de horario,
   *  antes o después (ver planificar.ts). */
  fueraDeHorario: string[];
  /** Los mismos, por id: quedan como ⚠ en el pedido al usar la ruta (spec 022). */
  fueraDeHorarioIds: string[];
};
