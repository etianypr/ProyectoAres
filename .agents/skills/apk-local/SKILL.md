---
name: apk-local
description: Compila e instala la APK de ARES (Capacitor 8, Android) apuntando al servidor del PC, para probar en el teléfono por USB algo que solo existe en la APK — escáner, llamadas, burbuja, pantalla encendida, plugins de android/. Úsala cuando haya que compilar la APK, instalarla con adb, depurarla con chrome://inspect, o cuando un cambio toque android/ o src/lib/nativo/.
---

# APK local contra el PC

La APK carga la web publicada (`server.url` en `capacitor.config.ts`), así que **un cambio web no
necesita una APK nueva**: llega con cada deploy. Solo hace falta compilar si cambia `android/`
(plugins nativos) o para probar en el teléfono contra el PC sin publicar.

Cambiar `android/` se pregunta antes (`AGENTS.md`, «Límites»): obliga a recompilar y reinstalar.
Para publicarlo, se sube `APK_VERSION_MINIMA` en Vercel, y eso lo hace el dueño.

## Requisitos de esta máquina
- **JDK 21**: `%LOCALAPPDATA%\Java\jdk-21.0.12.1+1`. Con el JDK 17 de Program Files,
  `gradlew.bat` falla.
- **adb**: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.
- El teléfono por USB, con la depuración USB activada.

## Compilar e instalar (PowerShell, desde la raíz)
```powershell
npm run build; npx next start -p 3000        # en otra terminal, y dejarlo corriendo
$env:CAP_SERVER_URL="http://localhost:3000/conductor"; npx cap sync android
$env:JAVA_HOME="$env:LOCALAPPDATA\Java\jdk-21.0.12.1+1"; cd android
& "$env:JAVA_HOME\bin\java.exe" "-Dorg.gradle.appname=gradlew" -jar gradle\wrapper\gradle-wrapper.jar assembleDebug
$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:3000 tcp:3000; & $adb install -r app\build\outputs\apk\debug\app-debug.apk
```
- La APK de depuración se llama `cl.dashund.ares.debug` (versión «…-prueba») y se instala **al lado**
  de la firmada: no hay que desinstalar nada (dueño, 2026-11-07). Entra **siempre en modo prueba** y
  no deja salir (salir borra): el 2026-11-08 se usó con el modo apagado y los conteos del día de prueba
  subieron a `encomienda_jornadas` (`modo-prueba.ts`, `asegurarModoPrueba`).
- **Sin `CAP_SERVER_URL`, la APK apunta a producción.** Después de probar, vuelve a correr
  `npx cap sync android` sin la variable, para no dejar `android/` apuntando al PC.
- `adb reverse` se pierde al desconectar el cable: repítelo.
- El ícono nuevo solo aparece al recompilar.

## Firma y versiones
- Una APK de depuración no se instala sobre una firmada (ni al revés): hay que desinstalar, y se
  pierde lo guardado en el teléfono. Hazlo con el día cerrado y la cola enviada.
- La clave (`*.keystore`) nunca va al repo. Los pasos de firma y los secretos de GitHub Actions
  están en `specs/015-app-android/quickstart.md`.
- La APK firmada sale por GitHub: tag `apk-v1.2.3`, o Actions → APK → Run workflow.

## Depurar
- `chrome://inspect` con el teléfono por USB: consola y red de la WebView.
- En la app: Menú → Diagnóstico (versión, permisos, «Probar escáner», modo prueba).
- Si aparece la pantalla en blanco, «plugin is not implemented» o `ERR_CLEARTEXT_NOT_PERMITTED`,
  usa la skill `debugging-capacitor`.
- Las skills de Capacitor marcan como error un `server.url` en producción y el service worker. En
  ARES las dos cosas son a propósito: la app es Next.js con servidor, no se puede empaquetar
  (`capacitor.config.ts`, research R1 de la spec 015). No los quites.

## Qué probar en el teléfono
Los escenarios de `specs/015-app-android/quickstart.md`: llamadas (contesta, no contesta,
rechaza), sin permiso, sin señal, pantalla encendida, escáner (< 1 s por etiqueta) y versión
mínima.
