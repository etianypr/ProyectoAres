// ¿El conductor se salió de la línea? (spec 047). Cuando ARES guía, salirse de la
// línea naranja (una calle cortada, otra que le acomoda más) pide trazar de nuevo
// desde el auto con la red propia (red/desde-el-auto.ts). Esto decide CUÁNDO, con
// la lectura cruda del GPS: un punto pegado está sobre la línea por definición.
//
// - Lejos de la línea en dos lecturas seguidas: una sola puede ser el GPS saltando
//   entre edificios.
// - A lo más un trazado cada 5 s: si el nuevo tampoco calza (el GPS sigue malo), no
//   se traza en cada lectura.
// - Sin ninguna línea (la ruta cambió con «Ahora» o «Dejar como pendiente»), con la
//   primera lectura.
// - Una lectura imprecisa (más de 40 m) no cuenta ni a favor ni en contra.
// - Otra parada empieza de cero.
// Puro.

/** Más lejos que esto de la línea, el auto va por otra calle (una cuadra en Arica
 *  mide ~100 m; el GPS en la calle yerra ~10-20 m). */
export const METROS_FUERA_DE_LA_LINEA = 40;
const LECTURAS_FUERA = 2;
export const MS_ENTRE_TRAZADOS = 5_000;
const PRECISION_DUDOSA_M = 40;

export type EstadoDesvio = { clave: string | null; fuera: number; ultimoEn: number | null };

export const SIN_DESVIO: EstadoDesvio = { clave: null, fuera: 0, ultimoEn: null };

export type LecturaDesvio = {
  /** La parada a la que se va. */
  clave: string | null;
  /** Metros de la lectura cruda a la línea; null si no hay línea o queda a más de 90 m. */
  metrosALaLinea: number | null;
  /** true = no hay línea que seguir (no es que el auto se alejó de ella). */
  sinLinea?: boolean;
  precisionM?: number | null;
  ahora: number;
};

export function hayQueRetrazar(estado: EstadoDesvio, lectura: LecturaDesvio): { retrazar: boolean; estado: EstadoDesvio } {
  const base = estado.clave === lectura.clave ? estado : { ...SIN_DESVIO, clave: lectura.clave };
  if (lectura.clave == null) return { retrazar: false, estado: base };
  if (lectura.precisionM != null && lectura.precisionM > PRECISION_DUDOSA_M) return { retrazar: false, estado: base };
  const fueraAhora = lectura.sinLinea || lectura.metrosALaLinea == null || lectura.metrosALaLinea > METROS_FUERA_DE_LA_LINEA;
  if (!fueraAhora) return { retrazar: false, estado: base.fuera === 0 ? base : { ...base, fuera: 0 } };
  const fuera = base.fuera + 1;
  const bastan = lectura.sinLinea ? 1 : LECTURAS_FUERA;
  const descansado = base.ultimoEn == null || lectura.ahora - base.ultimoEn >= MS_ENTRE_TRAZADOS;
  if (fuera >= bastan && descansado) return { retrazar: true, estado: { clave: base.clave, fuera: 0, ultimoEn: lectura.ahora } };
  return { retrazar: false, estado: { ...base, fuera } };
}
