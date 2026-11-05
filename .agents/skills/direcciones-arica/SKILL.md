---
name: direcciones-arica
description: Úsala cuando vayas a tocar, revisar o diagnosticar cómo ARES ubica la dirección de un pedido en Arica — ubicarDireccion, src/lib/geo/geocoding/ (consulta, calles-arica, nominatim, google, mapbox, completar-numero), plus-code.ts, direccion-ia/, corregir-direcciones.ts, generar-ruta/ubicar-pedidos.ts, mapbox/acceso.ts, api/geocodificar o api/direccion-ia — o cuando el dueño hable de una dirección «Sin ubicar», Plus Code, geocodificar, Nominatim, Google, una calle repetida o ambigua, referencias («con…», «frente a…»), «Corregir con IA», npm run calles o sondear, o de las specs 016, 018, 019, 022 o 025.
---

# Direcciones en Arica

Ubicar bien cada pedido es lo que más mejora la ruta: dos paradas mal puestas la subieron de
39,3 a 59,1 km (`docs/HOJA-DE-RUTA.md`, «Algoritmo de rutas»). El orden ya está en el óptimo
práctico (skill `rutas-ares`): si una ruta sale larga, mira primero los puntos. Las reglas vienen de
`AGENTS.md` («Direcciones en Arica», «Pedidos con problemas», «Plata»). Si esta skill no coincide
con ese archivo, vale `AGENTS.md`, y hay que avisar la diferencia.

## Antes de tocar nada
1. Lee `src/lib/geo/geocoding/ubicar.ts` entero: es la cadena real (resumen abajo y detalle en
   `references/cadena.md`).
2. Lee la spec que pidió el cambio: 016 (tipeo, calle corta, Google), 018 (IA), 019 (sin Mapbox:
   T008, T011–T013), 022 (⚠ en el pedido) o 025 (referencias). Las 022 y 025 son borradores: lo
   que digan «por definir» se pregunta al dueño, no se inventa.
3. Si las direcciones «fallan» en terreno: **primero se mide, después se toca código**. Los
   proveedores cambian sin avisar y un fixture viejo pasa en verde igual (pasó con Mapbox:
   `pruebas/README.md`, «Un fixture viejo miente y nada falla»). Medir gasta: ver «Plata».
4. ¿Cambia el formato de `pedidos` (un ⚠, una referencia)? Se pregunta antes y sube a idb v6:
   skill `base-local-idb`.

## Lo que ya está decidido (no se «corrige»)
- **Ante la duda, la app no elige** (constitución IV). `elegida: null` es la mitad del valor de
  `ubicarDireccion`: «Los Aromos» con número está en Arica y en Azapa, a 9 km; tomar el primero mandaba
  al conductor al lugar equivocado. Hoy la duda queda «Sin ubicar» y fuera de la ruta; la 022
  cambia eso (*pendiente*), pero el ⚠ no se pierde nunca.
- **300 m** separan «otro lugar» de «la misma puerta» (`METROS_AMBIGUEDAD`) y definen una calle
  corta (`METROS_CALLE_CORTA`): más que una cuadra de Arica.
- **Nunca una calle cuyo nombre no es el escrito** (016 FR-007). Mapbox interpola el número sobre
  cualquier calle parecida («Diego Portales 2000» → Palza Corvacho). Decide `esLaCalleEscrita`, no
  el `match_code` del proveedor; vale también para Google (`aSugerenciaGoogle`).
- **Tipeo acotado** (`coincidenciaCalle`): cada palabra que distingue tiene que estar; palabra de
  < 5 letras y números, exactos; 1 letra de corrección (2 desde 9 letras). «Poniente», «oriente»,
  «norte», «sur», «San» y «Santa» distinguen calles: no van a `PALABRAS_GENERICAS`.
- **La confianza se decide por componentes, nunca por `confidence`**: Mapbox lo recalibró a «low»
  en 23 de 23 y ningún pedido entraba a la ruta.
- **Aproximada entra a la ruta con advertencia**: Mapbox da «plausible» en 10 de 23; nadie
  confirma media ruta a mano. Llegar a la cuadra con el aviso es mejor que no salir.
