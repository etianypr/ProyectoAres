# Hoja de ruta

Qué se construye y en qué orden. Detalle de cada feature en `specs/` (índice:
`specs/README.md`).

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
| 015 | — (lee el registro de llamadas en el teléfono; caché del service worker) | Vercel: `APK_VERSION_MINIMA`, `APK_URL` | Google code scanner y lector de texto ML Kit (procesan en el teléfono) |
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

## Spec 012 · entregado o no (hecha, 2026-10-21)

En la puerta: "Pedido finalizado", o "No se pudo" → "Dejar como pendiente" · "No entregado".
Sin motivo (se fueron No morador, No hay respuesta y Rechazo): lo no entregado se tacha por hoy
y, si vuelve a salir, se escanea de nuevo. "Mañana" lo deja no entregado. El panel muestra
entregados y no entregados. La columna `motivo` de la base se borra en 002 T051.

## Spec 013 · sin WhatsApp por ahora (hecha, 2026-10-24)

Los avisos pasan a una fase posterior: falta el chip del negocio y el token de Meta. Mientras,
la app ayuda con la ruta y con llamar: sin las variables de Meta no manda avisos, no consulta
respuestas ni muestra el error del canal. Cuando estén, se activan solos (`docs/WHATSAPP.md`).

## Fuera de alcance

Varios conductores o mandantes · seguir paquetes entre días · prueba de entrega con
foto/firma · GPS permanente.
