# Quickstart: Asistencia de ruta y entrega

## Prerrequisitos

- Node.js y dependencias instaladas.
- Proyecto configurado con `.env.local` para Supabase.
- `NEXT_PUBLIC_MAPBOX_TOKEN` disponible para mapas y rutas.
- Una cuenta de prueba de conductor y una cuenta de jefe.
- Para WhatsApp real: credenciales de Meta Cloud API, webhook verificado y
  número de prueba habilitado. Sin estas credenciales se usan dobles de prueba.
- Teléfono con PWA instalada para validar IndexedDB y modo sin conexión.

## Validación automatizada

Desde la raíz del proyecto:

```powershell
npm test
npm run lint
npm run build
```

### Línea base registrada (T001)

Medida el 2026-08-20, antes de tocar nada de esta feature:

| Comando | Resultado |
|---|---|
| `npm test` | 154 pruebas, 154 pass, 0 fail |
| `npm run lint` | sin hallazgos |
| `npm run build` | compila; 16 rutas, Proxy activo |

No hay fallos previos que arrastrar: cualquier rojo que aparezca de acá en
adelante lo introdujo esta feature.

### Después de implementar (T048)

| Comando | Antes | Después |
|---|---|---|
| `npm test` | 154 pass, 0 fail | **380 pass, 0 fail** |
| `npm run lint` | sin hallazgos | sin hallazgos |
| `npx tsc --noEmit` | limpio | limpio |
| `npm run build` | 16 rutas | **19 rutas** (las tres de `/api/whatsapp/`) |

Las 226 pruebas nuevas están en cinco archivos:

| Archivo | Qué protege |
|---|---|
| `asistencia-local.test.mjs` | disponibilidad, rechazo terminal, idempotencia, y las invariantes de privacidad de la migración |
| `asistencia-direcciones.test.mjs` | normalización de teléfono, normalización de consulta, ambigüedad de direcciones, caída de proveedores |
| `whatsapp-contract.test.mjs` | el contrato con Meta en las dos direcciones, reintentos, y que no se filtre nada del receptor |
| `asistencia-rutas.test.mjs` | bloques horarios, exclusión de rechazos, una a tres propuestas, costo en consultas |
| `asistencia-entrega.test.mjs` | los cuatro resultados, doble toque, ventana de deshacer, trabajo sin señal |
| `asistencia-resumen.test.mjs` | que el resumen coincida con el detalle y que nada de esto haya movido el pago |

Ninguna prueba existente se rompió. Dos se ACTUALIZARON a propósito, porque el
contrato que documentaban cambió de verdad: las de
`4-envio.test.mjs` que fijan las columnas exactas que salen a
`encomienda_actividad`, ahora con `motivo`.

Ruido conocido que NO es un fallo: Node avisa `MODULE_TYPELESS_PACKAGE_JSON` al
cargar los `.ts` del proyecto desde el arnés de pruebas. Es el costo de
importar los archivos reales sin `"type": "module"` en `package.json` (ver
`pruebas/loader.mjs`); no cambia ningún resultado.

Los tests deben cubrir normalización de teléfono, transiciones de disponibilidad,
rechazo terminal, traducción de resultados a eventos, idempotencia de webhook y
comparación de rutas.

## Qué NO se pudo validar en este entorno

Esta sección se mantiene al día a medida que avanza la implementación. Lo de acá
abajo no es "pendiente de hacer": es trabajo que **no se puede ejecutar sin
credenciales o sin el teléfono**, y que queda esperando a quien las tenga.

