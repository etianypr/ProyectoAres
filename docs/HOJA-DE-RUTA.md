# Hoja de ruta

Qué se construye y en qué orden. Detalle de cada feature en `specs/` (índice:
`specs/README.md`).

## Contexto del negocio

- 1 conductor, 1 mandante (Starken / Mercado Libre), Arica, ~60 pedidos/día.
- Pedidos del día: **guía de despacho** (líneas `OF + destino`) en Infologistic, equipo de
  Mercado Pago. Nombre, teléfono y "POR PAGAR" están solo en la **etiqueta**.
- El OF va dentro del código de barras de la etiqueta (dígitos 15–23 de 26).
- El conductor escribe con rotulador la **posición en la ruta optimizada**; fija en el día.
- Datos del pedido: **se borran al cerrar el día**. Lo no entregado vuelve en otra guía.
- Legal (Ley 21.719, `docs/PRIVACIDAD.md`): se cierra al **lanzamiento oficial**; no frena
  el desarrollo ni el piloto.
- Dolores, en orden: 1) cargar pedidos a mano · 2) visitas fallidas · 3) ubicar el paquete.

## Orden

| # | Spec | Qué entrega | Dolor | Estado |
|---|---|---|---|---|
| 0 | 002 Fases 1–2 + US1 | estructura por dominio + prueba de arquitectura | base | tareas listas |
| 1 | 007 cumplimiento-datos | borrado diario, borrado al desactivar cuenta, modo piloto/oficial | regla | plan + tareas |
| 2 | 003 referencia-paquete | número (posición) en el paquete, referencia, orden de carga | 3 | plan + tareas |
| 3 | 005 carga-rapida-pedidos | guía → ruta → escaneo de etiqueta (+ IA en piloto) | 1 y 3 | plan + tareas |
| 4 | 004 menos-visitas-fallidas | aviso por WhatsApp propio, "voy llegando", devoluciones | 2 | plan + tareas |
| 5 | 002 US2 | renombrado chofer → conductor (incl. base) | orden | tareas listas; requiere copia de la base |
| 6 | 006 indicadores-negocio | entregas sobre asignado, rendimiento, margen, bono | medir | plan + tareas |
| 7 | 002 US3/US4 | dividir archivos grandes, docs al día | orden | tareas listas |
| — | facturación / ingresos reales | se conserva | — | prioridad mínima |

Por qué: 007 primero porque el borrado diario cambia a todas las demás. 003 antes que 005
porque 005 reusa su numeración y referencia. 004 después de 005 porque los avisos necesitan
el teléfono que llega al escanear. 006 necesita lo asignado (005) y el cierre (007).

## Datos nuevos por feature

| Feature | Teléfono (se borra al cerrar el día) | Servidor | Proveedores |
|---|---|---|---|
| 007 | store `dias` (solo conteos, sobrevive) | `empresa.modo_operacion`, registro de proveedores | — |
| 003 | `pedidos`: numero, referencia, fotoId · store `fotos` · `rutas.cargados` | — | — |
| 005 | `pedidos`: of, bultos, bultosEscaneados, porPagar, montoPorPagar, folioGuia, origenCarga | — (fotos solo en tránsito) | IA de visión (Claude) |
| 004 | `pedidos`: avisos[] | `empresa`: mensaje_aviso, mensaje_llegando | WhatsApp propio · Meta |
| 006 | — | `encomienda_jornadas.asignados` | — |

Modelo esencial (entidades, estados, módulos): `docs/CLASES.md`.

## Spec 008 · modelo de dominio (hecha, 2026-10-21)

Catálogos y estados en un solo lugar (`catalogos.ts`, `estados.ts`), Supabase tipado con
`Database` (sin casts), contrato de WhatsApp compartido, modelo geo propio, `almacen/` partido
y tipado por store. Adelantó 002 T003 y T031. Queda para 002: `chofer` → `conductor`.

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
parte 2 —tablas y columnas de la base— va con el renombre `chofer` → `conductor` (002 T049–T050).

## Spec 012 · entregado o no (hecha, 2026-10-21)

En la puerta: "Pedido finalizado", o "No se pudo" → "Dejar como pendiente" · "No entregado".
Sin motivo (se fueron No morador, No hay respuesta y Rechazo): lo no entregado se tacha por hoy
y, si vuelve a salir, se escanea de nuevo. "Mañana" lo deja no entregado. El panel muestra
entregados y no entregados. La columna `motivo` de la base se borra en 002 T051.

## Fuera de alcance

Varios conductores o mandantes · seguir paquetes entre días · prueba de entrega con
foto/firma · GPS permanente.
