# ARES Encomiendas

## Documento principal del producto

**Estado:** definición funcional inicial  
**Fecha:** 2026-08-20

## 1. Propósito

ARES Encomiendas es una aplicación de apoyo al reparto que busca suplir las funciones operativas de un pioneta. Su objetivo es ayudar al conductor a localizar correctamente a los receptores, comunicarse con ellos antes y durante la ruta, reducir el tiempo de reparto y aumentar la cantidad de encomiendas entregadas.

La aplicación se enfocará exclusivamente en el reparto de encomiendas. No se priorizarán historiales de viaje, gastos ni un sistema contable de pagos.

## 2. Usuarios

### Conductor de encomiendas

Usa principalmente la aplicación desde un teléfono para:

- Cargar los datos de los pedidos.
- Revisar y corregir direcciones.
- Generar y elegir una ruta.
- Ver a qué clientes debe contactar.
- Registrar el resultado de cada entrega.
- Cerrar la jornada con el resumen de pedidos entregados y no entregados.

### Jefe de conductores

Usa principalmente el panel de escritorio para:

- Revisar las rutas y sus resultados.
- Saber cuántos pedidos fueron entregados y no entregados.
- Revisar los motivos de no entrega.
- Aplicar las reglas de pago y bonos por entrega.
- Configurar los bloques horarios disponibles para los clientes.

## 3. Flujo principal

1. El conductor ingresa todos los pedidos disponibles.
2. Para cada pedido registra nombre, teléfono y dirección del receptor.
3. La aplicación normaliza el teléfono, incluyendo automáticamente el prefijo chileno `+569` cuando corresponda.
4. La aplicación busca y revisa permanentemente la dirección mediante uno o más servicios de mapas.
5. El conductor confirma o corrige la ubicación de cada pedido.
6. Cuando un pedido queda correctamente ubicado dentro de una ruta, la aplicación informa inmediatamente al receptor por WhatsApp que su pedido está programado para entrega.
7. El receptor responde mediante opciones predefinidas.
8. La aplicación usa las respuestas para preparar la ruta.
9. La aplicación genera una única ruta cuando es claramente la mejor opción. Solo muestra alternativas adicionales cuando existen diferencias útiles, hasta un máximo de tres rutas.
10. El conductor elige la ruta.
11. Durante el recorrido, la aplicación indica los pedidos confirmados y los pedidos pendientes de respuesta.
12. Al aproximarse a un cliente pendiente, la aplicación avisa al conductor que debe llamarlo o contactarlo.
13. El conductor registra el resultado de cada entrega.
14. Al finalizar, la aplicación muestra el resumen de la jornada para que el jefe pueda calcular el pago correspondiente.

## 4. Comunicación por WhatsApp

El primer mensaje se envía inmediatamente después de que el pedido queda correctamente ubicado en la ruta. El mensaje debe preguntar si el receptor podrá recibir la encomienda.

Las respuestas disponibles serán:

- **Sí, podré recibir el pedido.**
- **No podré recibirlo.**
- **Indicar un horario disponible.**

### El horario se pide en dos pasos, y no en uno

Al implementarlo apareció un límite de la Cloud API que cambia este flujo: una
plantilla aprobada por Meta admite **como máximo tres botones**, y los seis
bloques horarios no entran. Además, un mensaje de lista solo se puede mandar
dentro de la ventana de 24 horas que abre una respuesta del cliente.

Entonces el intercambio es así:

1. Llega la plantilla con exactamente tres botones: **"Sí, podré recibirlo"**,
   **"No podré recibirlo"** e **"Indicar un horario"**.
2. Si toca el tercero, ese toque abre la ventana de 24 horas, y recién ahí se le
   manda un segundo mensaje con la lista de bloques.

Tocar "indicar un horario" **no confirma nada todavía**: el pedido sigue pendiente
de respuesta hasta que elija un bloque concreto.

Los horarios se seleccionan mediante bloques predefinidos, configurables por el jefe. La configuración inicial será:

- `08:00 - 10:00`
- `10:00 - 12:00`
- `12:00 - 14:00`
- `14:00 - 16:00`
- `16:00 - 18:00`
- `18:00 - 20:00`

