# Quickstart · Spec 020

Cómo probar que la burbuja funciona de punta a punta. Puntos y pedidos **inventados**, nunca de
una guía real.

## Requisitos

- vivo V2430 (Android 15) con Google Maps, la APK 1.5.0 instalada (build en `README.md`) y la web
  publicada (o `adb reverse tcp:3000 tcp:3000` contra `npm run dev`).
- En ARES: modo prueba encendido (diagnóstico) y un día con 3 pedidos inventados con punto
  (uno con teléfono propio de prueba y sin respuesta, uno confirmado, uno sin teléfono).

## Antes: verde en el PC

```
npm test && npm run lint && npm run build
```

Incluye `burbuja.test.mjs`, `hacia-parada.test.mjs` y el resto sin APIs reales.

## En el vivo

| # | Paso | Se espera | Cubre |
|---|---|---|---|
| 1 | Tocar los km de la parada 1 sin el permiso dado | Abre "Mostrar sobre otras apps" de ARES; al volver sin darlo, Google Maps navega y no hay burbuja. Otro toque ese día no vuelve a pedirlo | FR-011, SC-009 |
| 2 | Dar el permiso; tocar los km | Google Maps navega en auto hacia la parada 1, sin tocar «Iniciar», y encima está la burbuja achicada («Parada 1» sobre la velocidad); tocarla muestra OF, a quién, dónde y los botones. En la barra, "ARES · Parada 1" | FR-001, FR-002 |
| 3 | Achicar la burbuja, tocar el círculo | Círculo «Parada 1» justo encima de la velocidad de Google Maps, sin tapar sus botones; tocarlo la abre. No hay cómo quitarla | FR-010, SC-007 |
| 4 | Salir de la navegación en Google Maps; abrir otra app | La burbuja sigue; "Navegar" vuelve a Google Maps navegando a la parada 1 en 1 toque | FR-003, FR-004, SC-005 |
| 5 | 📞 en la burbuja (parada con teléfono de prueba) | La llamada sale directo y en 1–2 s Google Maps vuelve adelante, navegando, con la llamada de fondo. No aparece "Contestó / No contestó" | FR-007 |
| 6 | "Pedido entregado" en la burbuja | Aviso con "Deshacer" con la tarjeta abierta; a los 8 s se achica en «Parada 2», y Google Maps navega hacia ella sola, en < 1 s | FR-008, SC-002 |
| 7 | "Deshacer" | Vuelve la parada 1 y Google Maps vuelve a ella | FR-005 |
| 8 | En la parada sin teléfono, ⌗ (escanear) en la burbuja; cancelar; volver a Google Maps con los km | ARES viene adelante con el escáner y la burbuja no aparece encima; al volver a Google Maps (aunque la pantalla de escaneo de ARES siga abierta) la burbuja vuelve. Igual con «Teléfono a mano» y el formulario abierto | FR-009 |
| 9 | "Volver a ARES" | ARES adelante, sin cartel ni voz; se ven la línea del día, las paradas y los km a la activa | FR-012, US3 |
| 10 | Cerrar las 3 paradas | Al cerrar la última, la burbuja y el aviso de la barra se van y ARES queda adelante | FR-008 |
| 11 | Cerrar ARES desde recientes con la burbuja en curso | La burbuja y el aviso se van; al abrir ARES el día sigue igual y los km la reabren | borde, SC-009 |
| 12 | Comparar lo guardado (pantalla del día / panel) contra hacer los pasos 5–7 en ARES | Igual | SC-003 |
| 13 | Dejar Google Maps adelante 2 minutos o más con la burbuja en curso; tocar «Pedido entregado» | Se guarda al instante (no espera a volver a ARES): la página no se congela atrás (`WebViewAres`, research R3) | FR-006, SC-003 |

## En terreno (día real)

- SC-004: contar las paradas cerradas sin volver a ARES (meta: 8 de cada 10).
- SC-001 y SC-008: la consola de ORS no muestra consultas de dirección durante el día, salvo las
  de armar y rehacer la ruta; la de Google, ninguna del kit.
- Si el vivo cerró ARES atrás: permitir "consumo alto en segundo plano" a ARES y anotarlo en la
  Ayuda.
