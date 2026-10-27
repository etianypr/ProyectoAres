# Plan · Spec 018

```mermaid
sequenceDiagram
  participant T as Teléfono (cliente.ts)
  participant S as /api/direccion-ia (servidor.ts)
  participant C as Claude (Sonnet 5)
  participant B as Mapbox · OSM · Google · calles de Arica
  T->>S: conversación (dirección escrita)
  S->>C: system + herramientas + conversación
  C-->>S: tool_use buscar_direccion / calles_parecidas
  S-->>T: lo que contestó la IA
  T->>B: ejecuta la herramienta (desde el teléfono)
  B-->>T: candidatos c1…cN (con coordenadas)
  T->>S: conversación + resultados (sin coordenadas exactas, solo ids y datos)
  S->>C: …
  C-->>S: tool_use proponer {candidato: "c3", confianza, motivo}
  S-->>T: propuesta
  T->>T: interpretar(): la coordenada es la del candidato c3; confianza ≤ la del candidato
  T->>T: el conductor ve lo que decía, la propuesta y el mapa → Confirmar / Descartar
  T->>T: Confirmar → aplicarCorreccion: cambiarDireccion(id, nueva, punto, nota)
```

## Estructuras

```text
CandidatoIA   { id: "c1"…; direccion; detalle; lat; lng; confianza; coincideNumero; fuente }
MensajeIA     user: texto | tool_result[] · assistant: text | tool_use[]   (≤ 13 mensajes, ≤ 60.000 caracteres)
ResultadoIA   propuesta { candidato; direccion; confianza: alta|media|baja; motivo }
              | sin_arreglo { motivo } | error { mensaje }
PropuestaCorreccion { pedidoId; nombre; original; direccion; lat; lng; enLaCuadra; segura; motivo }
esSegura      confianza alta, o media con candidato "aproximada" y número que no contradice
              (marca la propuesta; "Confirmar las N que coinciden" las confirma juntas)
```

## Decisiones

- Las herramientas corren en el **teléfono**: los buscadores son los mismos de siempre (Mapbox con
  el token del navegador, Google por `/api/geocodificar`) y el servidor solo habla con Claude.
- Sonnet 5 (`DIRECCION_MODELO` para cambiarlo). Medido el 2026-10-27 con direcciones reales y
  números inventados: 2 idas y vueltas, ~5 s por dirección; corrigió abreviaturas, una falta de
  ortografía y una población. ~US$0,02 por dirección.
- Máximo 15 por tanda y 6 idas y vueltas por dirección.