- **La consulta no es la dirección guardada.** `normalizarConsulta` saca depto, letra, «# 12 3»,
  ceros, «, Arica»; el pedido conserva el texto entero (el depto es para tocar el timbre).
- **Plus Code primero, sin red** (`comoPlusCode` antes que cualquier proveedor). La sugerencia
  guarda el **código completo**: un código corto no significa nada sin referencia (se recupera
  contra `CENTRO_ARICA`). ≤ 20 m es exacta; más, aproximada con los metros a la vista.
- **Mapbox y Nominatim van en paralelo, no en cascada**: hacen falta las dos listas para ver que
  dos lugares responden al mismo texto. Google va al final y solo si mejora.
- **Sin señal no es «no existe»**: `puertaEnCalle` devuelve `null` y no descarta nada. Ningún error
  de red borra ni descarta.
- **La IA no escribe coordenadas** (018): elige un candidato por id, su confianza nunca supera la
  del candidato (`interpretar`) y el conductor confirma cada una (nada se aplica solo). A
  Anthropic va la dirección y lo que devolvieron los buscadores, sin nombre ni teléfono.
- **El catálogo de calles viaja en el código** (`calles-arica.ts`, 1.563 calles, generado): corrige
  sin red y no gasta turnos de Nominatim. No se edita a mano; A7 lo exime por `// GENERADO`.
- **Nada se recuerda de un día para otro** (016, fuera de alcance; borrado diario de la 007).
- **Ya se midió y se descartó**: Photon (0 puertas nuevas en 26) e IDE Chile (sin API)
  (`mcp/README.md`). Mapbox sale entero y no se vuelve a proponer.

## Dónde está cada cosa
| Qué | Archivo |
|---|---|
| La cadena: `ubicarDireccion`, `geocodificarDireccion` (solo la central: toma la mejor sin preguntar) | `src/lib/geo/geocoding/ubicar.ts` |
| Limpiar la consulta, partir calle/número, comparar nombres | `geocoding/consulta.ts` |
| Catálogo: `callesParecidas`, `largoDeCalle` · datos generados | `geocoding/calles.ts` · `calles-arica.ts` |
| Número en la calle oficial: `completarNumeroEnCalles`, `aplicarPuertas`, `combinarSugerencias` | `geocoding/completar-numero.ts` |
| Proveedores: `conMapbox`/`sugerirDirecciones` · `conNominatim`/`sugerirEnOsm` · `conGoogle`/`googleDirecto` | `geocoding/mapbox.ts` · `nominatim.ts` · `google.ts` |
| Plus Code: `resolverPlusCode`, `plusCodeDe` · en el campo: `comoPlusCode`, `esPlusCode` | `src/lib/geo/plus-code.ts` · `geocoding/codigo.ts` |
| Tipos (`TipoUbicacion`, `Confianza`, `Fuente`, `NOMBRE_FUENTE`) y `BBOX_ARICA` | `geocoding/tipos.ts`; recuadro en `geo/coordenada.ts` |
| Google en el servidor (clave `GOOGLE_MAPS_KEY`, sesión de conductor) | `src/app/api/geocodificar/route.ts` |
| IA: contrato · Claude (`server-only`) · bucle en el teléfono | `geo/direccion-ia/{contrato,servidor,cliente}.ts`, `api/direccion-ia/route.ts` |
| Proponer y aplicar (`corregirSinUbicar`, `esSegura`, `aplicarCorreccion`) | `lib/encomiendas/local/corregir-direcciones.ts` |
| Reintento al armar (`reintentarUbicar`, máx. 5) y punto pegado a carretera (`corregirAccesos`) | `generar-ruta/ubicar-pedidos.ts` + `geo/mapbox/acceso.ts` |
| Pantallas: campo con sugerencias · dudas · «Sin ubicar» · IA | `components/direccion/` · `_componentes/resolver-direccion.tsx`, `fila-pedido.tsx`, `corregir-ia.tsx`, `confirmar-correcciones.tsx`, `cargar-guia.tsx` |
| Catálogo y sondeo (solo leer; gastan red) | `scripts/generar-calles.mjs`, `scripts/sondear-proveedores.mjs` |

