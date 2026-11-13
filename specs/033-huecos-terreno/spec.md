# 033 — Huecos de terreno

Casos que la app del conductor no cubría, sacados del código y probados en el V2430 (2026-11-12,
APK de prueba, sin gasto). Maqueta con cada caso, lo observado y cómo resolverlo:
claude.ai/artifact/Eq2W1BS56jYPi5g76ym7a6. Cada caso se nombra por su id de la maqueta.

## Alcance (sin decisión pendiente del dueño, solo web, sin cambiar el formato de datos)
- **G1 · Guía y ⚠ (pasos 1–2):** ubicando-trabado, sin-ia, nuevo-ia-sin-senal, crear-0, crear-irrev,
  cerrar-guia (confirmar), barrido-descartar, otra-guia-ruta, ia-desaparece (botón), saltar-al-siguiente,
  form-pierde (cambios sin guardar), mapa-pedidos, pin-mapa, filas-muertas, llamar-resolver (botón
  Llamar), medianoche (versión mínima: no cambiar de día con pedidos sin ningún resultado).
- **G2 · Ruta y carga (pasos 3–4):** buscando-trabado, nuevo-armar-fondo, descartar-propuesta,
  nuevo-propuesta-lista-chica, quitar-foto, clasico-silencio, salir-repartir, vivo-limites (web).
- **G3 · Recorrer y cerrar (pasos 5–6):** nuevo-doble-toque, pendiente-deshacer, pendiente-ciclo,
  ahora-deshacer, escanear-parada, misma-dir, cambio-dir-ruta, llega-tarde, por-pagar, no-editables,
  nuevo-pendiente-por-revisar-invisible, otra-hora, cerrar-dia-8s, recibo-eliminado (segundo toque),
  borrar-dia (segundo toque con no entregados), burbuja-permiso (web).
- **G4 · Marco, login y Diagnóstico:** link-vencido, cuenta-reintentar, error-logout, login-senal
  (mensajes y «¿Olvidaste tu contraseña?»), logout-sin-senal (primero la sesión, después el borrado),
  dia-sin-cerrar, apk-aviso (avisa sin obligar; ✕ hasta volver a abrir la app), interruptores,
  diag-apagados. Decisiones del dueño del 2026-11-13.

- **G5 · Decisiones del dueño (2026-11-13):** marca-error (una parada cerrada se cambia a Entregado,
  No entregado o Pendiente por 11,5 h, aunque ya se haya enviado: la cola lleva el borrado),
  escanear-temprano (el escáner aparece con la ruta armada), limpieza al borrar el día (caché del
  service worker con tope de 30 días, últimos 60 `dias`, fotos y propuestas huérfanas).

- **«Cargar la guía», diseño nuevo y versión simple (dueño, 2026-11-13 y 14):** pasos «1 Fotos ·
  2 Revisar · 3 Listo» que se tocan para volver; paso 1 con el recuadro, la cámara y «Scan físico»
  («Otra forma» despliega Galería · Nómina · Pegar texto); paso 2 con los ⚠ de a uno (Teléfono
  opcional y «Llamar») o la lista, sin pestañas; paso 3 en una línea, con los no ubicados que abren
  su pedido. Maqueta y capturas: claude.ai/artifact/S5gXSpzcKG3jzWVVmYvJPi. De paso: una OF con
  letra ya no se pierde (⚠ «OF mal leída», con la letra marcada) y «Corregir con IA» del paso 3
  pregunta solo por esa carga.

## Decidido no hacer (dueño, 2026-11-13)
- medianoche (nunca se sale a ruta de noche; se quitó la versión mínima de G1), danado (lo respalda la
  máquina que ya se usa), propuesta-borra (que se borre, como hoy), propuesta-mover, «Ahora no» (queda
  como está), formato nuevo para guardar la lectura de la guía, el lugar elegido, las propuestas de la
  IA o el Deshacer tras cerrar la app, `APK_VERSION_BLOQUEANTE`, acceso a Infologistic (no hay).

## Pendiente
- Cámara en vivo y lectura real de fotos de la guía: probar en el V2430 (adb sin autorizar el 14-11).
- escaner-traba: medir con etiquetas reales (cambiar el ritmo de lectura pide APK nueva).
- «Ya avisé» para quitar de «Tu día» un registro rechazado o una corrección fuera de plazo (preguntar).
- Texto «Solo el código» del escáner en vivo cuando no se leyó la etiqueta (preguntar).
- Un formulario de pedido abierto queda detrás de «Día terminado» al cerrar la ruta (visto en Chrome).

## Verificación
`npm test`, `npm run lint`, `npm run build`; pruebas enfocadas nuevas en `pruebas/` para la lógica
(deshacer, reubicar, cobro); recorrido en el V2430 con la APK de prueba de lo que cambia en pantalla.
