# Pruebas

```bash
npm test              # 486 pruebas, sin red ni base de datos (~34 s)
npm run test:base     # el esquema de encomiendas contra la base real (solo lectura)
npm run test:esquema  # el esquema completo contra los tipos de src/types/db.ts
```

Las pruebas importan los archivos **reales** de `src/` — no copias ni versiones
portadas. `resolver-ts.mjs` traduce lo que TypeScript resuelve y Node no (el
alias `@/…` y los imports sin extensión), y `loader.mjs` le suma lo único propio
de las pruebas: cambiar por un doble lo que no puede ser real acá adentro, el
cliente de Supabase y `next/headers`. El servidor MCP usa el mismo resolvedor
sin ningún doble (ver `mcp/loader.mjs`).

Los proveedores externos que se consultan con `fetch` (Mapbox, OpenRouteService,
la Cloud API de Meta) no se sustituyen a nivel de módulo sino **reemplazando el
`fetch` global**.
Es a propósito: así corre el código real que arma la URL, los headers y el cuerpo,
y que interpreta cada error. Un doble a nivel de módulo no probaría nada de eso —
y es justo eso lo que se rompe cuando el proveedor cambia algo.

No hay framework de pruebas: `node:test` viene con Node.

| Archivo | Qué cubre |
| --- | --- |
| `1-pago.test.mjs` | `lib/encomiendas/pago.ts` — la tarifa de cada día, cuánto se paga, cómo se agrupa la actividad. **Es la plata.** |
| `2-rutas.test.mjs` | `lib/rutas.ts` — orden de paradas, trazado por tramos, navegación. Mapbox se sustituye con un doble de `fetch`. |
| `3-almacen.test.mjs` | `lib/encomiendas/local/` — el teléfono del conductor, sobre una IndexedDB real (`fake-indexeddb`). Jornada completa, regenerar la ruta, doble toque. |
| `4-envio.test.mjs` | La cola offline: nada se borra del teléfono sin confirmación del servidor. |
| `5-periodo.test.mjs` | El filtro de mes/año y las fechas: que ningún día de pago quede fuera de su periodo. |
| `6-voz.test.mjs` | Qué voz se elige para hablar según las que tenga instaladas el teléfono. |
| `7-navegacion.test.mjs` | Simula manejar un tramo **real** de Arica (`fixtures/tramo-arica.json`, 9 maniobras, 3,6 km) y comprueba que el cartel avanza solo por todas las maniobras y que salirse del camino se detecta. Es lo que reemplazó a consultar Mapbox cada 150 m. |
| `8-orden-paradas.test.mjs` | **Calidad** del orden de las paradas, no solo que sea una permutación válida: hasta 9 paradas se compara contra el óptimo real calculado por fuerza bruta (implementación independiente de la del código). Cubre también la matriz de calles asimétrica, que es la que rompe los algoritmos que suponen que ir y volver cuestan igual. |
| `9-deslizar.test.mjs` | `lib/deslizar.ts` — el gesto de deslizar una fila hacia la izquierda para eliminarla. Fija las tres cosas que en el teléfono se sienten como "la lista está rara": que el eje se decida **una vez** y no en cada movimiento (o un dedo que sube en diagonal va abriendo filas por el camino), que el atajo de eliminar pida bastante más que abrir el panel, y que una fila angosta —o todavía sin medir— no se vuelva un gatillo fácil. |
| `11-form-helpers.test.mjs` | Cómo se leen los números que escribe la gente (formato chileno de miles). Fija la trampa del punto decimal. |
| `12-plus-code.test.mjs` | `lib/geo/plus-code.ts` — Plus Codes ⇄ coordenadas. Es la única pieza que ubica una casa **sin preguntarle a nadie**: sin red, sin API key, sin límite de consultas. En Arica eso importa porque las casas no tienen numeración —de 23 direcciones reales, Mapbox tiene la puerta exacta en 2—. Fija que un código dictado por teléfono ("GMCP+MX, Arica") caiga en Arica y no en otra ciudad, que marcar la casa y releerla no la mueva más de 3 m, y que un código mal escrito devuelva `null` en vez de tumbar la pantalla (la librería lanza un **string**, no un `Error`). Una prueba comprueba que no se consulte la red ni una vez. |
| `13-uuid.test.mjs` | Los ids que genera el teléfono: versión, variante, unicidad y orden temporal. De ahí depende que reenviar no duplique. |
| `14-periodos-facturacion.test.mjs` | Los cortes de facturación: a qué periodo cae cada día, y que ninguno quede en dos. |
| `15-ruteo-ch.test.mjs` | `lib/geo/openrouteservice.ts` — el trazado por calles abierto (grafo de OSM, Jerarquías de Contracción), que usa el servidor MCP y **no** el camino del conductor. Corre contra `fixtures/ruta-ors-arica.json`, capturado de la API real sobre el **mismo** tramo que `tramo-arica.json` usa para Mapbox. Fija el orden `[lng, lat]` del cuerpo que sale —invertirlo no da error, devuelve una ruta por el océano—, que la geometría entre **sin traducir** a `ajustarATrazado()` y `metrosRestantes()` de `lib/rutas.ts`, que la falta de API key **lance** en vez de confundirse con "el servicio está caído", y el máximo de puntos **medido** (70 pasa, 71 devuelve 400). Fija además que ORS diga *"Camina hacia el noroeste"* en perfil `driving-car`: no es un bug nuestro, es su traducción al castellano, y es una de las razones de que la navegación del conductor siga saliendo de Mapbox. |
| `16-mcp.test.mjs` | El contrato del servidor MCP hablado **por el protocolo**: levanta `mcp/servidor.ts` como proceso y le habla con el cliente oficial del SDK. Lo que protege no son las funciones (esas ya están en las dos de arriba) sino el armado — un nombre de tool cambiado, un campo caído del esquema de salida, o un `console.log` suelto que ensucia stdout y tumba la sesión entera. Comprueba también que ninguna salida de ubicación prometa una dirección de texto, y el viaje de ida y vuelta entre `encode_plus_code` y `resolve_plus_code`: marcar la casa y releerla mañana no puede moverla. Mismo criterio que `whatsapp-contract`. |
| `17-marcar.test.mjs` | `lib/geo/marcar.ts` — el chofer marcando la puerta con el GPS, que es el último recurso del sistema de direcciones y en Arica el más confiable. Lo que fija es que **el radio de error nunca se pierda por el camino**: el GPS nunca dice "no sé", devuelve una posición aunque esté perdido, y guardar ±80 m como "la puerta" sería el mismo error que decidir por el `confidence` de Mapbox pero con la firma del chofer encima. Comprueba los tres cortes (12 m / 40 m), que sin radio informado **no se asuma lo mejor**, que los metros aparezcan en las tres frases, y que el Plus Code que sale de la marca vuelva al mismo lugar. |
| `asistencia-local.test.mjs` | Disponibilidad del receptor, rechazo terminal e idempotencia de las respuestas de WhatsApp. Al final, siete comprobaciones que leen la migración `0003` como texto: son las que impiden que alguien le agregue una columna con datos del receptor sin que nada avise. |
| `asistencia-direcciones.test.mjs` | Normalización de teléfonos chilenos (a quién se le manda el aviso) y de direcciones. Dos casos reales la motivaron: "Los Aromos 120" existe en Arica **y** en Azapa, a nueve kilómetros, y quedarse con el primer resultado mandaba al conductor al lugar equivocado; y "Linderos 3536", donde la calle se llama "Avenida Linderos Poniente" y el número se perdía — ahora se busca en las calles cuyo nombre contiene, **entera**, cada palabra escrita, y si el número existe en dos de ellas elige el conductor. Fija además la **tabla completa de `address_number`** de Mapbox (`matched` → exacta, `plausible` → aproximada) y que un `confidence: "low"` con la puerta real **siga siendo exacta**: decidir por `confidence` es lo que rompió la app entera (ver abajo). Y el atajo de los **Plus Codes en el campo de dirección**: que un código escrito no consulte a ningún proveedor (cero peticiones, comprobado), que se guarde el código **completo** aunque se haya escrito el corto, y que un código impreciso entre igual pero diciendo cuántos metros cubre. |
| `asistencia-vista-previa-mapa.test.mjs` | La estampilla de mapa que muestra **dónde** quedó una dirección (`lib/mapa-estatico.ts`). Fija el orden longitud/latitud —invertirlo no da error, pone el punto en el mar—, que los paréntesis del marcador no salgan escapados, y que la misma esquina dé siempre la misma URL (una sola petición, que se paga). |
| `whatsapp-contract.test.mjs` | El contrato con Meta en las dos direcciones: la plantilla que sale, los tres botones y su orden, los reintentos, y que **no se filtre ningún dato del receptor** al cuerpo que sale ni a los mensajes de error. |
| `asistencia-rutas.test.mjs` | Que los bloques horarios pesen en el orden, que un rechazo no vuelva a proponerse, que se muestre **una** ruta cuando comparar no aporta, y que ofrecer tres no cueste tres veces más en consultas. |
| `asistencia-entrega.test.mjs` | El reparto: los cuatro resultados, el doble toque, la ventana para deshacer y la jornada sin señal. Usa el reloj controlado (`dobles/reloj.mjs`) para probar plazos sin esperarlos. **Es la que más plata protege.** |
| `asistencia-resumen.test.mjs` | Que el resumen del jefe coincida con el detalle individual (SC-006) y que agregar el motivo de no entrega **no haya movido ni un peso** del pago. |
| `base.mjs` | El esquema de encomiendas contra lo que el código da por hecho, y la cuenta del pago cruzada contra las cifras guardadas. |
| `esquema.mjs` | Cada campo de cada `interface` de `src/types/db.ts` existe como columna. |

