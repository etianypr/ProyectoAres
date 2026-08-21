# Pruebas

```bash
npm test              # 380 pruebas, sin red ni base de datos (~21 s)
npm run test:base     # el esquema de encomiendas contra la base real (solo lectura)
npm run test:esquema  # el esquema completo contra los tipos de src/types/db.ts
```

Las pruebas importan los archivos **reales** de `src/` — no copias ni versiones
portadas. `loader.mjs` traduce lo que TypeScript resuelve y Node no (el alias
`@/…` y los imports sin extensión) y cambia por un doble solo lo que no puede ser
real dentro de una prueba: el cliente de Supabase y `next/headers`.

Los proveedores externos que se consultan con `fetch` (Mapbox, la Cloud API de
Meta) no se sustituyen a nivel de módulo sino **reemplazando el `fetch` global**.
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
| `11-form-helpers.test.mjs` | Cómo se leen los números que escribe la gente (formato chileno de miles). Fija la trampa del punto decimal. |
| `13-uuid.test.mjs` | Los ids que genera el teléfono: versión, variante, unicidad y orden temporal. De ahí depende que reenviar no duplique. |
| `14-periodos-facturacion.test.mjs` | Los cortes de facturación: a qué periodo cae cada día, y que ninguno quede en dos. |
| `asistencia-local.test.mjs` | Disponibilidad del receptor, rechazo terminal e idempotencia de las respuestas de WhatsApp. Al final, siete comprobaciones que leen la migración `0003` como texto: son las que impiden que alguien le agregue una columna con datos del receptor sin que nada avise. |
| `asistencia-direcciones.test.mjs` | Normalización de teléfonos chilenos (a quién se le manda el aviso) y de direcciones. El caso que la motivó: "Los Aromos 120" existe en Arica **y** en Azapa, a nueve kilómetros, y quedarse con el primer resultado mandaba al conductor al lugar equivocado. |
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
`fixtures/geocoding-*.json` y `fixtures/whatsapp.json` también son respuestas
reales, recortadas a los campos que el código lee.

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
