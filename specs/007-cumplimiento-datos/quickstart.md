# Quickstart: Cumplimiento de datos (007)

## Automático

```bash
npm test     # privacidad.test.mjs + arquitectura.test.mjs (regla A10)
npm run lint && npm run build
```

## En el teléfono

1. Cargar 5 pedidos, rutear, entregar 3, marcar 2 como no entregados.
2. Terminar el día → aparece "No entregados" con las 2 OF → confirmar.
3. Revisar días anteriores → solo conteos (3 entregados, 2 no entregados).
4. Herramientas de desarrollo → IndexedDB: `pedidos`, `rutas`, `whatsapp`, `fotos` vacíos para esa fecha; `dias` con el resumen; `cola` con lo pendiente.
5. Cargar pedidos, no cerrar, adelantar la fecha del teléfono un día y abrir → lista del día anterior → confirmar → día nuevo vacío.
6. Modo avión durante el paso 2 → el borrado ocurre; los eventos salen al volver la señal.
7. Panel → desactivar al conductor → abrir la app con conexión → vuelve a `/login` y los datos de destinatarios ya no están.

## Panel

1. Configuración → Privacidad: lista de proveedores con estado y modo "piloto".
2. En piloto, el WhatsApp automático y la lectura por IA funcionan con proveedores pendientes.
3. Cambiar a "oficial" → esas funciones se apagan con explicación; registrar autorización (fecha + documento) → vuelven.
