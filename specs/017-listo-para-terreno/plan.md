# Plan · Spec 017

## Ruta del día (R1–R5)

```mermaid
flowchart TD
  P["pedidos pendientes con punto"] --> M["matrizCalles(partida + paradas)<br/>bloques de ≤25 coordenadas a Mapbox Matrix<br/>distancia + duración · en memoria del día"]
  M -->|falla o sin señal| H["respaldo: línea recta × 1,3 (con aviso)"]
  M --> O["optimizarConHorarios(matriz, ventanas)<br/>2-opt · Or-opt · reubicar · sacudidas<br/>costo = metros + 2000·min atraso + 50·min espera + 5000·min pasado 18:00"]
  H --> O
  O --> E["3 estrategias: corta · horarios · confirmados<br/>(elegirUtiles: la más corta que no incumple)"]
  E --> T["trazado de la elegida (Directions, tramos en paralelo)"]
  T --> N["navegación"]
```

## Navegación (N1–N12)

```mermaid
flowchart LR
  GPS["watchPosition<br/>(rearmar al volver · descartar lectura mala)"] --> PEG["pegar al trazado"] --> PASO["paso actual = proyección sobre el trazado completo<br/>(pasa al siguiente después de la esquina)"]
  PASO --> CART["cartel: maniobra, metros al giro<br/>tarjeta: metros y minutos a la parada, hora de llegada"]
  PASO --> VOZ["voz nativa (TextToSpeech)<br/>avisos por tramo|paso|umbral, el de giro no se corta"]
  PEG --> CAM["cámara y punto juntos<br/>zoom según velocidad"]
  PEG --> DESV["desvío: recalcular salvo cerca de la parada o detenido<br/>fetch con tope de 8 s"]
```

## Estructuras

```text
MatrizCalles   { metros: number[][]; completa: boolean; pedidos: number }
               | { metros: null; motivo: "sin_token" | "cupo" | "sin_respuesta" }
               pares en memoria (Map por par de puntos a ~1 m); se pierde al recargar — no se
               guarda: son puntos de destinatarios. Solo distancia: el tiempo sale del reloj de
               planificar.ts (25 km/h + 4 min por parada), el mismo que mide y avisa.
ParadaPlan     { id; punto; ventana: { desde, hasta } | null (minutos del día); servicioMin }
CostoPlan      { metros; minutosAtraso; minutosEspera; minutosPasado18 }
EstadoTramo    { tramoId; paso; metrosAlGiro; metrosRestantes; segundosRestantes; llegada: Date }
Voz            { hablar(texto, prioridad: "giro" | "aviso"); callar() } → lib/nativo/voz.ts
```

## Decisiones

- Matriz por bloques en Mapbox (no grafo propio en el teléfono por ahora): 61 puntos ≈ 25
  consultas y 3.721 elementos por armado; rehacer la ruta con los mismos pedidos no vuelve a
  consultar. El grafo de Arica en el teléfono queda como mejora futura (sin costo, sin señal).
- El optimizador con horarios reemplaza el "insertar de a uno" de `planificar.ts` para la
  estrategia "horarios"; "corta" sigue siendo el optimizador sin ventanas.
- Voz: método `hablar` en el plugin propio `Telefono` (TextToSpeech de Android), con la voz
  del navegador fuera de la APK. Requiere reinstalar la APK (sube `APK_VERSION_MINIMA`).