La aplicación debe conservar la respuesta y distinguirla de la respuesta de otros pedidos. El cliente que confirme disponibilidad debe quedar visible como confirmado. El cliente que no responda debe quedar pendiente de contacto durante la ruta.

Un rechazo explícito significa que el cliente no recibirá el pedido. Ese pedido no debe proponerse automáticamente para otro día y debe quedar destacado para informarlo al jefe al finalizar la jornada.

## 5. Estados de una encomienda

### Disponibilidad del receptor

- `pendiente_respuesta`: todavía no responde WhatsApp.
- `confirmado`: indicó que podrá recibir el pedido.
- `horario_indicado`: seleccionó un bloque horario.
- `rechazado`: indicó que no recibirá el pedido.
- `sin_respuesta`: no respondió antes del momento de contacto en ruta.

### Resultado del reparto

- `pendiente`: todavía no se intenta la entrega.
- `entregada`: el pedido fue entregado.
- `persona_no_encontrada`: el conductor llegó, pero no encontró a la persona.
- `sin_respuesta`: no fue posible obtener respuesta del receptor al intentar contactarlo.
- `rechazo`: el receptor rechazó la entrega.

Los estados de disponibilidad y de reparto deben mantenerse separados. Por ejemplo, un receptor puede haber confirmado por WhatsApp y luego no ser encontrado en el domicilio.

El conductor puede modificar el estado de la encomienda y corregir datos si detecta un error. Los cambios deben quedar asociados al pedido y ser visibles para el jefe.

## 6. Generación de rutas

La ruta debe buscar el mejor resultado operativo, no únicamente la menor distancia. Debe considerar:

- Tiempo total estimado.
- Distancia y costo aproximado.
- Cantidad de pedidos que es posible entregar.
- Bloques horarios seleccionados por los receptores.
- Clientes que confirmaron disponibilidad.
- Clientes pendientes de respuesta.
- Calidad y nivel de confianza de cada dirección.
- Orden práctico de las paradas.

La aplicación puede generar una sola ruta cuando esa ruta es la mejor. Puede generar hasta tres alternativas cuando hay más de una opción útil para comparar. Cada alternativa debe mostrar, como mínimo, tiempo estimado, distancia, cantidad de pedidos y advertencias de ubicación o disponibilidad.

Los pedidos rechazados no deben incluirse como entregas pendientes de una nueva ruta.

## 7. Direcciones y mapas

No se debe depender de una sola fuente de geocodificación. OSM puede mantenerse como proveedor inicial, pero la aplicación debe poder consultar otros servicios cuando una dirección no aparezca, el número no exista o existan coincidencias ambiguas.

La estrategia de mapas debe:

- Normalizar la dirección antes de buscarla.
- Consultar proveedores alternativos cuando sea necesario.
- Mostrar las coincidencias para que el conductor pueda elegir.
- Permitir corregir la dirección y mover manualmente el punto en el mapa.
- Informar el nivel de confianza de la ubicación.
- Impedir que una dirección evidentemente incorrecta se incorpore silenciosamente a la ruta.
- Mantener la ubicación confirmada asociada a la encomienda.

La integración de múltiples servicios puede implementarse mediante una capa de proveedores o un MCP de mapas, pero la decisión final debe preservar la continuidad del reparto si un proveedor falla.

## 8. Experiencia de uso

### Aplicación del conductor

Debe ser mobile-first, simple y rápida de usar durante el reparto. Las acciones principales deben requerir pocos toques y la carga de pedidos debe minimizar la escritura. Los campos deben ofrecer valores por defecto y ayudas para teléfonos, direcciones y estados.

La interfaz debe destacar:

- Próxima parada.
- Estado de disponibilidad del receptor.
- Pedidos confirmados.
- Pedidos pendientes de contacto.
- Advertencias de dirección.
- Acción rápida para llamar o contactar.
- Acción rápida para marcar el resultado.

### Panel del jefe

Debe estar orientado a escritorio y facilitar la revisión de resultados. El jefe debe poder ver el total de entregadas, no entregadas, personas no encontradas, pedidos sin respuesta y rechazos, además de los bloques horarios configurados y las reglas de bonos o pago.

