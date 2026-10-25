# Feature Specification: Carga del día desde la guía y escaneo de etiquetas

**Feature Branch**: `005-carga-rapida-pedidos` · **Created**: 2026-10-20 · **Status**: Draft

**Input**: "Foto de la guía → pedidos con OF y destino → ruta → escanear cada etiqueta: OF, destinatario, teléfono, por pagar, descripción. Salida: posición en la ruta + descripción."

**Decisiones (2026-10-20)**

- No se escribe nada en el paquete (2026-10-24): la parada se reconoce por la OF y la descripción (spec 003). `Pedido.of` lo agrega la 003; esta spec lo llena desde el código de barras.
- Datos del pedido se borran al cerrar el día (spec 007).
- IA usable desde el piloto; autorización de Starken al lanzamiento oficial (constitución v1.3.0, spec 007 FR-009).
- "POR PAGAR" sale en grande en la etiqueta. No se depende de la descarga de la guía.

## Flujo

Guía (foto) → N × {OF, destino} → ruta existente → escaneo de etiqueta: código de barras → OF → "PARADA n de N" + descripción; foto → destinatario, teléfono, por pagar.

- Guía trae solo OF + destino; nombre, teléfono y pago solo en la etiqueta.
- OF = clave guía↔ruta↔etiqueta; sale del código de barras, no de la IA. Detalle: `research.md`, diagrama: `plan.md`.

## User Scenarios & Testing *(mandatory)*

### US1 - Cargar el día desde la guía (P1)

Foto(s) de la guía → un pedido por línea con OF y destino → flujo de ruta existente.

**Independent Test**: foto de guía de 25 líneas → 25 pedidos propuestos, dudosos marcados, al confirmar entran a la ruta.

1. **Given** foto legible, **When** se carga, **Then** se listan líneas (OF 9 dígitos + destino) para revisar antes de crear pedidos.
2. **Given** total de la guía > líneas leídas, **When** termina la lectura, **Then** se avisa cuántas faltan; ninguna línea se descarta en silencio.
3. **Given** dos fotos superpuestas, **When** se cargan, **Then** los OF repetidos se juntan.
4. **Given** destino con basura (`&amp;`, "XV REGION DE ARICA"), **When** se crea el pedido, **Then** queda limpio.
5. **Given** lista revisada, **When** se confirma, **Then** los pedidos siguen el flujo actual de ubicación y ruta.
6. **Given** foto ilegible o IA no disponible, **When** falla, **Then** se puede pegar texto (copiado con Google Lens) o escribir líneas.

### US2 - Escanear etiqueta y saber dónde va (P1)

**Independent Test**: con ruta generada, escanear 3 etiquetas → parada y descripción correctas; OF ajeno → ofrece agregarlo.

1. **Given** OF en la ruta, **When** se escanea, **Then** se muestra "PARADA n de N" + descripción en lo más grande de la pantalla.
2. **Given** el escaneo, **When** se lee, **Then** OF y bulto salen del código de barras, no del texto.
3. **Given** código ilegible, **When** falla, **Then** se lee el OF impreso y el conductor lo confirma antes de enlazar.
4. **Given** OF fuera de la ruta, **When** se escanea, **Then** se ofrece crear el pedido desde la etiqueta y rehacer la ruta.
5. **Given** envío 001/002, **When** se escanean, **Then** misma parada y conteo de bultos faltantes.
6. **Given** foto con dos etiquetas, **When** se escanea, **Then** se usa la completa y centrada o se pide repetir.

### US3 - Completar el pedido desde la etiqueta (P1)

**Independent Test**: etiquetas Starken, Lion×Starken y una POR PAGAR → destinatario, teléfono +569, por pagar y monto correctos; dudosos marcados.

1. **Given** etiqueta legible, **When** se escanea, **Then** quedan destinatario, teléfono normalizado y por pagar (+ monto).
2. **Given** "POR PAGAR", **When** se escanea, **Then** monto exacto o "monto por revisar"; nunca $0 supuesto.
3. **Given** "CONTADO" o "CTA CTE" (o Lion×Starken sin recuadro), **When** se escanea, **Then** queda pagado.
4. **Given** dirección distinta al destino de la guía, **When** se escanea, **Then** aviso + opción de reemplazar y reubicar.
5. **Given** campos dudosos, **When** termina, **Then** quedan "por revisar" sin frenar el siguiente escaneo.
6. **Given** sin señal o IA caída, **When** se escanea, **Then** la parada aparece igual y los datos quedan pendientes con reintento.

### US4 - Saber qué cobrar (P2)

**Independent Test**: dos por pagar ($12.990 y $5.500) → resumen muestra $18.490.

1. **Given** parada por pagar, **When** es la activa, **Then** muestra "POR PAGAR $X" sin depender solo del color.
2. **Given** pedidos por pagar, **When** se abre el resumen del día, **Then** total y cantidad.

### US5 - Paquetes faltantes (P3)

**Independent Test**: guía de 25, 23 escaneadas → lista 2 OF faltantes.

1. **Given** líneas sin etiqueta escaneada, **When** se inicia la ruta, **Then** aviso con los faltantes, sin bloquear.

### Edge Cases

