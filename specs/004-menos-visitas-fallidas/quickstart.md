# Quickstart: Menos visitas fallidas (confirmar la dirección)

## Automático

```powershell
npm test; npm run lint; npm run build   # incluye pruebas/confirmar-direccion.test.mjs
```

## Con Meta (sin chip: número de prueba)

Antes: migración 0008 en Supabase, el Flow y la plantilla de `docs/WHATSAPP.md`, y en el preview
de Vercel `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_EN_PAUSA=no`. El receptor de prueba es un teléfono registrado
en la app de Meta (hasta 5). Fuera del modo prueba: el modo prueba no manda WhatsApp.

1. Un pedido con ese teléfono, nombre y una dirección inventada; armar la ruta. → En ≤ 30 s llega
   «Hola …, ¿tu dirección es …?» con el botón «Confirmar dirección».
2. En el teléfono receptor: «Sí, es correcta» + «reja verde» → Enviar. → En ≤ 30 s, en Recorrer,
   la parada dice «Dirección confirmada por el receptor» y «reja verde».
3. Otro pedido: «No, es otra» + otra dirección. → Aviso «Un receptor dio otra dirección»; el pedido
   con ⚠ «El receptor dice que es otra dirección» y sus dos botones.
4. «Usar la del receptor» → la parada se mueve; «Dejar la de la guía» → sin ⚠.
5. Un pedido de la guía sin escanear (sin teléfono) → no sale nada hasta leer su etiqueta.
6. Supabase: tras el paso 2, la fila de ese pedido ya no está (`encomienda_whatsapp_correlaciones`).
