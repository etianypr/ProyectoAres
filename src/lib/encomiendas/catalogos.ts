// Listas cerradas del dominio: una sola definición para servidor, panel y teléfono.
//
// Los valores son los que guardan la base (checks de las migraciones) y el
// IndexedDB del teléfono. Cambiar uno exige migrar datos; agregar uno, revisar
// el check de la tabla. Las etiquetas son las que ve el usuario.

/** encomienda_actividad.tipo */
export const TIPOS_EVENTO = {
  entrega: "Entregado",
  omision: "Omitido",
  llamada: "Llamada",
} as const;
export type TipoEvento = keyof typeof TIPOS_EVENTO;

/** encomienda_actividad.origen */
export const ORIGENES_EVENTO = {
  app: "App del conductor",
  manual: "Carga manual",
} as const;
export type OrigenEvento = keyof typeof ORIGENES_EVENTO;

/** encomienda_reglas_pago.tipo_pago */
export const TIPOS_PAGO = {
  porcentaje: "% por pedido entregado",
  monto_fijo: "Monto fijo por pedido entregado",
} as const;
export type TipoPago = keyof typeof TIPOS_PAGO;

/** Qué contestó el receptor al aviso. Dimensión aparte del resultado de la
 *  entrega (constitución, principio II). */
export const DISPONIBILIDADES = {
  pendiente_respuesta: "Sin responder",
  confirmado: "Estará",
  horario_indicado: "Eligió horario",
  manana: "Pidió mañana",
} as const;
export type Disponibilidad = keyof typeof DISPONIBILIDADES;

/** Botones de la plantilla de WhatsApp, EN EL ORDEN de la plantilla de Meta
 *  ("Sí, estaré" · "Mañana" · "Otro horario"): el payload se manda por índice.
 *  Viajan en el payload del botón. */
export const ACCIONES_WHATSAPP = ["CONFIRMAR", "MANANA", "HORARIO"] as const;
export type AccionWhatsApp = (typeof ACCIONES_WHATSAPP)[number];

/** Estado del mensaje de aviso (servidor y teléfono). */
export const ESTADOS_AVISO = [
  "pendiente",
  "enviado",
  "entregado",
  "leido",
  "respondido",
  "fallido",
] as const;
export type EstadoAviso = (typeof ESTADOS_AVISO)[number];

/** Cómo es el paquete (spec 003): tipo, tamaño y color, un toque cada uno. Las
 *  etiquetas son las del botón; el texto de la parada concuerda en género (ver
 *  textoReferencia en paquete.ts). */
export const TIPOS_PAQUETE = {
  caja: "Caja",
  bolsa: "Bolsa",
  sobre: "Sobre",
  otro: "Otro",
} as const;
export type TipoPaquete = keyof typeof TIPOS_PAQUETE;

export const TAMANOS_PAQUETE = {
  chico: "Chico",
  mediano: "Mediano",
  grande: "Grande",
} as const;
export type TamanoPaquete = keyof typeof TAMANOS_PAQUETE;

export const COLORES_PAQUETE = {
  cafe: "Café",
  blanco: "Blanco",
  negro: "Negro",
  gris: "Gris",
  amarillo: "Amarillo",
  azul: "Azul",
  rojo: "Rojo",
  verde: "Verde",
  transparente: "Transparente",
} as const;
export type ColorPaquete = keyof typeof COLORES_PAQUETE;

/** Si un valor crudo (formulario, red) es una clave del catálogo. Propia, no
 *  heredada: "toString" no es un tipo de pago. */
export function esClave<C extends object>(catalogo: C, valor: unknown): valor is keyof C {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(catalogo, valor);
}