Los dobles de `dobles/`:

| Doble | Para qué |
| --- | --- |
| `supabase-client.mjs` | El cliente de Supabase: registra los upserts y decide qué contesta el servidor. |
| `next-headers.mjs` | `next/headers`, que solo existe dentro del servidor de Next. |
| `meta-whatsapp.mjs` | La Cloud API de Meta, enganchada en el `fetch` global. Si el adaptador pidiera otro host, lanza en vez de dejar salir la consulta. |
| `reloj.mjs` | Congela `Date.now()` y `new Date()` sin argumentos. Sin él, tres reglas de esta app —la ventana de deshacer, la retención de la cola y los bloques horarios— solo se podían probar esperando de verdad, o no probar. |

El fixture de navegación se capturó una vez de la API real. Para renovarlo hace
falta el token de Mapbox en `.env.local` y volver a pedir el mismo tramo. Los de
`fixtures/geocoding-*.json`, `fixtures/ruta-ors-arica.json` y
`fixtures/whatsapp.json` también son respuestas reales, recortadas a los campos
que el código lee. Cada uno lleva en su cabecera cuándo se capturó y contra qué.

## Un fixture viejo miente y nada falla

Pasó, y costó la app entera. Mapbox recalibró su `match_code`: dejó de contestar
`confidence: "exact"` para las direcciones de Arica y pasó a contestar `"low"`
en **23 de 23** —incluso con la puerta real encontrada—, porque la consulta no
trae código postal, comuna ni región y esos componentes pesan igual. Además
apareció un valor nuevo, `address_number: "plausible"`, que el código no
contemplaba.