**Orden real de `ubicarDireccion`** (hoy, con Mapbox):
1. Plus Code → listo, sin red y sin Google.
2. `normalizarConsulta` → Mapbox (solo con `NEXT_PUBLIC_MAPBOX_TOKEN`) + Nominatim en paralelo.
3. Sin puerta con ese número: `completarNumeroEnCalles` arma hasta 3 calles (proveedores +
   catálogo, solo el grupo con menos letras corregidas) y pregunta **solo a Mapbox**
   «nombre oficial + número».
4. Clasifica: puertas a > 300 m o el mismo texto en dos lugares → `ambigua`; solo la calle →
   `aproximada` si la calle escrita mide ≤ 300 m, si no `solo_calle`; puerta interpolada →
   `aproximada`; puerta → `exacta`; nada → `no_encontrada`.
5. Google, último recurso: solo si no salió exacta, ambigua ni Plus Code; solo desde el navegador
   y si hay número. ROOFTOP = exacta; RANGE_INTERPOLATED = aproximada, que no reemplaza otra
   aproximada.

Quién la llama, qué pasa con la duda en cada pantalla y las trampas de la limpieza:
`references/cadena.md`.

## Cambios típicos
Paso a paso (referencias de la 025, ⚠ de la 022, sacar Mapbox de la 019, regenerar el catálogo,
tocar la IA, sumar un proveedor) en `references/cambios.md`. Lo común a todos:
- Un cambio en la cadena se prueba con `fetch` simulado **antes** de mirarlo en pantalla, y se
  recorre con la skill `recorrer-conductor` (cargar la guía con la cámara, «Pedidos fuera de la
  ruta», «Corregir con IA»).
- Un proveedor nuevo o un host nuevo en `src/`: se pregunta antes (costo y tope), va en
  `docs/PRIVACIDAD.md` y en `PROVEEDORES` de `pruebas/arquitectura.test.mjs` (A10). Skill
  `privacidad-destinatarios`.
- Si cambia un tipo o un módulo: `docs/CLASES.md` §4 y `docs/ARQUITECTURA.md` en el mismo cambio.

## Plata y cupos
| Proveedor | Costo | Dónde vive el tope |
|---|---|---|
| Plus Code, catálogo | US$0, sin red | — |
| Nominatim | gratis; política: máx. 1 consulta/s, nada en volumen | fila en `nominatim.ts` (`MS_ENTRE_CONSULTAS_OSM` = 1,2 s): 100 direcciones son ≥ 2 min |
| Google Geocoding | 10.000 gratis al mes; decidido: ~300 al día | **en la consola de Google Cloud, no en el código**: no hay contador. La cuota la crea el dueño (019 T012, *pendiente*) |
| Mapbox | cobra sin tope (cuenta de US$66, 2026-10-29) | ninguno: no agregues usos |
| Anthropic (IA 018) | ~US$0,02 por dirección (`claude-sonnet-5`, `DIRECCION_MODELO`) | `MAX_DIRECCIONES_POR_TANDA` = 15, `MAX_VUELTAS` = 6 |
| Overpass (`npm run calles`) | gratis; solo recibe el recuadro | uso razonable |

- Google se pide por cada dirección con número que no salió exacta, ambigua ni Plus Code, y por
  cada búsqueda de la IA. Al salir Mapbox casi todas van a pasar por ahí: el tope diario tiene que existir antes.
- `npm run sondear`: 27 consultas a Mapbox, 27 a Photon y 27 a Nominatim. No mide Google ni la
  cadena real. Se pregunta antes, diciendo eso.
- MCP `ares-geo`: `resolve_plus_code` y `encode_plus_code` son aritmética (libres);
  `get_route_ch` consulta ORS (se pregunta).
- Nunca un script que llame a `ubicarDireccion`, `googleDirecto` o la IA en bucle sin tope ni
  permiso, y nunca `Infinity` como cupo. Nunca crear claves ni cuotas de Google: lo hace el dueño.