### Identidad visual

La interfaz actual se conservará como base de experiencia y estructura, pero se reemplazará el azul dominante por una identidad centrada en naranja. Los estados deben mantener suficiente contraste y no depender únicamente del color para comunicar información.

## 9. Datos principales

El producto trabajará con estas entidades:

- Conductores.
- Vehículos.
- Encomiendas.
- Rutas.
- Paradas de ruta.
- Respuestas de disponibilidad.
- Bloques horarios.
- Resultados de entrega.
- Reglas de pago y bonos.

Los pagos no forman parte de este producto como proceso contable. El sistema solo debe entregar al jefe los datos necesarios para calcularlos.

## 10. Privacidad y datos del receptor

Nombre, teléfono, dirección, respuestas de WhatsApp y orden de la ruta son datos personales. La solución debe limitar su almacenamiento y acceso a lo estrictamente necesario para ejecutar el reparto y generar el resultado de la jornada.

La integración de WhatsApp y de los servicios de mapas debe documentar qué datos se envían a cada proveedor, durante cuánto tiempo se conservan y quién puede consultarlos. La arquitectura actual evita subir al servidor los datos completos del receptor; cualquier cambio necesario para enviar mensajes debe revisarse explícitamente antes de implementarse.

### Lo que de verdad quedó implementado

Esta sección ya no describe una propuesta: describe lo que hace el código. La
implementación está en `supabase/migrations/0003_asistencia_ruta.sql`,
`src/lib/whatsapp.ts` y `src/app/api/whatsapp/`.

**Qué sale hacia Meta.** El teléfono normalizado del receptor, su nombre de
presentación, un identificador de correlación aleatorio y el contexto de entrega
que admite la plantilla aprobada ("hoy"). Nada más: no sale la dirección, ni las
coordenadas, ni el orden de la ruta, ni datos de ningún otro receptor. Está
comprobado en `pruebas/whatsapp-contract.test.mjs`, que verifica el cuerpo contra
una lista blanca de campos del protocolo.

**Qué guarda nuestro servidor.** Una sola fila temporal por aviso, en
`encomienda_whatsapp_correlaciones`:

| Se guarda | Por qué hace falta |
|---|---|
| identificador de correlación (aleatorio) | es lo que vuelve dentro de la respuesta del receptor |
| conductor | para saber a qué teléfono devolverle esa respuesta |
| id local del pedido | para saber a cuál de sus pedidos corresponde |
| día de trabajo | para poder borrar las del día al cerrar la jornada |
| id del mensaje de WhatsApp | para empatar los estados que Meta informa |
| qué botón tocó y qué bloque eligió | es la respuesta misma |

**Qué NO guarda.** Ni nombre, ni teléfono, ni un hash del teléfono, ni dirección,
ni coordenadas, ni el cuerpo de la conversación, ni el orden de las paradas. Si el
receptor escribe un mensaje de texto libre, no se guarda ni una palabra de lo que
escribió.

El nombre y el teléfono los manda el teléfono del conductor en el cuerpo de la
consulta de envío, se usan para armar la llamada a Meta y no se persisten en
ninguna parte: viven en memoria del proceso el tiempo que dura esa consulta, y no
se escriben en ningún log. Tampoco en los mensajes de error, que llevan el código
de Meta y el identificador de correlación.

Se descartó explícitamente guardar un HASH del teléfono, que habría sido más
cómodo para empatar respuestas: un celular chileno tiene nueve dígitos, así que
un hash se revierte por fuerza bruta en minutos y la tabla se habría convertido en
un registro de destinatarios pseudonimizado. El identificador de correlación, en
cambio, es aleatorio y no se deriva de ningún dato de nadie.

**Cuánto tiempo se conserva.** Tres momentos, el que llegue primero:

1. **Al cerrar la jornada.** Un trigger sobre `encomienda_jornadas` borra las
   correlaciones de ese conductor y ese día en la misma transacción del cierre.
2. **Al aplicarse la respuesta.** Cuando el teléfono confirma que la escribió en
   su IndexedDB, la fila se borra ahí mismo.
