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
// Se consulta a DOS proveedores, porque en Arica cada uno sabe cosas que el
// otro no. Medido con las direcciones reales de la empresa:
//
//   MAPBOX  tiene los NÚMEROS de casa ("Quinsachata 1749", "Chacabuco 500"), que
//           es lo que hace que la ruta llegue a la puerta. Es además el mismo
//           proveedor del mapa y de las indicaciones (ver lib/geo/mapbox/direcciones.ts), así que
//           las coordenadas y el trazado vienen del mismo mundo. Pero no tiene
//           puntos de interés, y a veces devuelve OTRA calle: para
//           "Av. Diego Portales 2000" contestó "Avenida Senador Humberto Palza
//           Corvacho 2000".
//   OSM     tiene los puntos de interés y los nombres de población ("Terminal
//   (Nominatim) Rodoviario de Arica", "Población Nueva Esperanza") y los nombres de
//           calle correctos, pero casi no tiene números de casa en Arica. Y algo
//           que ningún otro proveedor puede dar: lo que la empresa MISMA corrige
//           en OpenStreetMap aparece acá en minutos.
//
// Por eso las sugerencias se muestran juntas (ver combinarSugerencias) en vez de
// elegir un proveedor: Mapbox primero, y debajo lo que OSM agrega.
//
// ⚠️ OJO con lo que se DIBUJA y con el CAMINO que elige la ruta: eso sale de las
// teselas y del grafo de calles de Mapbox, que se arman con OSM más fuentes
// propias y se refrescan cuando Mapbox los refresca. Una corrección hecha en
// OpenStreetMap NO aparece ahí al rato; Mapbox no publica cuánto tarda y no hay
// forma de apurarlo desde acá. Lo único que refleja OSM al instante es esta
// búsqueda de direcciones.
//
// OJO con el contrato de Mapbox: el geocodificador "temporal" —el que se usa
// acá, el que entra en el plan gratuito— permite mostrar y usar el resultado,
// pero no guardarlo indefinidamente. Nosotros SÍ guardamos lat/lng junto al
// pedido (es lo que hace que la ruta se pueda rearmar sin volver a consultar).
// Para quedar del lado limpio hay que activar "permanent geocoding" en la
// cuenta y agregarle "permanent=true" a la consulta; queda anotado acá para
// cuando la cuenta pase a plan pago.
// El tercer camino, y el único que no le pregunta a nadie: un Plus Code se
// resuelve con aritmética. Ver ./codigo.ts y lib/geo/plus-code.ts.

// Módulos (spec 002 T033, spec 016):
//   consulta.ts           limpiar el texto y comparar nombres de calle (puro)
//   calles.ts             catálogo de calles de Arica (calles-arica.ts, generado)
//   mapbox.ts · nominatim.ts   los dos proveedores
//   codigo.ts             Plus Codes
//   completar-numero.ts   unir listas y buscar el número en la calle escrita
//   ubicar.ts             ubicarDireccion y geocodificarDireccion

export { normalizarConsulta } from "./consulta";
export { NOMBRE_FUENTE, type Confianza, type Fuente, type SugerenciaDireccion, type TipoUbicacion } from "./tipos";
export { esPlusCode } from "./codigo";
export { sugerirDirecciones } from "./mapbox";
export { sugerirEnOsm } from "./nominatim";
export { aplicarPuertas, combinarSugerencias, completarNumeroEnCalles, type PuertasEnCalles } from "./completar-numero";
export { geocodificarDireccion, ubicarDireccion, type ResultadoUbicacion } from "./ubicar";
