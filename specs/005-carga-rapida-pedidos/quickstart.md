# Quickstart: validar carga desde guía y escaneo

**Línea base (2026-10-24)**: 542 pruebas, lint y build en verde (002 US1, 003 y 007 hechas). **Resultado sin IA**: 564 pruebas; en la APK, guía pegada → 6 líneas con avisos (repetida, mal leída, faltan 2) → 6 pedidos, 3 ubicados; escáner de Google abre sin señal; OF escrita → "PARADA 2 de 6"; texto de etiqueta pegado → destinatario, +569, POR PAGAR $12.990; tres toques → "Bolsa gris grande". Con datos inventados y la ruta armada sin red.
**Resultado con IA (2026-10-24, `claude-opus-5`)**: 570 pruebas. En la APK, con imágenes inventadas pasadas al campo de foto: guía de 4 líneas → 4 líneas limpias y folio en ~6 s; etiqueta POR PAGAR → destinatario, +569, $12.990 en ~6 s (meta SC-002: 3 s; probar `LECTURA_MODELO=claude-sonnet-5`). Sin ruta armada, para no sincronizar nada con la base real.

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
