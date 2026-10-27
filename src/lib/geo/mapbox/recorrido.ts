// Por dónde va el conductor dentro del tramo hacia la parada (spec 017, N2, N4 y
// N11). Puro: useNavegacion lo llama con cada lectura de GPS, sin consultar nada.
import type { Coordenada } from "../coordenada";
import { distanciaAPolilinea, metrosRestantes } from "../trazado";
import type { PasoNavegacion } from "./navegacion";

/** La maniobra se da por hecha recién a esta distancia de la esquina (o ya
 *  pasada). Antes eran 25 m y el cartel cambiaba a la maniobra SIGUIENTE antes
 *  de doblar, justo cuando el conductor miraba hacia dónde doblar. Menos de 8 m
 *  no sirve: en un giro en U la lectura más cercana a la vuelta puede caer a
 *  6 m, y después el auto vuelve por la misma calle sin acercarse más. */
const METROS_EN_LA_ESQUINA = 8;

/** Ya va por un paso más adelante si está a menos de esto de su trazado… */
const METROS_SOBRE_UN_PASO = 15;
/** …y claramente más cerca de él que del paso en curso (el ruido del GPS en
 *  una esquina deja las dos distancias casi iguales). */
const VENTAJA_M = 5;
/** Hasta cuántos pasos se mira hacia adelante: con la señal cortada en una
 *  esquina, o con dos maniobras pegadas, el cartel no puede quedar clavado en
 *  una que ya pasó. Más lejos, una ruta que vuelve a pasar por la misma calle
 *  haría saltar el cartel a una vuelta futura. */
const PASOS_HACIA_ADELANTE = 4;

type PasoConTrazado = Pick<PasoNavegacion, "trazado">;

/**
 * En qué paso va el conductor. Solo avanza: recalcularlo desde cero daría mal,
 * porque los metros a un paso que quedó atrás no son cero sino lo que mide la
 * vuelta hasta él.
 *
 * Avanza de dos maneras: al llegar a la esquina del paso en curso (o pasarla),
 * o al aparecer sobre un paso posterior (se perdió la lectura justo en la
 * esquina). En bucle, porque una sola lectura puede dejar atrás dos maniobras
 * seguidas.
 */
export function pasoEnCurso(posicion: Coordenada, pasos: PasoConTrazado[], desde: number): number {
  const ultimo = pasos.length - 1;
  if (ultimo <= 0) return 0;
  let i = Math.min(Math.max(desde, 0), ultimo);

  while (i < ultimo) {
    const trazado = pasos[i].trazado;
    if (trazado.length === 0 || metrosRestantes(posicion, trazado) <= METROS_EN_LA_ESQUINA) {
      i++;
      continue;
    }
    const enEste = distanciaAPolilinea(posicion, trazado);
    let salto = -1;
    for (let j = i + 1; j <= Math.min(ultimo, i + PASOS_HACIA_ADELANTE); j++) {
      const d = distanciaAPolilinea(posicion, pasos[j].trazado);
      if (d <= METROS_SOBRE_UN_PASO && d + VENTAJA_M < enEste) {
        salto = j;
        break;
      }
    }
    if (salto < 0) break;
    i = salto;
  }
  return i;
}

export type Restante = {
  /** Metros hasta la maniobra que viene, por el trazado. */
  metrosAManiobra: number;
  /** Metros hasta la parada, por calle. */
  metrosAParada: number;
  /** Segundos hasta la parada, según los tiempos que dio Mapbox para cada paso. */
  segundosAParada: number;
};

/**
 * Lo que falta desde la posición: hasta la maniobra y hasta la parada (spec 017,
 * N4). Del paso en curso se cuenta la parte que queda, y de los siguientes,
 * entero. El tiempo del paso en curso se prorratea por los metros: un paso de
 * 600 m y 60 s, con 150 m por delante, son 15 s.
 */
export function restanteDelTramo(
  posicion: Coordenada,
  pasos: Pick<PasoNavegacion, "trazado" | "distanciaM" | "duracionS">[],
  indice: number,
): Restante | null {
  const paso = pasos[indice];
  if (!paso) return null;
  const metrosAManiobra = paso.trazado.length > 0 ? metrosRestantes(posicion, paso.trazado) : paso.distanciaM;
  const fraccion = paso.distanciaM > 0 ? Math.min(1, metrosAManiobra / paso.distanciaM) : 0;
  let metros = metrosAManiobra;
  let segundos = (paso.duracionS ?? 0) * fraccion;
  for (let j = indice + 1; j < pasos.length; j++) {
    metros += pasos[j].distanciaM;
    segundos += pasos[j].duracionS ?? 0;
  }
  return { metrosAManiobra, metrosAParada: Math.round(metros), segundosAParada: Math.round(segundos) };
}
