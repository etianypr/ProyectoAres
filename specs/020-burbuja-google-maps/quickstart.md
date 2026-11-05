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
| 2 | Dar el permiso; tocar los km | Google Maps navega hacia la parada 1 y encima está la burbuja abierta (OF, a quién, dónde, botones). En la barra, "ARES · Parada 1" | FR-001, FR-002 |
| 3 | Achicar la burbuja, arrastrarla, tocarla | Círculo con "1" que se mueve; tocar la abre. No hay cómo quitarla | FR-010, SC-007 |
| 4 | Salir de la navegación en Google Maps; abrir otra app | La burbuja sigue; "Navegar" vuelve a Google Maps navegando a la parada 1 en 1 toque | FR-003, FR-004, SC-005 |
| 5 | "Llamar" en la burbuja (parada con teléfono de prueba); contestar y colgar | La llamada sale directo; al colgar (de vuelta en Google Maps) la burbuja ya muestra "Pedido finalizado" sin volver a ARES. Repetir sin contestar: muestra "Contestó / No contestó" con el resultado marcado | FR-007, SC-006 |
| 6 | "Pedido finalizado" en la burbuja | Aviso con "Deshacer"; la burbuja pasa a la parada 2 y Google Maps navega hacia ella sola, en < 1 s | FR-008, SC-002 |
| 7 | "Deshacer" | Vuelve la parada 1 y Google Maps vuelve a ella | FR-005 |
| 8 | En la parada sin teléfono, "Escanear la etiqueta" | ARES viene adelante con el escáner; la burbuja no aparece encima del escáner; al salir de ARES, vuelve | FR-009 |
| 9 | "Volver a ARES" | ARES adelante, sin cartel ni voz; se ven la línea del día, las paradas y los km a la activa | FR-012, US3 |
| 10 | Cerrar las 3 paradas | Al cerrar la última, la burbuja y el aviso de la barra se van y ARES queda adelante | FR-008 |
| 11 | Cerrar ARES desde recientes con la burbuja en curso | La burbuja y el aviso se van; al abrir ARES el día sigue igual y los km la reabren | borde, SC-009 |
| 12 | Comparar lo guardado (pantalla del día / panel) contra hacer los pasos 5–7 en ARES | Igual | SC-003 |

## En terreno (día real)

- SC-004: contar las paradas cerradas sin volver a ARES (meta: 8 de cada 10).
- SC-001 y SC-008: la consola de ORS no muestra consultas de dirección durante el día, salvo las
  de armar y rehacer la ruta; la de Google, ninguna del kit.
- Si el vivo cerró ARES atrás: permitir "consumo alto en segundo plano" a ARES y anotarlo en la
  Ayuda.