| Tarea | Qué falta | Qué cubre mientras tanto |
|---|---|---|
| T011 — validar la migración contra la base | No hay `.env.local` en este entorno, así que `npm run test:base` y `npm run test:esquema` no pueden conectarse a Supabase. La migración `0003` tampoco se corrió. | `pruebas/base.mjs` y `pruebas/esquema.mjs` quedaron **extendidos** con las comprobaciones nuevas (secciones 10 y 11 de base, tabla nueva en esquema), así que corren completos en cuanto haya credenciales. Y las invariantes de privacidad se comprueban **sin credenciales** leyendo el SQL: ver los siete tests del final de `pruebas/asistencia-local.test.mjs`, que corren en `npm test`. |
| T018 — escenario 1 en la PWA instalada | Requiere un teléfono con la app instalada, token de Mapbox y sesión de conductor. | Las 41 pruebas de `pruebas/asistencia-direcciones.test.mjs` ejercitan el código real de geocodificación contra los fixtures de los dos proveedores, incluidos los casos de ambigüedad, calle sin número, número interpolado y caída de cada proveedor. |
| T030 — escenario 2 contra Meta real | Requiere credenciales de Meta Cloud API, una plantilla aprobada y un número de prueba habilitado. La plantilla **no existe todavía**: hay que crearla con la forma que documenta `contracts/whatsapp.md`. | Los 38 tests de `pruebas/whatsapp-contract.test.mjs` corren el adaptador real contra un doble de la Cloud API, y los 31 de `pruebas/asistencia-rutas.test.mjs` cubren la planificación con respuestas simuladas. Las limitaciones de Meta que aparecieron al implementarlo están listadas abajo. |
| T038 — escenario 3 y 4 en teléfono con conexión intermitente | Requiere el teléfono, la PWA instalada y poder cortarle la red a mano. | Los 28 tests de `pruebas/asistencia-entrega.test.mjs` cubren los cuatro resultados, el doble toque, la ventana de deshacer y la cola offline con el reloj controlado — incluido el corte a mitad de una confirmación. |
| T044 — escenario de cierre y revisión del jefe | Requiere el panel corriendo contra una base con actividad de un día real. | Los 21 tests de `pruebas/asistencia-resumen.test.mjs` verifican que el resumen coincida con el detalle y que el pago no se haya movido, más las comprobaciones estáticas de la migración. |
| T049 — quickstart completo y línea base de tres jornadas | Es una medición OPERATIVA: hay que repartir tres jornadas sin la funcionalidad y tres con ella. No es trabajo de programación y no se puede simular. | Ver "Verificación de línea base" al final de este archivo: dice exactamente qué anotar. Los criterios SC-007, SC-008 y SC-009 quedan **sin medir** hasta que esas seis jornadas existan. |

Cuando haya credenciales, el orden es: correr la `0003` en el SQL Editor (la
propia migración termina con **ocho** comprobaciones que tienen que dar `true`),
después `npm run test:esquema`, después `npm run test:base`, y recién entonces
los escenarios manuales de más abajo.

Para WhatsApp real hacen falta además dos cosas que no son código:

1. **Crear la plantilla** `aviso_encomienda` en el panel de Meta, con la forma
   exacta que documenta `contracts/whatsapp.md` (dos variables en el cuerpo y tres
   botones, en ese orden). La aprobación de Meta puede tardar horas o días.
2. **Completar `WHATSAPP_APP_SECRET`** en `.env.local`. Sin él el webhook rechaza
   todos los eventos, a propósito.

Hasta entonces la app funciona igual y el conductor reparte igual: sin
configuración de Meta no se manda ningún aviso, la pantalla lo dice, y todos los
receptores quedan como "por llamar".

## Escenario 1: carga y ubicación

1. Iniciar la aplicación del conductor.
2. Crear un pedido con teléfono sin `+569`, dirección válida y nombre.
3. Confirmar que el teléfono se normaliza y que aparecen sugerencias de Mapbox/OSM.
4. Seleccionar una ubicación y verificar que el pedido queda ubicable.
5. Repetir con una dirección ambigua y comprobar que la aplicación muestra una
   advertencia y permite corregir el punto.
6. Repetir sin red y comprobar que el pedido se conserva localmente.

**Resultado esperado**: ningún pedido entra a una ruta sin coordenadas confirmadas
o advertencia visible.

## Escenario 2: aviso y planificación

1. Incorporar dos pedidos ubicados a una ruta.
2. Usar el doble de WhatsApp para responder `confirmado` en uno y un bloque
   `18:00-20:00` en otro.
3. Dejar un tercer pedido sin respuesta.
4. Generar la ruta.
5. Confirmar que se muestra una ruta cuando no hay alternativas útiles y hasta
   tres solo cuando cambian los indicadores.

