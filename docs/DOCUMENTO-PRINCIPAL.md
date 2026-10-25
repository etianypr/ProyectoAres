# ARES Encomiendas — definición del producto

Fuente funcional. Detalle técnico en `docs/ARQUITECTURA.md`; prioridades en
`docs/HOJA-DE-RUTA.md`; privacidad en `docs/PRIVACIDAD.md`.

## 1. Propósito

Suplir al pioneta: ayudar al conductor a ubicar receptores de la forma más óptima, avisarles para coordinar la entrega, generar la mejor ruta, evitar errores de direcciones y registrar cada entrega, para entregar más en menos tiempo. No es un sistema contable ni de gastos: entrega al jefe los datos para calcular el pago.

## 2. Usuarios

- **Conductor** (teléfono Android, app instalada: spec 015): carga pedidos, revisa direcciones, elige ruta, contacta,
  registra resultados, cierra el día.
- **Jefe / operador** (escritorio): revisa resultados, configura reglas de pago,
  bonos y bloques horarios.

## 3. Contexto operativo

1 conductor · 1 mandante (Starken / Mercado Libre) · Arica (casas sin numeración
confiable y una misma dirección que existe en más de un lugar, como "Los Aromos 120" en Arica
y en Azapa) · ~60 pedidos/día. Pedidos del día en una guía de despacho (Infologistic); nombre, teléfono y pago en la etiqueta de cada paquete.

## 4. Flujo del día

1. Cargar la guía (foto) → pedidos con OF y destino.
2. Ubicar direcciones (Plus Code, Mapbox, OSM, "Estoy en la puerta"); el conductor
   confirma o corrige; nada dudoso entra silenciosamente a la ruta.
3. Generar la ruta: 1 propuesta si es claramente mejor, hasta 3 si hay diferencias útiles
   (tiempo, distancia, pedidos, advertencias).
4. Escanear cada etiqueta → parada de la ruta + descripción del paquete; se completan OF,
   destinatario, teléfono y por pagar. No se escribe nada en el paquete (spec 003).
5. Avisar a los receptores (WhatsApp, en pausa hasta tener el chip: spec 013) y recorrer la
   ruta; al acercarse a un pendiente, llamar con un toque: la app registra sola si contestó
   (spec 015).
6. Registrar cada resultado. Al entregar, la OF (número de orden de Starken) tiene que estar a
   la vista en la parada (spec 003).
7. Cerrar el día: lista de no entregados → borrado de los datos del día → el jefe ve
   entregados y no entregados.

## 5. Estados

Disponibilidad y entrega son dimensiones separadas (un receptor puede confirmar y no
estar).

- **Disponibilidad**: `pendiente_respuesta` · `confirmado` · `horario_indicado` · `manana`.
- **Entrega**: `pendiente` · `entregado` · `no_entregado`, sin motivo (spec 012). Lo no
  entregado se tacha por hoy; si vuelve a salir, se escanea de nuevo (spec 009). Dejarlo con un
  vecino o el conserje cuenta como entregado.

## 6. WhatsApp con el receptor

- El aviso sale al confirmar la ruta: "¿Estarás en tu domicilio?" con 3 botones: "Sí,
  estaré" · "Mañana" · "Otro horario" (plantilla y despliegue: `docs/WHATSAPP.md`).
- Las respuestas ajustan la ruta en curso (spec 010): "Mañana" la deja no entregada y sale
  de la ruta; un bloque la mueve al lugar donde se llega dentro de él. "Otro horario" mueve el pedido al lugar de la ruta donde se llega dentro del bloque
  elegido. Cuando le toca su turno, la app vuelve a estimar si conviene ir o descartarlo (no
  entregado) y lo sugiere; el conductor confirma (spec 014).
- Bloques (configurables por el jefe): 08–10 · 10–12 · 12–14 · 14–16 · 16–18.
- Sin respuesta → sigue en la ruta; al acercarse, la app pide llamar. Mientras Meta no esté activo, el conductor
  llama (spec 013); avisar desde su propio WhatsApp (spec 004) va en la fase de WhatsApp.

## 7. Experiencia

- Conductor: mobile-first, pocos toques; destaca próxima parada, OF y descripción del
  paquete, disponibilidad, por pagar, advertencias, llamar/avisar, marcar resultado.
- Jefe: escritorio; totales de entregadas y no entregadas; reglas de pago, bonos y bloques.
- Identidad naranja; ningún estado depende solo del color.

## 8. Acceso

| Dato | Conductor | Jefe / operador |
|---|---|---|
| Nombre, teléfono, dirección, orden de ruta | solo los suyos, en su teléfono, durante el día | no existen en el servidor |
| Conteos de entregadas y no entregadas | los suyos | de todos |
| Reglas de pago y bloques | los lee | los configura |

Panel solo para `admin`/`operador`; app solo para el rol `conductor`; RLS repite la
regla.

## 9. Fuera de alcance

Historial de viajes · GPS permanente · gastos · contabilidad o liquidación automática ·
gestión de clientes · operaciones distintas del reparto. Facturación por períodos e
ingresos reales: existen, prioridad mínima.

## 10. Éxito

Más entregas por conductor · menos tiempo de preparación y recorrido · menos direcciones
erróneas · menos escritura · más receptores contactados antes de llegar (spec 006) · conteo confiable
para el jefe.
