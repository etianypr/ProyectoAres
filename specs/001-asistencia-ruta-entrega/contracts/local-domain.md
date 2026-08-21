# Contract: Dominio local de encomiendas

## Entrada de pedido

```text
crearPedido({ nombre, telefono, direccion, notas? })
-> PedidoLocal
```

La operación normaliza el teléfono, conserva el estado existente al editar y deja
`lat/lng` como null hasta que se confirme una ubicación.

## Disponibilidad

```text
registrarDisponibilidad(pedidoId, respuesta)
```

`respuesta` es exactamente una de:

- `{ tipo: "confirmado" }`
- `{ tipo: "horario_indicado", bloqueHorarioId }`
- `{ tipo: "rechazado" }`
- `{ tipo: "disponibilidad_sin_respuesta" }`

La operación es idempotente por identificador externo del mensaje y no reabre un
rechazo automáticamente.

## Ruta

```text
calcularRutaLocal(fecha, inicio) -> PropuestaRuta
confirmarRutaLocal(propuesta) -> RutaLocal
```

`PropuestaRuta` debe devolver de una a tres alternativas útiles, pedidos sin
ubicar y advertencias de trazado. `confirmarRutaLocal` conserva las paradas ya
cerradas y solo reemplaza las pendientes.

## Resultado de entrega

```text
marcarEntrega(pedidoId, resultado)
```

`resultado` es `entregada`, `persona_no_encontrada`, `entrega_sin_respuesta` o `rechazo`.
La escritura local y la cola de actividad deben ser atómicas; el evento enviado al
servidor conserva el id para que un reintento no duplique el conteo.