**Resultado esperado**: confirmados, horarios y pendientes aparecen diferenciados;
el pedido sin respuesta queda marcado para contacto al aproximarse.

## Limitaciones de Meta encontradas al implementar (T030)

Esto es lo que se descubrió escribiendo el adaptador y el webhook contra la
documentación de la Cloud API. Ninguna estaba en el documento principal, y dos
cambiaron el diseño.

**Cambiaron el diseño:**

1. **Una plantilla admite tres botones de respuesta rápida, no seis.** Los seis
   bloques horarios no entran. La consecuencia es el flujo de dos mensajes: la
   plantilla ofrece "sí" / "no" / "indicar un horario", y los bloques van en un
   segundo mensaje de lista. Ver la Decisión 8 de `research.md`.
2. **Un mensaje de lista necesita la ventana de 24 horas** que abre una respuesta
   del cliente. Por eso el segundo mensaje solo se puede mandar DESPUÉS de que el
   receptor toca el tercer botón — tocarlo es lo que abre la ventana. Mandarlo
   antes devuelve el código `131047`.

**Hay que tenerlas en cuenta al operar:**

3. **El orden de los botones de la plantilla es posicional y no se puede verificar
   desde el código.** El payload se manda por índice. Si alguien reordena los
   botones en el panel de Meta, el "sí" de un receptor llega como rechazo y no hay
   forma de detectarlo desde la app. Queda anotado en `.env.example`, al lado de
   `WHATSAPP_PLANTILLA_AVISO`.
4. **La firma del webhook se calcula sobre el cuerpo crudo.** Re-serializar el
   JSON antes de verificar hace que la firma no coincida nunca y que todos los
   eventos se descarten en silencio.
5. **Meta no garantiza el orden de los eventos de estado.** Un `sent` puede llegar
   después de un `delivered`.
6. **Meta reintenta cualquier evento que no reciba un 200,** durante horas. Un
   evento que no se entiende tiene que contestarse 200 igual.
7. **La versión de la API está fijada a mano** (`v21.0` en `src/lib/whatsapp.ts`).
   Subirla es una decisión: entre versiones cambian formas de respuesta, y un
   webhook que empieza a recibir otra forma pierde respuestas sin avisar.

**Faltan dos cosas para poder probar contra Meta real:**

- Crear la plantilla `aviso_encomienda` en el panel de Meta, con dos variables en
  el cuerpo (nombre y cuándo) y los tres botones en el orden documentado. La
  aprobación de Meta puede tardar horas o días.
- Completar `WHATSAPP_APP_SECRET` en `.env.local`. **No es el mismo** que
  `WHATSAPP_VERIFY_TOKEN`: el verify token es para el handshake del webhook, el
  app secret es para firmar cada evento. Sin el app secret el webhook rechaza
  todo, a propósito.

## Escenario 3: reparto y cierre

1. Iniciar la ruta.
2. Marcar un pedido como entregado.
3. Marcar otro como persona no encontrada.
4. Marcar otro como sin respuesta.
5. Marcar otro como rechazo.
6. Cerrar la jornada y forzar sincronización.
7. Abrir el panel del jefe.

**Resultado esperado**: el panel muestra un entregado, dos no entregados con sus
motivos y un rechazo identificado como no reintentable; el pago usa el conteo de
actividad existente.

## Escenario 4: resiliencia

1. Desconectar la red antes de marcar una entrega.
2. Confirmar que el estado cambia localmente y queda un evento pendiente.
3. Volver a conectar y esperar o forzar el envío.
4. Repetir la sincronización para comprobar que no duplica el conteo.
5. Simular fallo de WhatsApp y comprobar que aparece reintento o contacto manual.
6. Simular fallo de trazado y verificar que quedan puntos y orden sin línea.

**Resultado esperado**: el conductor puede continuar con una degradación explícita;
la actividad llega una sola vez cuando vuelve la conexión.

## Verificación de línea base

Registrar durante tres jornadas comparables sin la nueva funcionalidad:

- pedidos disponibles;
- pedidos entregados;
- tiempo de preparación;
- tiempo total de reparto;
- direcciones no encontradas.

Repetir la medición durante tres jornadas con la funcionalidad y comparar contra
SC-007, SC-008 y SC-009 del spec.
