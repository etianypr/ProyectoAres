// Direcciones → coordenadas. Dos usos distintos:
//
//   sugerirDirecciones()    mientras el conductor ESCRIBE, para que elija la
//                           dirección de una lista y se sepa ahí mismo que
//                           existe (y con qué coordenadas exactas).
//   geocodificarDireccion() para una dirección ya escrita (la de la empresa, o
//                           un pedido cargado sin elegir sugerencia).
//
// Las dos corren en los DOS lados: en el servidor (panel admin) y en el
// navegador, desde la app del conductor.
//
// Se consulta a DOS buscadores, porque en Arica cada uno sabe cosas que el otro
// no (spec 019: Mapbox salió y Google pasó a ser el de los números):
//
//   GOOGLE  tiene los NÚMEROS de casa, que es lo que hace que la ruta llegue a la
//           puerta. Se le pregunta solo por direcciones con número, a través del
//           servidor, que tiene la clave (ver ./google.ts).
//   OSM     tiene los puntos de interés y los nombres de población ("Terminal
//   (Nominatim) Rodoviario de Arica", "Población Nueva Esperanza") y los nombres de
//           calle correctos, pero casi no tiene números de casa en Arica. Y algo
//           que ningún otro proveedor puede dar: lo que la empresa MISMA corrige
//           en OpenStreetMap aparece acá en minutos.
//
// Por eso las sugerencias se muestran juntas (ver combinarSugerencias) en vez de
// elegir un proveedor: las puertas primero, y debajo lo que OSM agrega.
//
// El tercer camino, y el único que no le pregunta a nadie: un Plus Code se
// resuelve con aritmética. Ver ./codigo.ts y lib/geo/plus-code.ts.

// Módulos (spec 002 T033, spec 016, spec 019):
//   consulta.ts           limpiar el texto y comparar nombres de calle (puro)
//   calles.ts             catálogo de calles de Arica (calles-arica.ts, generado)
//   google.ts · nominatim.ts   los dos buscadores
//   codigo.ts             Plus Codes
//   sugerir.ts            sugerencias mientras se escribe
//   completar-numero.ts   unir listas y buscar el número en la calle escrita
//   ubicar.ts             ubicarDireccion y geocodificarDireccion

export { normalizarConsulta } from "./consulta";
export { NOMBRE_FUENTE, type Confianza, type Fuente, type SugerenciaDireccion, type TipoUbicacion } from "./tipos";
export { esPlusCode } from "./codigo";
export { sugerirDirecciones } from "./sugerir";
export { sugerirEnOsm } from "./nominatim";
export { aplicarPuertas, combinarSugerencias, completarNumeroEnCalles, type PuertasEnCalles } from "./completar-numero";
export { geocodificarDireccion, ubicarDireccion, type ResultadoUbicacion } from "./ubicar";
