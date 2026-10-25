# Quickstart: validar la APK (015)

**Requisitos**: Android 10+ con "instalar apps desconocidas" permitido para el navegador o el
gestor de archivos; acceso al Release de GitHub; un usuario conductor.

1. **Build**: GitHub → Actions → "APK" → Run workflow. Termina con `ares-<versión>.apk` en el
   Release (R6).
2. **Instalar** (SC-005): pasar el archivo al teléfono → instalar → abrir "ARES" → iniciar sesión.
   Medir el tiempo total (< 5 min).
3. **Repartir como hoy** (US1): cargar 3 pedidos, generar la ruta, marcar uno entregado.
4. **Sin señal** (FR-003): cerrar la app, modo avión, abrir: se ve la ruta del día y se puede marcar.
   Con el primer arranque sin señal se ve `sin-senal.html`.
5. **Llamadas** (US2, SC-001/002): 3 números de prueba (contesta >5 s, no contesta, rechaza). Cada
   uno con un toque; al volver: "contestó" / "no contestó" / "no contestó". Corregir uno con un toque.
6. **Sin permiso** (FR-012): quitar los permisos de teléfono → "Llamar" abre el marcador y pregunta
   "¿Contestó?".
7. **Siguiente parada** (FR-008): "Pedido finalizado" ofrece "Llamar a …" y no llama solo.
8. **Pantalla** (SC-004): ruta en curso, teléfono quieto 15 min → la pantalla sigue encendida;
   cerrar el día → se apaga sola.
9. **Escáner** (SC-003): Menú → Diagnóstico → "Probar escáner": 20 etiquetas de Starken sin
   señal, cada una < 1 s (la primera vez baja el módulo de Google: hace falta señal).
10. **Versión mínima** (US5): poner `APK_VERSION_MINIMA` mayor a la instalada en Vercel → aparece
    el aviso con el enlace; volver a bajarla → desaparece.
11. **Privacidad** (SC-006): `npm test` (`nativo-llamada.test.mjs`) y revisar en la red del
    navegador remoto (chrome://inspect) que ninguna petición lleva números ni duraciones.

## Clave de firma (una vez)

Sin clave, Actions entrega una APK de depuración (sirve para probar). Para la del conductor:

```powershell
keytool -genkeypair -v -keystore ares.keystore -alias ares -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ares.keystore")) | Set-Clipboard
```

GitHub → Settings → Secrets and variables → Actions: `ANDROID_KEYSTORE_BASE64` (lo copiado),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`ares`) y `ANDROID_KEY_PASSWORD`. Guardar
`ares.keystore` y sus claves fuera del repositorio, con respaldo: sin ellos, una APK nueva no se
instala encima de la anterior. La primera APK firmada no se instala sobre una de depuración:
desinstalar antes (se pierde lo guardado en el teléfono; hacerlo con el día cerrado).
