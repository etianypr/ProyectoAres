// Las superficies de la app del conductor, en un solo lugar (spec 041): la pantalla
// completa (escáner, buscar OF, cerrar el día, Ayuda…), la hoja que sube desde abajo
// y su tirador. Cada una estaba escrita a mano en cada archivo, con diferencias de
// sombra, radio y margen de arriba. La capa (z-pantalla, z-ventana…) la pone cada uno.

/** Pantalla completa sobre el mapa, con el margen de la barra de estado. */
export const PANTALLA = "animate-fade-in fixed inset-0 flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]";

/** La hoja que sube desde abajo: la del día y la de la ruta propuesta. */
export const HOJA = "rounded-t-hoja bg-card shadow-[0_-8px_30px_rgb(var(--shadow-ink)/0.14)]";

/** La barrita que se arrastra para subir o bajar una hoja. */
export const TIRADOR = "h-1.5 w-10 rounded-full bg-separator";
