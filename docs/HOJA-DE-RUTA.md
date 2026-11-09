# Hoja de ruta

Qué se construye y en qué orden. Detalle de cada feature en `specs/` (índice:
`specs/README.md`).

**Prioridad (2026-11-05, dueño):** primero terminar la app del conductor (020, lo que queda de la
019, 015, 016, 017, 018, 005, 003). El panel y los pagos (006, facturación) van después.
La ruta pasa a evaluarse por km, tiempo, éxito por parada y ganancia (antes, solo km), y los ⚠ de
la guía se resuelven antes de armarla (`AGENTS.md`, "El flujo del conductor").
Anotadas el 2026-11-05, sin orden decidido todavía:
- 021 (lector de etiquetas) y 028 (escáner en vivo): hechas y cerradas el 2026-11-08 (resumen
  abajo). Falta terreno: ~50 etiquetas reales (spec 005, T030).
- 023, 025 y 026, en borrador: paradas cercanas, referencias en direcciones y guardado persistente.
  024 a medias (bultos e «Invertir» hechos; faltan tiempo, éxito y ganancia).

## Contexto del negocio

- 1 conductor, 1 mandante (Starken / Mercado Libre), Arica, ~60 pedidos/día.
- Pedidos del día: **guía de despacho** (líneas `OF + destino`) en Infologistic, equipo de
  Mercado Pago. Nombre, teléfono y "POR PAGAR" están solo en la **etiqueta**.
- El OF va dentro del código de barras de la etiqueta (dígitos 15–23 de 26).
- No se escribe nada en el paquete: cada parada muestra la **OF** y la descripción del paquete
  (2026-10-24).
- Datos del pedido: **se borran al cerrar el día**. Lo no entregado vuelve en otra guía.
- Legal (Ley 21.719, `docs/PRIVACIDAD.md`): se cierra al **lanzamiento oficial**; no frena
  el desarrollo ni el piloto.
- Dolores, en orden: 1) cargar pedidos a mano · 2) visitas fallidas · 3) ubicar el paquete.

## Orden

| # | Spec | Qué entrega | Dolor | Estado |
|---|---|---|---|---|
| 0 | **015 app-android** | APK: llamar con un toque y resultado automático, abrir sin señal, pantalla encendida, escáner | 2 y 3 | en curso (27/30): APK instalada en el teléfono; falta probar llamadas con chip |
| 0a | 016 ubicar-direcciones | la guía se ubica sola pese al tipeo; calles cortas sin numerar entran aproximadas | 1 | en curso (2026-10-24): 13 → 19 de 22 sin corregir; falta decidir Google y probar un día real |
| 0b | 002 Fases 1–2 + US1 | estructura por dominio + prueba de arquitectura | base | hecha (2026-10-24), probada en la APK; falta mirar el panel con la cuenta del jefe |
| 1 | 007 cumplimiento-datos | borrado diario, borrado al desactivar cuenta, modo piloto/oficial | regla | MVP hecho (2026-10-24): borrado diario y por acceso; falta modo piloto/oficial (P3) |
| 2 | 003 referencia-paquete | OF y descripción del paquete en cada parada, búsqueda por OF | 3 | hecha (2026-10-24, 15/16); falta probarla en un día real |
| 3 | 005 carga-rapida-pedidos | guía → ruta → escaneo de etiqueta (+ IA en piloto) | 1 y 3 | en curso (2026-10-24): guía y etiqueta leídas en el teléfono (IA de respaldo), PARADA n de N, cobro del día, faltantes y cambio de dirección hechos (2026-10-25); falta probar con etiquetas reales |
| 4 | 002 US2 | renombrado a "conductor" en código y base | orden | hecho (2026-10-25, migración 0006); falta T049–T051 (tablas `encomienda_*` y `motivo`) |
| 5 | 006 indicadores-negocio | entregas sobre asignado, contactados, rendimiento, margen, bono | medir | hecha (2026-10-25, migración 0007); asignados y contactados llegan desde esta versión |
| 6 | 002 US3/US4 | dividir archivos grandes, docs al día | orden | tareas listas |
| 7 | **Fase WhatsApp** | chip del negocio + Meta (la 010 ya está hecha), 004 (WhatsApp propio, "voy llegando") y 014 (¿conviene ir al pedido con horario?) | 2 | postergada hasta tener el chip |
| — | facturación / ingresos reales | se conserva | — | prioridad mínima |

