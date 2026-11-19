// Los botones de la app del conductor, en un solo lugar (spec 041). El principal
// estaba copiado en cinco archivos con diferencias (con y sin sombra, con y sin
// estado deshabilitado) y los controles del mapa medían 40 o 44 px según la
// pantalla. Todo lo que se aprieta manejando mide 48 px y va a ancho completo:
// se toca con el pulgar y sin mirar mucho.

/** El «clic» físico al apretar. */
export const PULSAR = "transition-transform active:scale-[0.97]";
const APAGADO = "disabled:pointer-events-none disabled:opacity-50";
const BASE = `flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold ${PULSAR} ${APAGADO}`;

/** La acción del paso: una por pantalla. */
export const BOTON_PRINCIPAL = `${BASE} bg-brand text-brand-foreground shadow-[0_1px_2px_var(--brand-shadow)]`;

/** La alternativa al lado o debajo del principal. */
export const BOTON_SECUNDARIO = `${BASE} border border-separator bg-card text-foreground`;

/**
 * Los que van de a dos en una grilla. `min-w-0` no es decorativo: un elemento de
 * grilla tiene `min-width: auto`, así que el botón de texto más largo se
 * ensanchaba por encima de su columna y pisaba el hueco. Sin `whitespace-nowrap`
 * una etiqueta larga parte en dos renglones en vez de desbordar la píldora.
 */
export const BOTON_RESULTADO = `flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-center text-sm font-semibold leading-tight ${PULSAR} ${APAGADO}`;

/** Cerrar, volver, ayuda: solo un ícono, sin fondo. 44 px, lo mínimo para el pulgar
 *  (eran de 36 y 40 según la pantalla). */
export const BOTON_ICONO = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface disabled:opacity-40`;

/** Los redondos que flotan sobre el mapa (menú, centrar, cercanas). */
export const BOTON_REDONDO = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-float ${PULSAR}`;