`lib/geocoding.ts` decidía la confianza con `confidence`, así que empezó a
devolver `"baja"` para **todo**: `ubicarDireccion()` dejaba `elegida` en `null`
siempre y **ningún pedido entraba a la ruta**. El conductor veía "confírmala
antes de salir" en cada dirección.

`npm test` estuvo **422/422 en verde** todo ese tiempo. No podía verlo: los
fixtures se habían capturado antes del cambio, así que las pruebas comprobaban
—correctamente— el comportamiento frente a una respuesta que Mapbox ya no
manda.

Lo que quedó de eso:

- `scripts/sondear-proveedores.mjs` — corre las direcciones reales de Arica
  contra Mapbox, Photon y Nominatim y saca una tabla de aciertos, latencias y
  qué contesta cada uno ante una dirección inexistente. **Corrélo cuando algo
  del geocodificador se sienta raro**; es lo que destapó esto.
- Las pruebas nuevas de `asistencia-direcciones.test.mjs` fijan la tabla de
  `address_number` y afirman explícitamente que el fixture todavía trae el
  `confidence: "low"` que motivó el arreglo: si alguien recaptura y ese valor
  cambia, la prueba lo dice en vez de pasar en silencio.

La moraleja no es "no uses fixtures": es que un fixture es una foto con fecha, y
lo único que comprueba que la foto sigue siendo la realidad es volver a mirar.

## Por qué `base.mjs` y `esquema.mjs` existen

`tsc`, `eslint` y `next build` pueden estar los tres en verde con el panel entero
roto: ninguno sabe qué columnas tiene la base. Ya pasó — una migración que
agregaba `encomienda_actividad.origen` no se había corrido, todas las consultas
del panel fallaban, y la pantalla mostraba "sin actividad" con los KPI en $0.
**Corré estas dos después de cada migración**, y sobre todo después de importar
los datos del sistema anterior.

`base.mjs` además comprueba dos cosas que solo se pueden ver contra la base viva:

- que la cuenta del pago en SQL y la de `lib/encomiendas/pago.ts` den lo mismo
  sobre los días ya guardados (son dos copias de la misma aritmética);
- que no haya jornadas de días pasados sin cerrar ni días con actividad y sin
  jornada — los dos casos en que un día trabajado **no se paga** y nada avisa.

## Lo que estas pruebas NO cubren

La cuenta del pago que corre de verdad está en Postgres
(`private.encomienda_congelar_dia`), y `npm test` no levanta una base. Lo que se
prueba acá es la copia en TypeScript; que las dos coincidan lo comprueba
`base.mjs` contra los días reales. Si se toca una de las dos, hay que tocar la
otra y correr `test:base`.

Tampoco cubren **nada contra Meta real**: la plantilla aprobada, la firma del
webhook con el secreto de la app y el número de prueba habilitado necesitan
credenciales. Lo que sí se prueba es el adaptador entero contra un doble, con los
cuerpos reales que Meta manda. Ver la sección "Qué NO se pudo validar" de
`specs/001-asistencia-ruta-entrega/quickstart.md`.

Y no cubren la pantalla: no hay pruebas de componentes de React en este proyecto.
Lo que se protege es el dominio —el almacén local, la ruta, la cola, los
contratos—, que es donde un error cuesta plata o pierde el trabajo del conductor.
La pantalla se valida a mano con los escenarios del quickstart.
