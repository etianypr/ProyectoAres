// ----------------------------------------------------------------------------
// Deslizar una fila hacia la izquierda para eliminarla
// ----------------------------------------------------------------------------
//
// La parte del gesto que no toca el DOM: dado cuánto se movió el dedo, cuánto se
// corre la fila y qué pasa al soltarla. Está acá afuera porque es lo único del
// gesto que se puede probar sin un teléfono, y es donde están las dos decisiones
// que lo hacen usable con una mano mientras se maneja.
//
// PRIMERA: el eje se decide una sola vez y no se cambia. Estas filas viven
// dentro de una lista que se desplaza a lo alto, así que el mismo dedo puede
// querer dos cosas distintas. Se mira hacia dónde arrancó el movimiento y se
// queda ahí: si arrancó hacia el costado, la lista no se mueve aunque después el
// dedo suba; si arrancó hacia arriba, la fila no se corre aunque después el dedo
// derive. Reevaluarlo en cada movimiento es lo que hace que estas listas se
// sientan resbalosas.
//
// SEGUNDA: se decide por DISTANCIA y no por velocidad. Un envión rápido y corto
// no elimina. Es a propósito: un conductor que arrastra la lista con el teléfono en
// la mano y el vehículo en movimiento hace envíones cortos todo el tiempo, y la
// diferencia entre "quise desplazar la lista" y "quise borrar este pedido" no
// puede depender de qué tan firme venía el pulso.

/** Cuánto tiene que moverse el dedo antes de decidir el eje. Por debajo de esto
 *  el gesto todavía no es nada: ni fila que se corre ni lista que se desplaza.
 *  Diez píxeles es lo que separa un toque de un arrastre en un teléfono. */
export const UMBRAL_EJE = 10;

/** Ancho del panel rojo que queda a la vista con la fila abierta. Es también la
 *  posición en la que la fila se queda quieta esperando el toque. */
export const ANCHO_ACCION = 92;

/** Deslizando MÁS que esta fracción del ancho de la fila, soltar elimina de una
 *  sin pasar por el botón. Es el atajo, no el camino: el camino es abrir y
 *  tocar. */
const FRACCION_ELIMINAR = 0.45;

/** Piso del atajo, para que una fila angosta no se vuelva un gatillo fácil. */
const MINIMO_ELIMINAR = ANCHO_ACCION * 1.5;

/** Cuánto de cada píxel del dedo se convierte en movimiento MÁS ALLÁ del panel
 *  abierto. Menos de 1 para que se sienta la resistencia: es lo que avisa, con
 *  el dedo todavía apoyado, que se está entrando en la zona donde soltar borra. */
const RESISTENCIA = 0.7;

/** Hacia dónde va el gesto. "sin-decidir" mientras el dedo no se movió lo
 *  suficiente para saberlo. */
export type EjeGesto = "sin-decidir" | "horizontal" | "vertical";

/** Qué hacer al levantar el dedo. */
export type FinDeslizamiento = "cerrar" | "abrir" | "eliminar";

export function decidirEje(dx: number, dy: number): EjeGesto {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  if (Math.max(horizontal, vertical) < UMBRAL_EJE) return "sin-decidir";
  // El empate se va a vertical: en una lista larga, desplazarla es lo que el
  // conductor hace cien veces por día y eliminar un pedido, una.
  return horizontal > vertical ? "horizontal" : "vertical";
}

/** Cuánto se corre la fila hacia la izquierda, en píxeles y siempre >= 0.
 *
 *  @param dx      Cuánto se movió el dedo en horizontal (negativo = izquierda).
 *  @param desde   En qué posición estaba la fila al apoyar el dedo: 0 cerrada,
 *                 ANCHO_ACCION abierta. Sin esto, empezar a deslizar una fila ya
 *                 abierta la haría saltar a cero. */
export function desplazamiento(dx: number, desde: number): number {
  const crudo = desde - dx;
  // Hacia la derecha no hay nada que mostrar, así que no se despega del borde.
  if (crudo <= 0) return 0;
  if (crudo <= ANCHO_ACCION) return crudo;
  return ANCHO_ACCION + (crudo - ANCHO_ACCION) * RESISTENCIA;
}

/** A partir de qué desplazamiento soltar elimina de una. */
export function umbralEliminar(anchoFila: number): number {
  return Math.max(MINIMO_ELIMINAR, anchoFila * FRACCION_ELIMINAR);
}

/** Qué pasa al levantar el dedo, con la fila corrida `x` píxeles.
 *
 *  @param anchoFila  Ancho de la fila en píxeles. 0 si todavía no se pudo medir:
 *                    ahí manda el piso, nunca una fracción de cero. */
export function alSoltar(x: number, anchoFila: number): FinDeslizamiento {
  if (x >= umbralEliminar(anchoFila)) return "eliminar";
  // Media apertura ya cuenta como intención de abrir: quedarse en el medio y
  // que la fila se cierre sola obliga a repetir el gesto.
  if (x >= ANCHO_ACCION / 2) return "abrir";
  return "cerrar";
}