Por qué: la 015 primero porque el conductor usa Android (2026-10-24) y con WhatsApp en pausa
la llamada es el contacto: llamar con un toque y registrar solo si contestó es lo que más ayuda
hoy; además deja el escáner listo para la 005. Después, 007 porque el borrado diario cambia a
todas las demás. 003 antes que 005
porque 005 llena la OF y la referencia que define la 003. 006 necesita lo asignado (005) y el cierre (007).
La 004 espera la fase de WhatsApp (chip del negocio); mientras, se llama (013). La lista de no
entregados al cerrar el día la construye la 007.

## Datos nuevos por feature

| Feature | Teléfono (se borra al cerrar el día) | Servidor | Proveedores |
|---|---|---|---|
| 007 | store `dias` (solo conteos, sobrevive) | `empresa.modo_operacion`, registro de proveedores | — |
| 015 | — (caché del service worker; el registro de llamadas ya no se lee desde la 020) | Vercel: `APK_VERSION_MINIMA`, `APK_URL` | Google code scanner y lector de texto ML Kit (procesan en el teléfono) |
| 003 | `pedidos`: of (opcional a mano), referencia, fotoId · store `fotos` (v5) | — | — |
| 016 | — | — | — (catálogo de calles de OSM en el código; Google si se aprueba) |
| 005 | `pedidos`: of (desde el código de barras), bultos, bultosEscaneados, porPagar, montoPorPagar, folioGuia, origenCarga | — (fotos solo en tránsito) | IA de visión (Claude), solo si el teléfono no pudo leer la foto |
| 004 | `pedidos`: avisos[] | `empresa`: mensaje_aviso, mensaje_llegando | WhatsApp propio · Meta |
| 006 | — | `encomienda_jornadas.asignados` y `contactados` | — |

Modelo esencial (entidades, estados, módulos): `docs/CLASES.md`.

## Spec 008 · modelo de dominio (hecha, 2026-10-21)

Catálogos y estados en un solo lugar (`catalogos.ts`, `estados.ts`), Supabase tipado con
`Database` (sin casts), contrato de WhatsApp compartido, modelo geo propio, `almacen/` partido
y tipado por store. Adelantó 002 T003 y T031.

## Spec 009 · un pedido por día (hecha, 2026-10-21)

Lo no entregado no pasa al día siguiente: si vuelve a salir, se escanea de nuevo. `ParadaLocal` se
fundió en `Pedido` (llamada, resultado y `fecha` en el pedido; la ruta guarda el orden).
IndexedDB v3 migra al abrir. La 007 queda solo con el borrado.

## Spec 010 · el aviso replanifica la ruta (hecha en código, 2026-10-21)

Botones Sí, estaré · Mañana · Otro horario. Mañana = no entregado (spec 012) y sale de la ruta; un bloque
reubica el pedido por llegada estimada. Se fue el rechazo por WhatsApp. Para activarla:
desplegar y plantilla en Meta (`docs/WHATSAPP.md`); la migración 0004 ya está aplicada.

## Spec 011 · un mismo idioma (hecha la parte 1, 2026-10-21)

Glosario único (`docs/CLASES.md` §0) en código, pantalla y docs: `DiaTrabajo`, `Pedido`, `Ruta`,
`ActividadPorEnviar`/`Actividad`, `PagoDelDia`… El aviso es uno por pedido (`Pedido.aviso`). La
parte 2 —tablas y columnas de la base— va en la spec 002 (T049–T050).

## Spec 021 · la etiqueta se lee en el teléfono (hecha, 2026-11-08)

El dueño: «no quiero que se envíen fotos a anthropic por temas legales de privacidad».
- La foto de la etiqueta la lee solo ML Kit en el teléfono, sin IA ni Cloud Vision: US$0 y el
  nombre y el teléfono no salen del teléfono. `/api/lectura` acepta solo la guía, que sigue con la
  IA (el dueño: no trae datos personales).
- Lector por zonas (`lectura/etiqueta/`): nunca el teléfono del remitente, no cruza renglones (el
  «0 de más»), junta valores partidos con guion, anclas tolerantes a palabras gastadas, bulto suelto
  («001/001»), OF de los dígitos 15–23 del código impreso, «CTA. CTE.» vacía no es pago y «$0»
  impreso sin POR PAGAR es «no se cobra» (dueño). La foto se lee dos veces (2400 y 1600 px) y lo que
  no coincide queda por revisar: manda la precisión sobre la rapidez (dueño).
