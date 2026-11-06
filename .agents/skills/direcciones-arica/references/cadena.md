# La cadena en detalle

Leerla cuando haya que cambiar o diagnosticar un paso concreto de la búsqueda. Todo lo de acá está
verificado contra el código del 2026-11-05; si algo cambió, manda el código.

## Quién llama a la búsqueda y qué hace con la duda
| Entrada | Llama a | Si no hay `elegida` |
|---|---|---|
| Cargar la guía (`_componentes/cargar-guia.tsx`) | `ubicarDireccion`, una por una; con punto, `fijarCoordenadas` (solo lat/lng; el texto queda como vino) | queda «Sin ubicar». Si hay IA en el servidor (`lecturaIA` = `ANTHROPIC_API_KEY`), sigue `corregirSinUbicar` y `fin-guia.tsx` muestra las propuestas |
| Editar o cargar a mano (`pedido-form-local.tsx`) | `ubicarDireccion` al guardar | `ResolverDireccion` muestra los candidatos con su foto de mapa, o «Guardar sin ubicar y corregir después» |
| Campo con sugerencias (`components/direccion/direccion-input.tsx`) | `sugerirDirecciones` (Plus Code y Google, 600 ms), `sugerirEnOsm` (800 ms), `completarNumeroEnCalles` (500 ms; `esperas.ts`) | se puede guardar igual; «Usar «…» tal como está» dice «pega su Plus Code acá» |
| Escaneo: la etiqueta trae otra dirección (`resultado-escaneo.tsx`, `usarDireccionEtiqueta`) | `ubicarDireccion` + `cambiarDireccion` | el pedido queda sin punto (el de antes era de otra dirección) |
| Armar la ruta (`generar-ruta/index.ts` → `reintentarUbicar`) | `ubicarDireccion`, secuencial, máx. 5 (`MAX_REINTENTOS_UBICAR`) | fuera de la ruta, con advertencia que nombra al destinatario (no sale del teléfono) |
| La central (`generar-ruta/partida.ts`) | `geocodificarDireccion` | toma la mejor sin preguntar: solo para la central, nunca para un pedido |
| «Corregir con IA» (`corregir-ia.tsx`, en «Pedidos fuera de la ruta») | `corregirSinUbicar` | «corrígelas a mano» |

`fila-pedido.tsx` marca «Sin ubicar» con ícono tachado **y** la palabra «Corregir»: ningún estado
depende solo del color.

## Constantes que deciden
| Constante | Valor | Archivo |
|---|---|---|
| `METROS_AMBIGUEDAD`, `METROS_CALLE_CORTA` | 300 m | `ubicar.ts` |
| `METROS_MISMA_PUERTA` (Plus Code exacto) | 20 m | `codigo.ts` |
| `DIGITOS` al anotar un Plus Code (`plusCodeDe`) | 11 (~3 m; 10 son ~14 m) | `plus-code.ts` |
| `CANDIDATOS_POR_PROVEEDOR` · `MIN_CARACTERES` | 5 · 3 | `tipos.ts` |
| `MAX_CALLES_A_PROBAR` · `MAX_RECORDADAS` | 3 (`completar-numero.ts`) · 100 consultas a Google recordadas mientras dura la pantalla (`google.ts`) | |
| `MS_ENTRE_CONSULTAS_OSM` | 1.200 ms, fila global | `nominatim.ts` |
| Topes de tiempo | Google 8 s; Nominatim 10 s; `/api/geocodificar` 12 s; teselas 8 s; IA 30 s | cada proveedor |
| `RECUADRO_ARICA` | sur −18,65 · oeste −70,45 · norte −18,35 · este −70,10 | `geo/coordenada.ts` |

## Confianza por fuente
- **Nominatim** (`aSugerenciaOsm`): con `house_number` → `exacta`; un punto de interés con nombre
  también (ese punto **es** el destino); una calle sin número → `aproximada` y `soloCalle`.
- **Google** (`aSugerenciaGoogle`): exige calle escrita, el mismo número y punto dentro de Arica;
  `ROOFTOP` → `exacta`, `RANGE_INTERPOLATED` → `aproximada`; lo demás se ignora (una calle sola la trae
  OSM). Desde la spec 019 es el que da el número de casa. En el servidor
  (panel) `conGoogle` no hace nada (`typeof window === "undefined"`).
- **Plus Code**: ≤ 20 m → `exacta`; si no, `aproximada` con «cubre unos N m».

