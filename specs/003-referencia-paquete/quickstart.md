# Quickstart: validar OF y referencia (003)

**Resultado (2026-10-24)**: ver tasks.md T016 (pasos 2, 3 y 6 en la APK con datos de prueba).

1. `npm test` (incluye `paquete.test.mjs` y `migracion-v5.test.mjs`).
2. En el teléfono: cargar 3 pedidos con OF (desde la guía, 005); escanear sus etiquetas: la
   descripción y la foto quedan solas (con IA) o con tres toques (sin IA).
3. Generar la ruta: la parada activa muestra `OF 123 456 789` y "Bolsa gris grande · cinta roja"
   antes que la dirección; la miniatura se amplía con un toque (US1).
4. Tocar "Pedido finalizado": la OF sigue a la vista en la confirmación (US1-4).
5. Cargar una OF repetida: aviso, el pedido se guarda igual.
6. Buscar "6789" en "Buscar OF": aparece el pedido con su parada (US3).
7. Marcar el pedido con foto: la foto deja de existir (Herramientas de desarrollo → IndexedDB →
   `fotos`) (FR-009).
8. Medir en terreno: paquete identificado en ≤ 15 s en 20 paradas (SC-001).
