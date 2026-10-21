# Quickstart: Menos visitas fallidas

## Automático
```bash
npm test && npm run lint && npm run build   # incluye pruebas/avisos.test.mjs
```

## Teléfono (PWA por ngrok, ver README)
1. Pedido con teléfono → "Avisar" → abre WhatsApp con número y mensaje (nombre + franja) → volver → "avisado HH:MM".
2. "Avisar a todos" con 3 pendientes → recorre los 3 sin buscarlos.
3. Registrar "confirmó" a mano → la disponibilidad cambia como en la 001.
4. Ruta en curso (simulación o terreno) → a ≤10 min aparece "Avisar que voy llegando (~N min)" una sola vez.
5. Receptor sin confirmar al acercarse → primero "Llamar", luego el aviso.
6. Marcar dos pedidos "No entregado" → "No entregados" muestra ambos (OF o número); salieron de la ruta.
7. Sin conexión: 1, 4 y 6 funcionan (WhatsApp necesita su propia conexión para enviar).

## Panel
8. Configuración → plantillas: guardar sin `{negocio}` o sin "Starken" → error; con ambos → ok, el teléfono usa el texto nuevo.
9. Estado del automático: sin variables de Meta → "inactivo" con la lista de faltantes.

## Privacidad
10. Pestaña Red durante 1–6: ninguna petición lleva nombre, teléfono ni mensaje.