- Diagnóstico → «Probar etiqueta» y «Copiar anonimizado»: los textos reales de Lion, Starken normal
  y EXPRES son pruebas sin datos de nadie (`pruebas/fixtures/lectura/`).
- El pago, el monto y los bultos ya no los pisa una lectura sin OF confirmada.
- Pendiente: ~50 etiquetas reales en terreno (005 T030); el dueño borra `LECTURA_MODELO` en Vercel.

## Spec 028 · escáner de etiquetas en vivo (hecha, 2026-11-08)

Al cargar el auto, la cámara de ARES queda abierta y cada etiqueta se lee sola (APK 1.6.0).
- Plugin `EscanerVivo`: CameraX debajo de la WebView y ML Kit por cuadro (códigos + renglones con
  caja), sin red ni librerías nuevas. Permisos `CAMERA` y `VIBRATE`.
- Un dato vale cuando sale igual en ≥ 2 cuadros (`votos.ts`; nombres parecidos cuentan juntos) y al
  pedido va solo lo firme. Un cuadro con dos códigos de Starken no cuenta (la caja del lado).
- Sonidos «Marimba» elegidos por el dueño: un tic que sube por dato firme, el de pedido leído y dos
  notas que bajan con un ⚠, que pausa la lectura ahí mismo. Sin racha (la descartó el dueño).
- Captura en alta sin toque como foto del paquete, y linterna. Desde la parada sigue la foto.
- Medido en el V2430 con las tres etiquetas reales: alcanza en vivo; el lector por posición queda
  para cuando una etiqueta lo pida.
- La APK de prueba (`cl.dashund.ares.debug`) entra siempre en modo prueba.
- Pendiente: `APK_VERSION_MINIMA=1.6.0` y `APK_URL` en Vercel (dueño); probar uno por uno linterna,
  ⚠, modo avión y sin permiso de cámara; terreno.

## Spec 012 · entregado o no (hecha, 2026-10-21)

En la puerta: "Pedido entregado", llamar (redondo) o "No se entrega" → "Dejar como pendiente" ·
"No entregado". Desde el 2026-11-06 no se pregunta ni se detecta si contestó (spec 020).
Sin motivo (se fueron No morador, No hay respuesta y Rechazo): lo no entregado se tacha por hoy
y, si vuelve a salir, se escanea de nuevo. "Mañana" lo deja no entregado. El panel muestra
entregados y no entregados. La columna `motivo` de la base se borra en 002 T051.

## Spec 013 · sin WhatsApp por ahora (hecha, 2026-10-24)

Los avisos pasan a una fase posterior: falta el chip del negocio y el token de Meta. Mientras,
la app ayuda con la ruta y con llamar: sin las variables de Meta no manda avisos, no consulta
respuestas ni muestra el error del canal. Cuando estén, se activan solos (`docs/WHATSAPP.md`).

## Algoritmo de rutas: qué se midió (2026-10-29)

El dueño trajo una revisión de literatura que recomienda, para una ciudad como Arica, dos
fases: sectorizar (HSAC o k-means) y optimizar dentro de cada sector con ALNS o Tabu Search
(cita un 22,6 % menos de tiempo de viaje). Las citas son del dueño; acá no se verificaron.
Se midió contra lo que hace ARES (búsqueda local iterada sobre la matriz real de calles,
`lib/rutas/orden-paradas`, a fondo en la propuesta):

- **Con un solo conductor, sectorizar empeora.** En días al azar de 41 a 81 puntos, armar
  por 3, 4 o 6 sectores y optimizar cada uno dio rutas entre 4 % y 20 % más largas que
  optimizar todo junto. Sectorizar sirve para repartir entre varios vehículos o con miles de
  entregas; con una camioneta y ~60 paradas solo le pone paredes a la búsqueda. El 22,6 % se
  compara contra métodos simples (vecino más cercano), no contra una búsqueda como esta.
- **El orden está en el óptimo práctico.** En la ruta real de 67 puntos del 29-10, la búsqueda
  a fondo llega a 39,22 km en 1,4 s en el PC; 87.000 intentos en 60 s no bajaron un metro.
