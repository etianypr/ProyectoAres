# 038 · Tiempos: ubicar la guía, corregir con IA y optimizar la ruta

Terreno (dueño, 2026-11-17): las tres esperas del conductor se sienten lentas, que son ubicar la
guía, la corrección con IA y «Optimizar ruta» / «Recalcular ruta». Objetivo: bajarlas **sin cambiar
los resultados** (mismas ubicaciones, mismas propuestas de la IA, misma ruta). Rama
`038-tiempos`, creada encima de `037-corregir-lejanas` (dueño).

## Decisiones del dueño (2026-11-17)
- IA: solo paralelizar; la pantalla de la carga no cambia (sin IA en segundo plano).
- Autorizados: región de Vercel junto a Supabase; que el proxy no repita `getUser` en las rutas
  `/api` del conductor que ya se verifican solas.
- No autorizados: quitar los 500 ms de completar el número; cambiar el modelo de la IA.
- Sin conexión: «Optimizar ruta» corta los reintentos tras 2 sin respuesta y no vuelve a
  preguntarle a Google si Google y OSM ya fallaron.
- Adelantar las consultas a Nominatim (solo Nominatim) mientras se revisan las líneas.

## Línea base (PC, sin red)
- `npm run medir` (80 paradas): armado entero 2183-2459 ms (matriz 604-934), orden con rumbo
  1494-1554 ms, orden de antes (sin rumbo) 5656-5925 ms. 62,09 km, $21868.

## Qué cambia
Nada visible, salvo el adelanto de la carga: el conductor ve lo mismo, antes.

- **Ruta** (todo exacto; mismo orden, sentidos y costo bit a bit):
  - el optimizador sin rumbo lee una tabla plana (`enTabla`, `orden-paradas/costo.ts`) y el
    Or-opt no arma arreglos por jugada; las jugadas con rumbo recorren por índice;
  - sin ventana vigente no se calcula `orden("horarios")`; sin bloques, la huella no lleva el
    cuarto de hora (`generar-ruta/huella.ts`);
  - el GPS de «Mi ubicación» se pide a la vez que se reintenta ubicar y se revisan los accesos;
  - **la revisión de accesos quedó como antes** (dueño, 2026-11-18): la versión más rápida (en paralelo con
    el reintento, grupo continuo de 6, sin recordar lo que no se pudo leer, 64 teselas) alcanzaba a revisar
    casi todas las paradas, movía más a su calle y la ruta «iba y volvía». Era el único cambio de la 038
    que cambiaba la ruta: el orden da lo mismo bit a bit;
  - sin conexión, el reintento para tras 2 sin respuesta; «Recalcular ruta» se cancela con atrás.
- **Ubicar**:
  - caché del día de Nominatim y dedupe en vuelo de Google (1000 consultas cada una), olvidadas
    con `olvidarMemoriasDelDia()` (`local/olvidar-memorias.ts`, que ahora también olvida la
    última propuesta y los accesos);
  - fila de Nominatim con **una consulta abierta a la vez** (su política) y sin gastar turnos
    abortados; prioridad baja para el adelanto;
  - adelanto de OSM mientras se revisan las líneas (`use-adelanto-osm.ts`);
  - la carga ubica de a 3 y procesa en orden (`VENTANA`); el catálogo de calles sin crear
    memoria (Damerau con filas reutilizadas: 7,5 → 0,66 ms por `callesParecidas`);
  - sin respuesta de Google ni de OSM no se completa el número (2 fallos: ~48 → ~24 s).
- **IA**: de a 2 (`DIRECCIONES_A_LA_VEZ`), arrancando de a una; el mismo destino se pregunta una
  vez; detener corta la conversación; 429 de Anthropic ≠ sin conexión (baja a una); caché de
  prompt (`cache_control`); cada foto de la guía se achica al tomarla.
- **API**: rol y ficha a la vez en `conductorDeLaApi`; el proxy no repite `getUser` en las 4 API
  del conductor (lista exacta); `Server-Timing` (auth, proveedor; solo cifras).
- **Diagnóstico → «Tiempos»** (`lib/comun/cronometro.ts`, `observar-tiempos.tsx`): mediana, p90
  y último por tramo, solo cifras en `localStorage` (`ares-tiempos`), con «Copiar cifras».

## Medido (PC, sin red; antes = copia congelada, después = la rama)
- **«Crear N pedidos»** (`npm run medir:direcciones`, 30 líneas, latencias simuladas; mismo hash
  de resumen, filas y propuestas):

  | Fase | Antes | Después | Con 15 s de revisión (adelanto) |
  |---|---|---|---|
  | Ubicando | 35,8 s | 33,4 s | 19,7 s |
  | Corrigiendo con IA | 26,2 s | 16,9 s | 16,8 s |
  | Total | 62,1 s | 50,3 s | 36,5 s |

- **Ruta** (`npm run medir -- --corridas=3`, 80 paradas, mediana; hash de todo `a9a319db9f` en
  las dos: misma ruta, 62,09 km, $21868):

  | Etapa | Antes | Después |
  |---|---|---|
  | Armado entero (normal) | 2393 ms | 1743 ms |
  | Búsqueda con rumbo | 1356 ms | 942 ms |
  | Arranque sin rumbo | 259 ms | 33 ms |
  | 10 confirmados: «Confirmados» | 4753 ms | 629 ms |
  | 5 con bloque: arranque de horarios | 5034 ms | 712 ms |
  | «Pidió otra hora»: arranque de horarios | 10914 ms | 1539 ms (y no se calcula si el bloque ya cerró) |
  | Orden sin rumbo a fondo (respaldo ORS) | 5568 ms | 738 ms |

  En el V2430 (~2,6× el PC) el armado normal bajaría de ~6,7 s a ~4,5 s; un día con confirmados
  o un «Pidió otra hora», de ~25-40 s a ~5-8 s. Sin medir en el teléfono.

## Verificación
- Pruebas doradas generadas con el código de antes: `038-orden-dorado`, `038-armado`,
  `038-calles-dorado`, `038-ia`; más `038-ubicar`, `038-api`, `038-cronometro` y
  `lectura-fotos-guia` (`pruebas/README.md`). `npm test` 1096/1096 (con la revisión de accesos como antes), lint, tsc y build bien.
- **Falta, en el teléfono:** medir en el V2430 (APK de prueba, sin gastar) «Crear N», «Optimizar»
  de 80 paradas y los bloqueos de la pantalla; recorrer a 360 px cargar guía → ⚠ → optimizar →
  recalcular, también sin conexión; en terreno, comparar Diagnóstico → «Tiempos».
- **Le toca al dueño:** ver la región de Supabase (Settings → General) y, si es São Paulo
  (`sa-east-1`), poner las funciones de Vercel en `gru1` (Settings → Functions); medirlo antes y
  después con «Tiempos» (API: sesión). Subir la IA a 3 a la vez cuando «IA: caché leída» sea > 0
  y no haya 429.
