# ARES Encomiendas — definición del producto

Fuente funcional. Detalle técnico en `docs/ARQUITECTURA.md`; prioridades en
`docs/HOJA-DE-RUTA.md`; privacidad en `docs/PRIVACIDAD.md`.

## 1. Propósito

Suplir al pioneta: ayudar al conductor a ubicar receptores, avisarles, recorrer la mejor
ruta y registrar cada entrega, para entregar más en menos tiempo. No es un sistema contable
ni de gastos: entrega al jefe los datos para calcular el pago.

## 2. Usuarios

- **Conductor** (teléfono): carga pedidos, revisa direcciones, elige ruta, contacta,
  registra resultados, cierra el día.
- **Jefe / operador** (escritorio): revisa resultados, configura reglas de pago,
  bonos y bloques horarios.

## 3. Contexto operativo

1 conductor · 1 mandante (Starken / Mercado Libre) · Arica (casas sin numeración
confiable) · ~60 pedidos/día. Pedidos del día en una guía de despacho (Infologistic);
nombre, teléfono y pago en la etiqueta de cada paquete.

## 4. Flujo del día

1. Cargar la guía (foto) → pedidos con OF y destino.
2. Ubicar direcciones (Plus Code, Mapbox, OSM, "Estoy en la puerta"); el conductor
   confirma o corrige; nada dudoso entra silenciosamente a la ruta.
3. Generar la ruta: 1 propuesta si es claramente mejor, hasta 3 si hay diferencias útiles
   (tiempo, distancia, pedidos, advertencias).
4. Escanear cada etiqueta → posición en la ruta + descripción del paquete; se escribe el
   número con rotulador; se completan destinatario, teléfono y por pagar.
5. Avisar a los receptores (WhatsApp) y recorrer la ruta; al acercarse a un pendiente,
   llamar o avisar.
6. Registrar cada resultado.
7. Cerrar el día: lista de no entregados → borrado de los datos del día → el jefe ve
   entregados y no entregados.

## 5. Estados

Disponibilidad y entrega son dimensiones separadas (un receptor puede confirmar y no
estar).

- **Disponibilidad**: `pendiente_respuesta` · `confirmado` · `horario_indicado` · `manana`.
- **Entrega**: `pendiente` · `entregado` · `no_entregado`, sin motivo (spec 012). Lo no
  entregado se tacha por hoy; si vuelve a salir, se escanea de nuevo (spec 009).

## 6. WhatsApp con el receptor

- El aviso sale al confirmar la ruta: "¿Estarás en tu domicilio?" con 3 botones: "Sí,
  estaré" · "Mañana" · "Otro horario" (plantilla y despliegue: `docs/WHATSAPP.md`).
- Las respuestas ajustan la ruta en curso (spec 010): "Mañana" la deja no entregada y sale
  de la ruta; un bloque la mueve al lugar donde se llega dentro de él. "Otro horario" abre la
  ventana de 24 h y recién ahí se envía la lista de bloques.
- Bloques (configurables por el jefe): 08–10 · 10–12 · 12–14 · 14–16 · 16–18 · 18–20.
- Sin respuesta → sigue en la ruta; al acercarse, la app pide llamar. Mientras Meta no esté activo, el conductor
  avisa desde su propio WhatsApp (spec 004).

## 7. Experiencia

- Conductor: mobile-first, pocos toques; destaca próxima parada, número y descripción del
  paquete, disponibilidad, por pagar, advertencias, llamar/avisar, marcar resultado.
- Jefe: escritorio; totales de entregadas y no entregadas; reglas de pago, bonos y bloques.
- Identidad naranja; ningún estado depende solo del color.

## 8. Acceso

| Dato | Conductor | Jefe / operador |
|---|---|---|
| Nombre, teléfono, dirección, orden de ruta | solo los suyos, en su teléfono, durante el día | no existen en el servidor |
| Conteos de entregadas y no entregadas | los suyos | de todos |
| Reglas de pago y bloques | los lee | los configura |

Panel solo para `admin`/`operador`; app solo para el rol `chofer` (pasa a `conductor` en
spec 002); RLS repite la regla.

## 9. Fuera de alcance

Historial de viajes · GPS permanente · gastos · contabilidad o liquidación automática ·
gestión de clientes · operaciones distintas del reparto. Facturación por períodos e
ingresos reales: existen, prioridad mínima.

## 10. Éxito

Más entregas por conductor · menos tiempo de preparación y recorrido · menos direcciones
erróneas · menos escritura · más receptores contactados antes de llegar · conteo confiable
para el jefe.