## Pruebas
- Siempre: `npm test`, `npm run lint`, `npm run build`.
- Las del tema: `ubicar-direcciones`, `asistencia-direcciones`, `direccion-ia`, `12-plus-code`,
  `16-mcp` y `arquitectura` (A10). Una sola:
  `node --import ./pruebas/registrar.mjs --test pruebas/ubicar-direcciones.test.mjs`
- Proveedores: se reemplaza `globalThis.fetch`, no el módulo. Google: el doble atiende
  `/api/geocodificar` llamando a `googleDirecto(direccion, "clave-prueba")`, y
  `globalThis.window = {}` simula el teléfono (sin `window` no se pregunta a Google). Molde
  completo en `references/cambios.md`.
- La IA no usa `fetch` en las pruebas: `corregirConIA(dir, { pedir, buscar, calles })`.
- Cada `ubicarDireccion` espera el turno real de Nominatim (~1,2 s): junta los casos.
- Datos: calles reales del catálogo con números inventados (`ubicar-direcciones` usa 901–914).
  Nunca un nombre, un teléfono ni una dirección de un pedido real (skill
  `privacidad-destinatarios`).

## Pendientes
- **019 T008**: calle cercana con OSM en vez de Tilequery (`corregirAccesos` aún llama a Mapbox
  con el token puesto). **T011**: direcciones y la IA sin Mapbox; ojo: `completarNumeroEnCalles` y
  `sugerirDirecciones` solo saben preguntar a Mapbox. **T012**: Google con tope. **T013**: Mapbox
  fuera (dependencia, token, A10, PRIVACIDAD, `.env.example`, `Fuente` `"mapbox"`).
- **022**: el ⚠ queda en el pedido y entra a la ruta con la primera dirección encontrada; aviso dos
  paradas antes. Hoy, `ambigua`/`solo_calle`/`no_encontrada` → sin punto → fuera de la ruta.
- **025**: ubicar solo por calle y número; la referencia queda para el conductor. Hoy «con…» y
  «al lado de…» llegan al buscador (ver `references/cadena.md`), y `SISTEMA` de la IA no tiene
  la regla.
- Día real: 016 T013 (≤ 3 a corregir) y 018 T008.

## Docs que hoy no calzan con el código
- `docs/HOJA-DE-RUTA.md` (fila 0a y «Datos nuevos», 016) y `specs/016-…/spec.md` (US3) y `plan.md`
  dicen que Google espera decisión; se conectó el 2026-10-25 (T009–T010).
- `AGENTS.md`: «Google Geocoding tiene tope diario». En el código no hay tope y `MEMORY.md` dice
  que el dueño aún debe crear las cuotas.
- La Ayuda dice «Corregir con IA»; el botón dice «Corregir la dirección con IA» / «Corregir las N
  direcciones con IA». El plan de la 018 dice «Confirmar las N que coinciden»; el botón, «Confirmar
  las N seguras».
- `ubicar.ts` («marca el punto a mano») y `pedido-form-local.tsx` («hasta que marques el punto»)
  prometen marcar en el mapa; la app no lo permite: solo pegar un Plus Code.
- `geocoding/index.ts` cita `lib/geo/mapbox/direcciones.ts` (no existe), da el mapa y el trazado
  como de Mapbox y no lista `google.ts`; `docs/CLASES.md` §4 tampoco nombra `google.ts`.
- `.env.example` no trae `DIRECCION_MODELO`. `nominatim.ts` dice «~30 pedidos/día» (son ~100).
- `scripts/sondear-proveedores.mjs` manda su tabla a `src/lib/geo/proveedores/` (no existe) y cita
  `MAX_PUNTOS_POR_CONSULTA` en `lib/rutas.ts` (hoy en `geo/ors/direcciones.ts`).
- `docs/PRIVACIDAD.md`, fila Mapbox: «búsqueda de direcciones y el mapa»; el mapa ya es
  OpenFreeMap (019 T009).
