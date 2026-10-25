# Feature Specification: Reestructuración del código y nombre único "conductor"

**Feature Branch**: `002-reestructuracion-codigo` · **Created**: 2026-10-20 · **Status**: Draft

**Input**: "Limpiar el código y la estructura". P0/P1 (dependencias, código muerto, guardas)
ya hechos fuera de esta spec. Esta lleva lo estructural.

**Decisiones**: renombrar todo `chofer` → `conductor`, incluida la base (aprobado) ·
facturación/ingresos se conservan sin cambios · sin cambios de comportamiento salvo
`/choferes` → `/conductores`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cada cosa en su lugar (Priority: P1)

Como responsable del producto, quiero `lib/` por dominio y una prueba que impida mezclar
capas, para ubicar y revisar cualquier parte sin recorrer archivos sueltos.

**Independent Test**: `npm test` incluye la prueba de arquitectura; suite y build verdes.

1. **Given** `src/lib`, **When** se lista, **Then** solo hay carpetas de dominio (`auth`, `supabase`, `geo`, `rutas`, `whatsapp`, `nativo`, `encomiendas`, `conductores`, `comun`).
2. **Given** un import que rompe una capa, **When** se corre `npm test`, **Then** falla nombrando archivo y regla.
3. **Given** un concepto repetido (meses, token Mapbox, centro de Arica, rol, `FormState`, distancia), **When** se busca, **Then** hay una sola definición.
4. **Given** la reorganización, **When** se reparte y se revisa el día, **Then** todo funciona igual.

### User Story 2 - Un solo nombre: conductor (Priority: P1)

Como responsable del producto, quiero "conductor" en pantallas, rutas, código y base.

**Independent Test**: ensayo en una copia de la base (`quickstart.md`): mismas filas y pagos;
eventos en cola de la versión vieja llegan una vez.

1. **Given** la base con `choferes`/`chofer_id`/rol `chofer`, **When** se aplica la migración, **Then** existen `conductores`/`conductor_id`/`conductor` con las mismas filas y pagos.
2. **Given** la migración aplicada, **When** se re-ejecuta, **Then** no cambia nada ni falla.
3. **Given** eventos en cola con formato viejo, **When** la app nueva sincroniza, **Then** llegan una sola vez al conductor correcto.
4. **Given** la dirección `/choferes`, **When** se abre, **Then** redirige a `/conductores`.

### User Story 3 - Archivos de tamaño revisable (Priority: P2)

Como revisor, quiero que ningún archivo concentre varias responsabilidades.

**Independent Test**: ningún archivo de `src/` > 400 líneas sin excepción en `plan.md`.

1. **Given** los 13 archivos de > 400 líneas, **When** se dividen, **Then** cada pieza tiene una responsabilidad y ≤ 400 líneas.
2. **Given** lógica de cálculo dentro de componentes, **When** se extrae, **Then** queda como función pura con pruebas.

### User Story 4 - Documentación igual al código (Priority: P3)

Como responsable del producto, quiero que `docs/` y los `data-model.md` describan el código
real.

**Independent Test**: cada tabla, store, tipo y carpeta citada existe con ese nombre.

1. **Given** `docs/ARQUITECTURA.md` y `docs/CLASES.md`, **When** termina la feature, **Then** muestran la estructura y nombres nuevos.

### Edge Cases

- Teléfono con la versión vieja abierta durante el renombrado: su envío falla, los eventos
  quedan en cola y salen al recargar (sin pérdida).
- Fotos ya subidas en `fotos/choferes/`: se conservan; las nuevas van a `conductores/`.
- Base IndexedDB `pucarani-encomiendas`: no se renombra.
- Pieza que no baja de 400 líneas sin separar lo que va junto: excepción documentada.

## Requirements *(mandatory)*

- **FR-001**: `src/lib` por carpetas de dominio (tabla en `plan.md`); ningún archivo suelto.
- **FR-002**: `lib` no importa `app` ni `components`; `components/ui` sin dominio.
- **FR-003**: login/logout en `lib/auth`, no en una carpeta de ruta.
- **FR-004**: una sola definición por concepto repetido (lista en `plan.md`).
- **FR-005**: prueba de arquitectura automática (`contracts/estructura-modulos.md`).
- **FR-006**: componentes de una sola app viven junto a esa app.
- **FR-007**: migración re-ejecutable que renombra tabla, columnas, valor de rol, funciones,
  parámetros, policies, índices y triggers, sin perder filas.
- **FR-008**: pagos de días registrados idénticos después del renombrado.
- **FR-009**: eventos en cola de la versión anterior llegan una sola vez.
- **FR-010**: `/choferes/*` redirige a `/conductores/*`.
- **FR-011**: archivos, tipos, funciones y textos usan "conductor".
- **FR-012**: "chofer" solo en: lectura tolerante de datos viejos, redirección, carpeta de
  fotos viejas, migración de renombrado y migraciones históricas; cada caso comentado.
- **FR-013**: ningún archivo de `src/` > 400 líneas salvo excepción en `plan.md`.
- **FR-014**: cálculo dentro de componentes → funciones puras con pruebas.
- **FR-015**: `docs/ARQUITECTURA.md` y `docs/CLASES.md` describen la estructura final.

## Success Criteria *(mandatory)*

- **SC-001**: suite y build verdes al cerrar cada fase.
- **SC-002**: cero violaciones en la prueba de arquitectura.
- **SC-003**: cero "chofer" fuera de FR-012.
- **SC-004**: ningún archivo > 400 líneas sin excepción (hoy 14).
- **SC-005**: en copia de la base, 100 % de filas y de totales de pago conservados.
- **SC-006**: cero eventos de cola perdidos o duplicados en el renombrado.
- **SC-007**: una sola definición por concepto de FR-004.

## Assumptions

- Migración del renombrado en ventana nocturna (después del cierre de 00:30) con despliegue
  inmediato; ensayo previo en copia de la base con credenciales para `test:base`.
- `pruebas/` y `mcp/` se actualizan con cada movimiento de módulo.
- La migración toma el **siguiente número libre** (la spec 007 puede usar uno antes).
