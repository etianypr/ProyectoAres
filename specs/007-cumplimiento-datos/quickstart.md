# Quickstart: Cumplimiento de datos (007)

**Línea base (2026-10-24)**: 514 pruebas, lint y build en verde, con la 002 Fase 1–2 + US1 hecha.
**Resultado (2026-10-24, MVP)**: 529 pruebas (`privacidad.test.mjs`, `idb-version.test.mjs`). En
la APK (vivo V2430): la base sube a v4; un día anterior de prueba con 1 entregado, 1 no entregado
y 1 sin visitar muestra "No entregados (2)", el botón atrás no lo salta y al confirmar quedan
`pedidos` y `rutas` vacíos y `dias` con 3 · 1 · 2; el aviso de cerrar sesión aparece y se
cancela. Sin eventos de prueba en la base real: el día se cargó directo en el teléfono.

## Automático

```bash
npm test     # privacidad.test.mjs + arquitectura.test.mjs (regla A10)
npm run lint && npm run build
```

## En el teléfono

1. Cargar 5 pedidos, rutear, entregar 3, marcar 2 como no entregados.
2. Terminar el día → aparece "No entregados" con las 2 OF → confirmar.
3. Revisar días anteriores → solo conteos (3 entregados, 2 no entregados).
4. Herramientas de desarrollo → IndexedDB: `pedidos`, `rutas`, `fotos` vacíos para esa fecha; `dias` con el resumen; `cola` con lo pendiente.
5. Cargar pedidos, no cerrar, adelantar la fecha del teléfono un día y abrir → lista del día anterior → confirmar → día nuevo vacío.
6. Modo avión durante el paso 2 → el borrado ocurre; los eventos salen al volver la señal.
7. Panel → desactivar al conductor → abrir la app con conexión → vuelve a `/login` y los datos de destinatarios ya no están.

## Panel

1. Configuración → Privacidad: lista de proveedores con estado y modo "piloto".
2. En piloto, el WhatsApp automático y la lectura por IA funcionan con proveedores pendientes.
3. Cambiar a "oficial" → esas funciones se apagan con explicación; registrar autorización (fecha + documento) → vuelven.
