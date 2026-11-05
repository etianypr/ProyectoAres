---
name: recorrer-conductor
description: Recorre la app del conductor de ARES como la usa él en terreno (360 px, modo prueba, GPS simulado, de a una foto) para verificar un cambio que se ve en pantalla. Úsala antes de dar por terminado un cambio en src/app/(conductor)/ o en lo que esa app muestra, y cuando pidan "recorrer", "probar como el conductor", "verificar el flujo" o los escenarios de un quickstart.md.
---

# Recorrer la app del conductor

`AGENTS.md` lo exige: un cambio que se ve en la app no está terminado hasta recorrerlo **con el
gesto real del conductor**, no con un atajo equivalente. Esta skill es el procedimiento.

## 1. Preparar
- `npm run dev` en segundo plano → `http://localhost:3000/conductor`.
- Navegador: carga la skill `claude-in-chrome` y, en una sola búsqueda, sus herramientas:
  `tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `computer`, `read_page`, `find`,
  `resize_window`, `read_console_messages` y `file_upload`.
- Pestaña nueva, ventana a **360 × 800**.
- Si pide iniciar sesión, la inicia el dueño. No escribas ni pidas contraseñas.
- Modo prueba: Menú → **Diagnóstico** (`/conductor/diagnostico`) → «Modo prueba». Solo se
  enciende con la cola vacía. Con él encendido, nada va a la base ni por WhatsApp, y al salir se
  borran los pedidos de prueba. Para la ruta, marca «GPS simulado en la central» y elige la
  velocidad (×10 o ×20).

## 2. Qué recorrer
El flujo completo está en `AGENTS.md` («El flujo del conductor»). Recorre el paso que tocó el
cambio, el anterior y el siguiente, y si existe, el `quickstart.md` de la spec.

| Paso | Cómo lo hace el conductor | En el PC |
|---|---|---|
| 1. Cargar la guía | Cámara, **de a una foto**, 3 o 4 partes → «Leer las fotos juntas» → revisar → «Crear pedidos» | Fotos con `file_upload`. Leer con IA usa Anthropic y **gasta**: pregunta antes. Sin gasto: «Pegar el texto de Google Lens» con un texto inventado |
| 2. Resolver los ⚠ | Elige el lugar en el mapa o llama al receptor | Igual |
| 3. Armar la ruta | Un botón; compara propuestas si hay más de una | Usa la matriz de ORS (cupo de 500/día): una vez por recorrido |
| 4. Cargar el auto | Escanea cada etiqueta (escáner de Google en la APK) | Fuera de la APK se **escribe la OF** |
| 5. Recorrer | Burbuja de ARES sobre Google Maps, llamar con un toque, cerrar cada parada | GPS simulado; la burbuja y las llamadas solo existen en la APK |
| 6. Cerrar el día | Lista de no entregados → cerrar | Igual (en modo prueba no se envía) |

Por cada paso anota qué botón se toca, en qué orden y cuántos toques son. Menos toques es el
objetivo del proyecto.

## 3. Qué mirar a 360 px
- Nada se corta, no hay scroll horizontal y los botones se pueden tocar con el pulgar (≥ 44 px).
- Ningún estado depende solo del color. Hay ⚠ donde corresponde.
- Diseño «Plano»: naranja `#c4491a` en botones con texto blanco, Manrope, IBM Plex Mono solo en
  OF, km y horas. Sin degradados ni tarjetas con franja lateral.
- Las pantallas no traen instrucciones. Si cambió el nombre de un botón, también cambió en
  `_componentes/ayuda.tsx`.
- Consola: `read_console_messages` con `pattern: "error|warn"`. No debe haber errores nuevos.

## 4. Lo que el PC no puede probar
Escáner de códigos (ML Kit), llamadas y su registro, la burbuja sobre Google Maps, la pantalla
encendida y abrir sin señal. Si el cambio toca algo de eso, dilo y pásalo a la APK: skill
`apk-local` (build contra el PC) o `specs/015-app-android/quickstart.md`.

## 5. Cerrar
- Sal del modo prueba (borra lo de la prueba de este navegador).
- Informa: qué pasos recorriste, qué viste (con captura si algo falló), cuántos toques, qué quedó
  sin probar y por qué. Si algo no se pudo recorrer, el cambio no está verificado: dilo así.
- No uses fotos ni textos con datos reales de destinatarios. Las guías y etiquetas de prueba van
  anonimizadas, solo en el PC, y nunca al repo.
