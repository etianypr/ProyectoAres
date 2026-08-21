# Data Model: Asistencia de ruta y entrega

## Principios

- El detalle del destinatario y el orden de ruta viven en IndexedDB del teléfono.
- Supabase conserva hechos operativos agregables, no el pedido personal completo.
- Disponibilidad y resultado de entrega son dimensiones diferentes.
- Las operaciones de escritura local deben conservar la serialización e idempotencia actuales.

## Entidades locales

### PedidoLocal

Extiende el registro existente con los campos de coordinación necesarios:

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUIDv7 | Identificador estable local |
| `nombre` | texto | Obligatorio para el mensaje y la vista |
| `telefono` | texto | Normalizado a formato chileno `+569...` |
| `direccion` | texto | Obligatoria; puede no tener coordenadas |
| `lat`, `lng` | número nullable | Se fijan al confirmar una ubicación |
| `notas` | texto nullable | No participa en la optimización |
| `estado` | `pendiente \| entregado` | Compatibilidad con el arrastre actual |
| `disponibilidad` | enum | Pendiente, confirmado, horario, rechazado, disponibilidad sin respuesta |
| `bloqueHorarioId` | texto nullable | Solo cuando el receptor selecciona un bloque |
| `whatsapp` | estado | Pendiente, enviado, respondido, fallido |
| `cargadoEn` | ISO | Orden de carga y auditoría local |

### BloqueHorario

Configuración disponible para las respuestas del receptor. Contiene identificador,
texto visible, hora de inicio, hora de fin, activo y orden. Los valores iniciales
son de 08:00 a 20:00 en seis bloques de dos horas.

### RespuestaDisponibilidad

Evento local asociado a un pedido: tipo de respuesta, bloque elegido si existe,
hora de recepción, identificador de mensaje y estado de procesamiento. Una
respuesta posterior reemplaza la disponibilidad vigente sin borrar el historial
mínimo necesario para evitar duplicados.

### ParadaLocal

Extiende la parada existente con el resultado de entrega. `llamada` y `entrega`
no deben mezclarse:

- `llamada`: pendiente, contesto, no_contesto.
- `entrega`: pendiente, entregado, persona_no_encontrada, entrega_sin_respuesta, rechazo.
- `reintentable`: derivado: falso para rechazo, verdadero para no encontrado y sin respuesta.
- `horaLlamada`, `horaEntrega`: ISO nullable.

Las paradas cerradas no se reordenan al regenerar la ruta.

### RutaLocal

Conserva la estructura existente y agrega metadatos de planificación:

- fecha, paradas, geometría, distancia y duración;
- propuestas comparadas, entre una y tres;
- versión de disponibilidad usada para calcular;
- generadaEn y cerradaEn;
- advertencias de pedidos sin ubicar o sin trazado.

Una regeneración conserva paradas cerradas y recalcula solo las pendientes.

## Entidades de coordinación server-side

### CorrelacionWhatsApp

Registro mínimo y temporal para que el webhook pueda asociar una respuesta a un
pedido local sin conocer la ruta completa:

- `correlation_id` único;
- `phone_hash` o identificador equivalente no reversible cuando sea suficiente;
- identificador externo del mensaje;
- estado del mensaje;
- bloque/acción esperada;
- fecha de expiración: inmediatamente después del cierre de jornada o 72 horas después de su creación como máximo;
- resultado procesado e idempotency key.

La entidad no guarda nombre, dirección, teléfono, cuerpo de conversación ni orden
de paradas. Un proceso de limpieza debe eliminarla al vencer la fecha de expiración.

### EventoActividad

Se mantiene `encomienda_actividad` con `entrega`, `omision` y `llamada`. La
traducción propuesta es:

| Resultado local | Evento existente | Cuenta como entrega |
|---|---|---|
| entregado | `entrega` | Sí |
| persona_no_encontrada | `omision` | No |
| persona_no_encontrada, entrega_sin_respuesta, rechazo | `omision` | No |
| rechazo | `omision` | No |

El detalle del motivo queda en el resumen local y, si el jefe necesita distinguirlo
server-side, debe enviarse como atributo no personal en una ampliación compatible
del evento.

### Jornada y Pago

Se reutilizan `encomienda_jornadas`, `encomienda_pagos` y las reglas existentes.
El cierre ocurre después de enviar eventos pendientes, igual que hoy. La cantidad
entregada se calcula desde actividad, no desde un contador enviado por el teléfono.

## Transiciones principales

```text
Pedido:
pendiente -> entregado

Disponibilidad:
pendiente_respuesta -> confirmado
pendiente_respuesta -> horario_indicado
pendiente_respuesta -> rechazado (terminal para reintento automático)
pendiente_respuesta -> disponibilidad_sin_respuesta (al iniciar contacto en ruta)

Entrega:
pendiente -> entregada
pendiente -> persona_no_encontrada -> pendiente de otra jornada
pendiente -> entrega_sin_respuesta -> pendiente de otra jornada
pendiente -> rechazo -> terminal
```

Las transiciones deben ser idempotentes y serializadas en el mismo módulo que hoy
protege `marcarEntrega` y `fijarCoordenadas`.