- Guía en varias fotos → unión por OF. Etiqueta arrugada/reflejo → reintento, luego OF impreso + confirmación.
- Línea sin paquete → aviso (US5); paquete sin línea → pedido nuevo (US2). Ruta reoptimizada → el escaneo muestra la parada de la ruta vigente.
- RUT, remitente, correo, cuenta corriente, rampa: no se extraen.

## Requirements *(mandatory)*

**Guía (US1)**
- **FR-001**: Cargar la guía desde una o varias fotos.
- **FR-002**: Cada línea → pedido con OF (9 dígitos) y destino limpio.
- **FR-003**: Validar formato OF, repetidos y, si se deduce, cantidad total; mostrar toda diferencia.
- **FR-004**: Revisar, corregir, quitar o agregar líneas antes de crear pedidos.
- **FR-005**: Los pedidos siguen el flujo existente de ubicación y ruta, sin cambiarlo.
- **FR-006**: Alternativa: texto pegado o escrito a mano.

**Etiqueta (US2, US3)**
- **FR-007**: OF y bulto se leen del código de barras en el teléfono, también sin conexión.
- **FR-008**: OF leído del texto impreso requiere confirmación del conductor.
- **FR-009**: Mostrar "PARADA n de N" + descripción como lo más grande de la pantalla.
- **FR-010**: Completar destinatario, teléfono (+569), por pagar y monto.
- **FR-011**: Con IA, la descripción física sale de la misma foto (envoltorio, color, tamaño, peso/medidas) y llena la referencia de la spec 003; sin IA, selectores de la 003.
- **FR-012**: Varios bultos = una parada con conteo escaneados/total.
- **FR-013**: OF fuera de la ruta → pedido nuevo + rehacer ruta.
- **FR-014**: Dirección distinta de la guía → aviso + reemplazo opcional.
- **FR-015**: Campos dudosos marcados; monto por pagar nunca supuesto.
- **FR-016**: Sin señal o sin IA: parada por código igual; datos pendientes con reintento automático.
- **FR-017**: Extraer solo lo necesario: no RUT, remitente, correo ni cuenta corriente.

**Cobro y control (US4, US5)**
- **FR-018**: Parada activa muestra "POR PAGAR $X"; resumen del día con total a cobrar.
- **FR-019**: Al iniciar la ruta, listar líneas sin paquete escaneado, sin bloquear.

**Número, privacidad, conservación**
- **FR-021**: "PARADA n de N" = posición en la ruta vigente al escanear; no se escribe en el paquete (spec 003).
- **FR-022**: IA usable desde el piloto; proveedor registrado en `docs/PRIVACIDAD.md` §3; autorización de Starken al lanzamiento oficial (spec 007 FR-009). Sin IA: código de barras + texto pegado (Google Lens) separado por palabras clave (`OF:`, `DESTINO:`, `DESTINATARIO`, `Tel`, `POR PAGAR`) + selectores 003.
- **FR-023**: Fotos descartadas tras la lectura (salvo foto del paquete, spec 003); servidor sin guardarlas ni registrar cuerpos.
- **FR-024**: Todos los datos de pedidos se borran al cerrar el día (spec 007); no pasan al siguiente.
- **FR-025**: Registrar origen de carga (guía IA · guía pegada · etiqueta · manual) como conteo sin datos personales.

*FR-020 retirado: reutilizar direcciones de días anteriores choca con el borrado diario.*

### Key Entities

Guía leída (folio, líneas OF + destino) · Lectura de etiqueta (OF, bulto, destinatario, teléfono, dirección, pago, monto, descripción, dudosos) · Pedido local + campos 005. Ver `data-model.md`.

## Success Criteria *(mandatory)*

- **SC-001**: Guía de 25 líneas cargada y revisada en ≤ 2 min (a mano: > 12 min).
- **SC-002**: Escaneo con señal → parada + descripción en ≤ 3 s; sin señal → parada en ≤ 1 s.
- **SC-003**: 0 enlaces etiqueta↔pedido erróneos en ≥ 50 etiquetas de prueba.
- **SC-004**: ≥ 95 % de OF de guía bien leídos desde foto; 100 % de diferencias de cantidad detectadas.
- **SC-005**: ≥ 90 % de etiquetas sin corrección de destinatario, teléfono y por pagar.
- **SC-006**: 100 % de etiquetas POR PAGAR marcadas con monto correcto o "por revisar"; ninguna como pagada.
- **SC-007**: Ningún dato personal llega a un proveedor no registrado en `docs/PRIVACIDAD.md`; servidor sin fotos.

## Assumptions

- Código de barras de 26 dígitos con OF en dígitos 15–23 (visto en 3 etiquetas, 2 formatos); se confirma con ≥ 50.
- POR PAGAR en el recuadro de pago; monto en "Total Monto O.F.".
- Android con la APK de la spec 015: el código de barras lo lee el escáner nativo, sin conexión (`escanearCodigo()`); en el navegador, `BarcodeDetector` o escribir el código.
- En el hub suele haber señal; en reparto puede no haber.
- ≤ 60 pedidos/día, un conductor, un mandante.
- Relación: referencia y número (003), avisos con el teléfono (004), asignados (006), borrado y modos (007).