## Lo que hace la limpieza (`normalizarConsulta`), medido sin red
| Escrito (inventado) | Consulta | ¿Calle + número? |
|---|---|---|
| `Lebu 50 frente a la plaza` · `Lebu 50, frente a la plaza` | `Lebu 50` | sí |
| `Lebu 50 esquina Maipú` · `Lebu 50 entre Maipú y Colón` | `Lebu 50` | sí |
| `Lebu 50 con Maipú` | sin cambios | **no** → no hay completar número ni Google |
| `Lebu 50 al lado del almacén` | sin cambios | **no** |
| `Lebu con Maipú 50` | sin cambios | sí, pero la calle queda `Lebu con Maipú` |
| `Pasaje 3 casa 12` | `Pasaje 3` | calle `Pasaje`, número `3`: se pierde el 12 |
| `GMCP+MX, Arica` | `GMCP+MX` | — (Plus Code: no llega a la limpieza) |

Detrás del número ya se cortan `LUGAR_TRAS_NUMERO` (sector, cerro, villa, población, condominio,
lote, manzana, interior, esquina, entre, frente, altura…), `COMA_TRAS_NUMERO`, `UNIDAD_*` (depto,
casa, block, torre, edificio…), `LETRA_O_SUBNUMERO` y `SIN_NUMERO` («S/N»). Lo pendiente de la 025
es «con …», «al lado de…» y lo que va **antes** del número. Ojo con el orden de `\b` y el punto en
`ABREVIATURAS` (el comentario del archivo cuenta cómo se rompió).

## Casos borde que conviene conocer
- **Homónimas que OSM no tiene.** El catálogo trae un solo «Los Aromos» (307 m). El largo de una
  calle es la diagonal de **todos** sus tramos con ese nombre, así que dos homónimas lejanas nunca
  pasan por «calle corta»… salvo que OSM no tenga la otra. Hoy la ambigüedad de «Los Aromos» con número la
  detectan los proveedores (dos puertas lejanas), no el catálogo. Al cambiar de proveedores (019
  T011), medir que esto se siga viendo.
- **Linderos.** El catálogo trae «Avenida Linderos», «Linderos Central» y «Avenida Linderos
  Oriente». Las pruebas de «Linderos 3536» usan proveedores simulados, no el catálogo.
- **Calle larga sin número.** `solo_calle` no entra sola: su punto es la mitad de la calle, que
  puede medir kilómetros (terreno 2026-10-28). Por lo mismo `esSegura` nunca acepta `soloCalle`.
- **Dos nombres de una misma calle** («Alejandro Azolas» y «Avenida Alejandro Azola»): puertas a
  ≤ 300 m no son ambiguas.

## La IA (spec 018) por dentro
- Teléfono (`cliente.ts`): arma la conversación, ejecuta `buscar_direccion` (Nominatim + Google en
  paralelo, hasta 8 candidatos, el punto con 4 decimales) y `calles_parecidas` (catálogo,
  hasta 5). Servidor (`servidor.ts`): solo habla con Claude (`SISTEMA`, `HERRAMIENTAS`, sin
  pensamiento, `effort: low`).
- La respuesta pasa por `interpretar`: un id que nadie devolvió no se acepta; un barrio deja la
  confianza en `baja`; «alta» baja a «media» si el candidato no es puerta exacta.
- `corregirSinUbicar`: solo pedidos pendientes, con dirección y sin punto; un candidato `baja` no
  se propone. `esSegura`: confianza alta, o media sobre una cuadra cuyo número no contradice.
  `aplicarCorreccion` deja en las notas «Dirección corregida con IA y confirmada…; decía «…»».

## Punto pegado a una carretera (`corregirAccesos`)
Las calles a 150 m (`RADIO_M`) salen de las teselas vectoriales de OpenFreeMap del zoom 14
(`geo/teselas.ts`, spec 019; antes Tilequery de Mapbox): la misma tesela sirve a todas las paradas
de su zona (~2,4 km), se guarda en memoria y el navegador la cachea. 6 paradas a la vez, 10 s en
total, nada sin señal. Las clases son las de OpenMapTiles (`minor` es la calle común). `elegirAcceso` (pura) corre el punto solo si la vía más cercana es
`motorway`/`trunk` y **no** es la calle de la dirección (`mismaCalle`: basta una palabra que
importe). Caso de origen: una casa junto a Capitán Ávalos costaba 6,8 km de vuelta.