3. **A las 72 horas de creada**, como tope duro. Lo hace un barrido que corre
   cada hora, para las jornadas que nunca se cierran (el conductor perdió el
   teléfono, se desinstaló la app).

**Quién puede consultarla.** Solo el conductor dueño de la fila, y solo la suya:
lo exige la ruta de API y lo vuelve a exigir una política de la base. El panel del
jefe **no tiene acceso**, y eso no es un olvido: ninguna pantalla del jefe necesita
esta tabla —él ve los conteos de actividad— y darle acceso sería más de lo
estrictamente necesario. Para depurar se usa el SQL Editor de Supabase, que deja
rastro.

**Qué llega al resumen del jefe.** Solo estados operativos, sin datos personales:
el conteo de entregas y, desde esta feature, una etiqueta de tres valores que dice
por qué no se entregó (`persona_no_encontrada`, `sin_respuesta`, `rechazo`). Esa
etiqueta no dice quién era el receptor ni dónde vivía, y no entra en el cálculo del
pago: la liquidación cuenta por tipo de evento, igual que antes.

## 11. Reglas de permisos

- El conductor puede consultar y modificar sus encomiendas y su ruta activa.
- El conductor puede corregir datos ingresados y actualizar estados de entrega.
- El jefe puede consultar los resultados de todos los conductores.
- El jefe puede configurar bloques horarios, reglas de pago y bonos.
- Las modificaciones deben evitar que un pedido rechazado vuelva automáticamente a una ruta futura.

### Cómo quedó repartido el acceso

Vale la pena decirlo explícitamente, porque la respuesta a "¿el jefe puede ver los
datos del receptor?" no es una política sino la forma del sistema: **no puede,
porque esos datos no están en ningún lugar al que el jefe tenga acceso**. Viven en
el IndexedDB del teléfono del conductor.

| | Conductor | Jefe / operador |
|---|---|---|
| Nombre, teléfono y dirección del receptor | sí, los suyos, en su teléfono | no existen del lado del servidor |
| Orden de su ruta | sí, en su teléfono | no existe del lado del servidor |
| Respuestas de WhatsApp de sus pedidos | sí, las suyas | no |
| Conteos de entregas y no entregas | los suyos | de todos los conductores |
| Motivo de cada no entrega | el suyo | de todos |
| Reglas de pago y bloques horarios | los lee la app | los configura |

El panel de escritorio está detrás de una puerta que solo admite `admin` y
`operador`; un conductor que teclea la URL vuelve a su app. Y al revés: la app del
conductor solo admite el rol `chofer`. Las tablas del servidor repiten la misma
regla con políticas de fila, así que saltarse la pantalla no alcanza.

## 12. Fuera del alcance inicial

Quedan fuera de la primera versión:

- Historial detallado de viajes.
- Seguimiento GPS permanente.
- Módulo de gastos.
- Sistema contable o liquidación automática de pagos.
- Gestión de clientes independiente del receptor de una encomienda.
- Soporte para operaciones distintas del reparto de encomiendas.

## 13. Criterios de éxito

La aplicación se considerará exitosa si, comparada con el proceso sin ella:

- Aumenta la cantidad de pedidos entregados por conductor.
- Reduce el tiempo de preparación y de recorrido.
- Disminuye las direcciones incorrectas o imposibles de localizar.
- Reduce la cantidad de escritura manual del conductor.
- Aumenta la cantidad de receptores contactados antes de llegar.
- Entrega al jefe un conteo confiable de entregas y no entregas.
- Permite identificar claramente los rechazos que no deben volver a intentarse.

## 14. Próximo paso técnico

Este documento es la fuente funcional inicial para ejecutar `specify`. La especificación técnica derivada debe convertirlo en:

1. Historias de usuario y criterios de aceptación.
2. Modelo de datos y transiciones de estado.
3. Contratos de WhatsApp y recepción de respuestas.
4. Capa de geocodificación con proveedores alternativos.
5. Servicio de generación y comparación de rutas.
6. Cambios de interfaz para teléfono y escritorio.
7. Pruebas de los flujos críticos.
8. Plan de implementación por fases.
