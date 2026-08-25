// Deja que las pruebas importen los archivos REALES del proyecto —no una copia
// ni un puerto—. La traducción de módulos (el alias "@/..." y los imports sin
// extensión) vive en ./resolver-ts.mjs, compartida con el servidor MCP.
//
// Lo único propio de las pruebas es esta lista: los módulos que adentro de una
// prueba no pueden ser los de verdad, porque salen a la red o solo existen
// dentro del servidor de Next.
//
// Ojo con lo que NO está acá: los proveedores externos que se consultan con
// fetch (Mapbox, ORS, la Cloud API de Meta) NO se sustituyen a nivel de módulo
// sino reemplazando el `fetch` global, dentro de cada prueba. Así corre el
// código real que arma la URL, los headers y el cuerpo, y que interpreta cada
// error — que es justo lo que se rompe cuando el proveedor cambia algo.
import { crearResolve } from "./resolver-ts.mjs";

const DOBLES = {
  "@/lib/supabase/client": new URL("./dobles/supabase-client.mjs", import.meta.url).href,
  "next/headers": new URL("./dobles/next-headers.mjs", import.meta.url).href,
};

export const resolve = crearResolve(DOBLES);
