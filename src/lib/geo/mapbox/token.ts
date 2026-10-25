// Token público de Mapbox: la única lectura de NEXT_PUBLIC_MAPBOX_TOKEN.
//
// Se lee al llamar (no al cargar el módulo) para que las pruebas puedan ponerlo y
// quitarlo. Next.js lo reemplaza al compilar porque aparece escrito completo acá.

/** null = no está configurado (el mapa y las direcciones lo avisan). */
export function tokenMapbox(): string | null {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null;
}