- **Lo que sí vale de esa revisión es la calibración local**, y es por donde se gana: la matriz
  es por calles reales (Mapbox, asimétrica: 13,7 % en promedio por los sentidos únicos), las
  direcciones mal ubicadas cuestan más que cualquier mejora del orden (dos paradas mal
  puestas subían la ruta de 39,3 a 59,1 km), y dar la vuelta solo donde la calle lo permite.
- **ALNS o Tabu** tienen sentido si llegan varios conductores o ventanas horarias apretadas
  para muchos clientes (`con-horarios.ts`). Hoy no.

Segunda tanda de la misma revisión (citas del dueño, no verificadas), y qué se decidió:

- **Costo con varios criterios (distancia, tiempo, giros complejos, semáforos; colonias de
  hormigas con 12,3 % menos costo).** El dueño pidió menos kilómetros: el objetivo sigue siendo
  km. De los giros complejos se tomó el que más pesa acá: no dar la vuelta en pasajes ni
  residenciales (`geo/ors/vuelta.ts`, `generar-ruta/sentido.ts`). El tiempo vendría gratis en
  la misma matriz si algún día sirve de desempate.
- **Probabilidad de fallo en el primer intento.** Necesita historial por cliente, y los datos de
  clientes se borran cada día. Ya están "llámalo antes de bajar" y "Dejar como pendiente". Más
  adelante, si sirve, por zona y hora sin datos personales.
- **Reoptimizar en ruta al llegar pedidos (horizonte rodante).** Decisión del dueño: lo hace el
  conductor a mano (Rehacer la ruta → Desde: Mi ubicación), que ordena solo lo pendiente.
- **Posponer clientes muy caros.** Ya hay aviso de parada lejana y se puede quitar de la
  propuesta. Apareció un caso que el aviso no veía: una parada cerca de otras pero pegada por
  Mapbox a la troncal (6,8 km de vuelta por la carretera); ahora se corre a la calle por donde se
  llega (`geo/acceso.ts`, con las calles de las teselas de OpenFreeMap desde la spec 019).
- **Criterio final del dueño: cada zona una sola vez.** Terminar un barrio antes de pasar al
  siguiente y no volver a pisarlo, aunque cueste algo más: en la prueba de 66 paradas, +1,7 km
  (+4,6 %). Es la versión que funciona de la sectorización: zonas chicas de barrio (~900 m, 17) y
  el optimizador decide el orden entre y dentro de ellas, en vez de pocos sectores fijos (que
  daban 4 % a 20 % más). `generar-ruta/zonas.ts`.
- **Casilleros o depósitos compartidos.** Decisión de negocio con Starken, fuera de la app.
- **Construcción aleatoria en milisegundos.** No hace falta: la búsqueda tarda 1-2 s.

Bultos primero (2026-11-07, spec 024; días simulados de 60–100 paradas, sin consultas):

- **La más corta ya descarga casi lo más rápido posible.** Con 4 min por parada, dos tercios del
  día se van en las paradas: manejar menos es hacer más paradas por hora. Aunque los km no
  importaran, la espera de los bultos baja como mucho 10–15 %, por +10–15 % de km.
- **El dueño eligió «solo si es casi gratis»:** ≤ 1 % de km, cada zona una vez y cada metro de más
  tiene que sacar los bultos en promedio un metro antes. 3 de 16 días bajan 5–10 % (~5 bultos menos
  a las 2 h) por +0,3 a +0,6 % de km; los demás quedan igual. Sin el precio por metro, la pasada
  gastaba casi 1 % de km por 0,03 % de espera.
- **En el día real de 53 paradas** (teléfono, matriz de ORS): +0,1 % de km y −0,4 % de espera. Y la
  misma ruta al revés midió +2,8 km (+7,8 %): la matriz por calles no es simétrica.

El tiempo en el costo (2026-11-08, spec 024; 3 días simulados de 80 paradas con la matriz real de ORS):

- **El dueño eligió pesos en el orden:** el km a $130 y la hora al volante a $6.000 (1 s ≈ 12,8 m).
  El éxito por parada no entra: los horarios siguen en su propuesta.
- **La búsqueda sola es ruidosa con tiempo:** redondear la matriz a décimas de segundo movía el
  resultado ±1 %, tanto como lo que se gana. Con el mejor orden por metros como arranque: −1,5 % de
  tiempo (~2 min), −1 % de plata y los mismos km, y nunca más caro que el orden por km.

## Fuera de alcance

Varios conductores o mandantes · seguir paquetes entre días · prueba de entrega con
foto/firma · GPS permanente.
