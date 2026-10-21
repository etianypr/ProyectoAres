# Quickstart: validar carga desde guía y escaneo

## Automático

```bash
npm test     # lectura-*.test.mjs + arquitectura + suite
npm run lint && npm run build
```

## Con fixtures (sin IA)

1. Pegar el texto de `pruebas/fixtures/lectura/guia-*.txt` en "Cargar guía" → líneas, avisos de repetidos y total.
2. Confirmar → pedidos → generar ruta.
3. Escanear fotos de etiquetas de prueba → "PARADA n de N".

## Con IA (`.env.local` con `ANTHROPIC_API_KEY`)

1. Foto de una guía real → ≤ 2 min hasta la ruta (SC-001); diferencias de total avisadas.
2. ≥ 50 etiquetas → 0 enlaces erróneos (SC-003); ≥ 90 % sin corrección (SC-005).
3. Etiquetas POR PAGAR → monto correcto o "por revisar" (SC-006).
4. Modo avión → escanear → parada aparece; datos pendientes se completan al volver la señal.

## Privacidad

- Pestaña Red: solo `/api/lectura` recibe imágenes; ningún otro dominio nuevo.
- Logs del servidor: sin cuerpos de solicitud.
- Cerrar el día → `lecturasPendientes` y campos 005 borrados (spec 007).
