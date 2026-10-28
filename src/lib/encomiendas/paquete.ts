// El paquete de un pedido (spec 003): su OF y cómo es. Puro, sin E/S: lo usan el
// formulario, la tarjeta de la parada y la búsqueda.

import {
  COLORES_PAQUETE,
  type ColorPaquete,
  type TamanoPaquete,
  type TipoPaquete,
} from "./catalogos";

/** Cómo es el paquete; cada parte es opcional: con un solo toque ya sirve. Vive
 *  acá (dominio) y no en el almacén porque también lo usa el servidor (005). */
export type ReferenciaPaquete = {
  tipo: TipoPaquete | null;
  tamano: TamanoPaquete | null;
  color: ColorPaquete | null;
  /** Lo distintivo, hasta 40 caracteres ("cinta roja"). */
  nota: string | null;
};

/** Lo que necesitan de un pedido la búsqueda y el nombre en pantalla. */
type PedidoConOf = { nombre: string; of: string | null; resultado: string };

/** Largo de casi todas las OF. No es una regla: una OF de otro largo vale igual
 *  y va marcada (terreno 2026-10-28: una de 7 dígitos; "no tenemos que
 *  regirnos a una estructura de códigos"). */
export const LARGO_OF = 9;
export const LARGO_NOTA_PAQUETE = 40;
/** Con menos dígitos casi todo coincide: la búsqueda no sirve. */
export const MIN_DIGITOS_BUSQUEDA = 3;

/** "123456789" → "123 456 789"; "7000123" → "7 000 123". Lo que no son solo
 *  dígitos queda como vino. */
export function formatoOf(of: string): string {
  return /^\d+$/.test(of) ? of.replace(/\B(?=(\d{3})+$)/g, " ") : of;
}

/** La OF escrita (con espacios, puntos o guiones) → sus dígitos sin ceros a la
 *  izquierda, o null si no son solo dígitos. Sin regla de largo: la distinta se
 *  acepta y se marca (ofDistinta). Sin los ceros, la OF del código de barras
 *  ("007000123") calza con la de la guía ("7000123"). */
export function ofValida(texto: string): string | null {
  const digitos = texto.replace(/[\s.\-]/g, "");
  if (!/^\d+$/.test(digitos)) return null;
  return digitos.replace(/^0+/, "") || null;
}

/** Una OF de otro largo que las de siempre: va con ⚠ para que se note. */
export function ofDistinta(of: string): boolean {
  return of.length !== LARGO_OF;
}

// Género del sustantivo, para que el texto concuerde: "bolsa blanca", "sobre blanco".
const NOMBRE_TIPO: Record<TipoPaquete, { texto: string; femenino: boolean }> = {
  caja: { texto: "Caja", femenino: true },
  bolsa: { texto: "Bolsa", femenino: true },
  sobre: { texto: "Sobre", femenino: false },
  otro: { texto: "Paquete", femenino: false },
};

/** Masculino → femenino de los colores y tamaños que cambian ("rojo" → "roja"). */
function concordar(palabra: string, femenino: boolean): string {
  return femenino && palabra.endsWith("o") ? `${palabra.slice(0, -1)}a` : palabra;
}

const NOMBRE_TAMANO: Record<TamanoPaquete, string> = {
  chico: "chico",
  mediano: "mediano",
  grande: "grande",
};

/** "Bolsa gris grande · cinta roja". null si no hay nada que decir. */
export function textoReferencia(ref: ReferenciaPaquete | null): string | null {
  if (!ref) return null;
  const tipo = ref.tipo ? NOMBRE_TIPO[ref.tipo] : null;
  const femenino = tipo?.femenino ?? false;
  const color = ref.color ? concordar(nombreColor(ref.color), femenino) : null;
  const tamano = ref.tamano ? concordar(NOMBRE_TAMANO[ref.tamano], femenino) : null;
  const descripcion = [tipo?.texto ?? null, color, tamano].filter(Boolean).join(" ");
  const nota = ref.nota?.trim() || null;
  const partes = [descripcion ? mayuscula(descripcion) : null, nota].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

function nombreColor(color: ColorPaquete): string {
  return COLORES_PAQUETE[color].toLowerCase();
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** La nota recortada a su largo máximo, sin espacios de sobra; null si queda vacía. */
export function notaPaquete(texto: string): string | null {
  return texto.trim().slice(0, LARGO_NOTA_PAQUETE).trim() || null;
}

/** Una referencia sin ningún dato es lo mismo que no tenerla. */
export function referenciaOVacia(ref: ReferenciaPaquete): ReferenciaPaquete | null {
  return ref.tipo || ref.tamano || ref.color || ref.nota ? ref : null;
}

/** Pedidos pendientes del día cuya OF termina en esos dígitos (≥ 3). */
export function buscarPorOf<P extends PedidoConOf>(pedidos: P[], digitos: string): P[] {
  const buscado = digitos.replace(/\D/g, "");
  if (buscado.length < MIN_DIGITOS_BUSQUEDA) return [];
  return pedidos.filter((p) => p.resultado === "pendiente" && p.of != null && p.of.endsWith(buscado));
}

/** Cómo se nombra un pedido en pantalla. Los que vienen de la guía no tienen
 *  nombre hasta escanear su etiqueta (spec 005): mientras, se nombran por su OF. */
export function nombreVisible(p: Pick<PedidoConOf, "nombre" | "of">): string {
  if (p.nombre.trim()) return p.nombre;
  return p.of ? `OF ${formatoOf(p.of)}` : "Sin nombre";
}
