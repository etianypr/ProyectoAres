# Spec 017 · Listo para terreno

**Creada**: 2026-10-25 · **Estado**: en curso · **Pedido del dueño**: "para salir a terreno
esta aplicación debe estar sólida en todo aspecto: navegación GPS fluida, responsiva y útil,
rutas optimizadas al siguiente nivel, descarte de cualquier error".

Origen: tres auditorías de solo lectura del 2026-10-25 (navegación, ruteo, errores del flujo
del conductor), con escenarios verificados en el código y dos reproducidos con
fake-indexeddb. Moneda: **tiempo del conductor y aparición de errores**.

## US1 (P1) · Ningún error que dañe datos o trabe la ruta

| # | Hoy | Debe |
|---|---|---|
| E1 | La fecha del día viene en el HTML: con la copia guardada (sin señal) o la app abierta desde ayer, los pedidos quedan con fecha de ayer y después el cierre obliga a borrar la ruta en curso | La fecha se calcula en el teléfono y se revisa al volver a la app |
| E2 | "Deshacer" sobre una entrega que ya subió la cuenta dos veces | Deshacer solo mientras no salió; si ya salió, se dice |
| E3 | Parada sin teléfono: solo "Escanear para llamar"; la ruta queda trabada | También "Pedido finalizado" / "No se pudo" y escribir el teléfono |
| E4 | Foto de otra etiqueta (otra OF) se aplica igual; la primera lectura no se corrige | Otra OF no se aplica; una lectura con la OF correcta corrige |
| E5 | Con foto se pierde el aviso de dirección distinta | Se conserva |
| E6 | Una respuesta de WhatsApp puede cambiar la parada que se está atendiendo | La parada en la puerta no se mueve |
| E7 | El día no se cierra si lo último lo cerró WhatsApp o un borrado | Se cierra |
| E8 | Fallos de sincronización invisibles ("se envía solo") | Se muestran; un evento rechazado no traba a los demás |
| E9 | Consultas sin tiempo límite: esperas eternas con mala señal | Tope de 8–15 s en todas |
| E10–E12 | Fotos de la guía en paralelo (memoria), OF repetida queda con la peor lectura, total de la guía se pierde, promesas sin manejar | Una foto a la vez; queda la mejor línea; el total se conserva; sin pantallas trabadas |

## US2 (P1) · Navegación fluida, responsiva y útil

| # | Hoy | Debe |
|---|---|---|
| N1 | En la APK la voz probablemente no suena (WebView sin speechSynthesis) | Voz nativa de Android (TextToSpeech) |
| N2 | El cartel cambia 25 m antes del giro y corta la voz del giro | Cambia pasada la esquina; un aviso de giro no se corta |
| N3 | Frases repetidas en el día quedan mudas | Avisos por tramo y paso |
| N4 | La tarjeta muestra la distancia al giro como si fuera a la parada; sin hora de llegada | Metros y minutos a la parada + hora estimada |
| N5 | El punto salta y el mapa lo persigue | Punto y cámara se mueven juntos |
| N6–N11 | Sin tiempo límite; GPS no se rearma; primera lectura mala manda; rumbo viejo; recálculos en bucle en la puerta; cartel trabado tras un atajo | Resuelto cada uno (ver tasks) |
| N12 | Mejoras: zoom según velocidad, rumbo del tramo actual, menos redibujos, llegada a la parada, cartel más grande, salida de rotonda, llegar por el lado de la vereda | Hechas |

## US3 (P1) · Rutas al siguiente nivel

| # | Hoy | Debe |
|---|---|---|
| R1 | Con más de 25 paradas el orden se calcula en línea recta (9–13 % más largo) | Matriz de calles completa por bloques (distancia y tiempo), en memoria del día |
| R2 | "Respeta horarios" sale 20–120 % más larga y aun así incumple | Un optimizador con horarios, esperas y tope 18:00 |
| R3 | La propuesta guardada no se entera de cambios de horario; tramos que empeoran; una parada sin camino apaga la mejora; hora de salida del reloj | Corregidos |
| R4 | "Dejar como pendiente" va al final; un pedido tardío obliga a rehacer todo | Se insertan donde menos alargan |
| R5 | Todo en el hilo principal (3–5 s congelado) | Más búsqueda en el mismo tiempo; cálculo sin congelar la pantalla |

## Criterios de éxito

- SC-001 Ninguno de los escenarios E1–E12 se reproduce (pruebas automáticas donde se pueda).
- SC-002 En la APK, las indicaciones se oyen y el cartel no cambia antes del giro.
- SC-003 Con 60 paradas, la ruta usa distancias por calle (no línea recta) y la de horarios
  no es más de 15 % más larga que la corta en un día con 20 % de pedidos con horario.
- SC-004 Generar la ruta de 60 paradas no congela la pantalla más de 0,5 s.
