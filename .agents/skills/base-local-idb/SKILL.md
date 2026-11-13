---
name: base-local-idb
description: Úsala cuando vayas a tocar la base del teléfono de ARES (IndexedDB `dashund-encomiendas`) — `src/lib/encomiendas/local/idb.ts`, `almacen/`, `enviar.ts`, `modo-prueba.ts`, `borrado-local.tsx` —; al agregar o cambiar un store, un índice o un campo guardado, subir la versión (v6) o escribir una migración; al tocar la cola de actividad (`ActividadPorEnviar`), el trabajo sin señal, cerrar o borrar el día, `STORES_DEL_DIA`, el cierre de sesión o el modo prueba; antes de publicar un cambio de base; con la spec 026 (guardado persistente); o cuando el dueño diga «se perdió lo guardado», «no abre el día» o «quedaron registros sin enviar».
---

# Base del teléfono (IndexedDB)

Todo el día del conductor vive en el teléfono: pedidos, ruta, fotos y la `cola` de lo que falta
subir. Al servidor sube solo el hecho (`encomienda_actividad`). Un error aquí no se ve en el
panel: el conductor trabaja gratis, cobra dos veces o pierde su día en plena calle. Las reglas
vienen de `AGENTS.md`; si este archivo no coincide con él o con `docs/`, valen ellos y se avisa.

## Antes de tocar nada
1. `MEMORY.md` y, de `AGENTS.md`, «Datos de destinatarios», «Ramas y publicación» y «Verificación».
2. Lee entero `src/lib/encomiendas/local/idb.ts` y las cabeceras de `almacen/index.ts` (las dos
   invariantes) y `almacen/fila.ts` (por qué existe la fila).
3. ¿Store, índice o versión nueva? Revisa en `specs/README.md` si otra rama reservó la v6 («usa
   idb v6» en su fila) y sigue `references/agregar-store.md`.
4. ¿Borrado o lo que sale del teléfono? Skill `privacidad-destinatarios` y `docs/PRIVACIDAD.md`.
5. ¿Falla en el teléfono (no abre el día, se perdió algo, no se envía)? `references/fallas.md`.

## Lo que ya está decidido (no se «corrige»)
- **El nombre `dashund-encomiendas` no cambia.** IndexedDB se encuentra por nombre: otro nombre es
  una base nueva y vacía. El cambio desde `pucarani-encomiendas` (2026-10-30) borró la vieja sin
  copiarla, `cola` incluida. `NOMBRE_ANTERIOR` y su `deleteDatabase` se pueden quitar desde 2027.
- **La versión solo sube.** Hoy `VERSION = 6`; la libre es la v7. Abrir con una versión menor que
  la del teléfono da `VersionError` (comprobado con `fake-indexeddb`): volver a un código con v5
  deja al conductor sin su día. Se revierte hacia adelante, con la misma versión.
- **Cuándo sube:** al agregar o quitar un store o un índice, o al mover datos entre stores. Un
  campo nuevo no la sube (IndexedDB no valida campos): se completa al leer en `alDia`,
  `rutaAlDia` o `diaAlDia` (`almacen/migrar.ts`). Igual es un cambio de formato: se pregunta antes.
- **Una sola puerta.** Solo `almacen/` usa `idb.ts` (hoy también `modo-prueba.ts`), y la app
  entra por el barril `almacen/index.ts`. Ahí se cuidan dos invariantes que valen plata: cerrar una
  visita guarda el pedido y su evento en la misma transacción, y rehacer la ruta nunca pierde lo
  cerrado. `lib/encomiendas/local/` es `"use client"` y nada del servidor lo importa (A4).
- **`escribir()` es una transacción con callback sincrónico.** Sin `await` adentro: la transacción
  se cierra sola al vaciarse las microtareas y falla con `TransactionInactiveError` de vez en
  cuando. Para leer y reescribir dentro de ella está `actualizar`, que no revive una fila borrada.
- **Lo que lee, decide y escribe va en `enFila()`.** Sin la fila, un doble toque en «Pedido
  finalizado» encolaba dos eventos (la entrega se pagaba dos veces) y `fijarCoordenadas` pisaba
  un «entregado».
- **La `cola` no se toca.** Cada `ActividadPorEnviar` tiene un UUIDv7 que es el mismo
  `encomienda_actividad.id`, y el envío usa `ignoreDuplicates`: reenviar no duplica, pero borrar
  sin confirmar le quita plata al conductor. Un evento sale de la cola solo por:
  - `quitarDeCola`, después de que el servidor confirmó (`enviar.ts`);
  - `deshacerResultado`, mientras sigue retenido (`retenidoHasta`, spec 017 E2);
  - `cambiarResultado` (spec 033, G5): si no salió (retenido o rechazado) se quita; si pudo salir,
    se reemplaza por `{ id, borrar: true }`, que `enviar.ts` borra en el servidor por su id y tacha
    con `quitarCorreccion` solo si allá ya no está. `quitarDeCola` nunca tacha una corrección;
  - `salirDelModoPrueba`, al que solo se entra con la cola vacía.
  - Lo que el servidor rechaza se aparta (`rechazado`) y se muestra; no se borra (spec 017, E8).
    La lectura de `choferId` en `cola.ts` se queda: hay eventos guardados con el nombre de antes.
- **Un error de red nunca borra.** `enviarActividadPendiente` lanza y deja la cola intacta.
  `BorradoLocal` se monta solo si el servidor respondió que la cuenta no tiene ficha o está
  desactivada (spec 007, FR-007).
- **Datos de destinatarios solo en `STORES_DEL_DIA`** (`pedidos`, `rutas`, `fotos`, `propuestas`), que se borran
  con el día (spec 007). `cola` y `dias` no tienen datos de personas y sobreviven. La matriz de
  distancias vive en memoria y se olvida al borrar (`olvidarMatriz`), nunca en IndexedDB.
- **Un pedido es de un día** (`fecha` «YYYY-MM-DD» en hora de Chile, `hoyChile`): no hay arrastre
  (specs 009 y 012). `rutas` y `dias` usan la fecha como clave.
- **Sin señal es lo normal.** Marcar escribe primero en el teléfono; enviar es aparte (al abrir,
  al volver la señal o la app, y cada 60 s). El día (`encomienda_jornadas`) sale solo con la cola
  vacía, para que el jefe no vea una liquidación corta.
- **Modo prueba** (`modo-prueba.ts`, `localStorage` `ares-modo-prueba`): no envía la cola ni el
  día. «Salir y borrar» vacía enteros `STORES_DEL_DIA` y `cola`: no distingue qué era de prueba.

## Dónde está cada cosa
| Store | Clave | Forma (`almacen/tipos.ts`) | Destinatarios | Cerrar el día | Cerrar sesión o cuenta inactiva | Salir del modo prueba |
|---|---|---|---|---|---|---|
| `pedidos` | `id` (UUIDv7) | `Pedido`, con su `aviso` | sí | se borran los de esa fecha | se vacía | se vacía |
| `rutas` | `fecha` | `Ruta`: orden, trazado, partida | sí (puntos) | se borra la de esa fecha | se vacía | se vacía |
| `fotos` | `id`, índice `por_fecha` | `Foto` (JPEG ≤ 1280 px) | sí (la etiqueta) | se borran las de esa fecha | se vacía | se vacía |
| `propuestas` (v6) | `fecha` | `PropuestaGuardada`: la ruta propuesta sin aceptar | sí (puntos, avisos) | se borra la de esa fecha | se vacía | se vacía |
| `cola` | `id` = `encomienda_actividad.id` | `ActividadPorEnviar` | no | queda | queda | se vacía |
| `dias` | `fecha` | `ResumenDia`: solo cifras | no | recibe el resumen; se podan los de > 60 días sin cola (G5) | recibe uno por día | queda |

| Qué | Archivo (`src/lib/encomiendas/local/…`) |
|---|---|
| Base, versión, stores, `STORES_DEL_DIA`, `escribir`, `leerTodos`, `leerUno`, `clavesFotosDe`, `ErrorAlmacenLocal` | `idb.ts` |
| Puerta única y sus invariantes · fila de operaciones | `almacen/index.ts` · `almacen/fila.ts` |
| Formas guardadas · completar campos al leer y la migración v2 → v3 (`migrarV2`) | `almacen/tipos.ts` · `almacen/migrar.ts` |
| Lecturas normalizadas (nadie lee `pedidos` o `rutas` por su cuenta) | `almacen/lecturas.ts` |
| Marcar llamada y resultado, deshacer, mover al final | `almacen/terreno.ts` |
| Cola: leer, quitar, apartar, retener | `almacen/cola.ts` |
| Envío a `encomienda_actividad` y `encomienda_jornadas` (`useEnvioActividad`) | `enviar.ts` |
| Cierre y borrado del día; cierre de sesión (`cerrarYBorrarDia`, `diasPorBorrar`, `borrarDatosDestinatarios`) | `almacen/borrado.ts` |
| Pantalla del cierre («Listo, borrar del teléfono», «Ahora no») | `src/app/(conductor)/conductor/encomiendas/_hooks/use-cierre-dia.ts`, `_componentes/cierre-dia.tsx` |
| Borrado por cuenta sin ficha o desactivada | `src/app/(conductor)/borrado-local.tsx` |
| Cerrar sesión (avisa los «registros sin enviar»; primero la sesión, después el borrado, spec 033) · contador en «Tu día» | `src/app/(conductor)/cerrar-sesion.tsx` + `local/salida.ts` · `_componentes/tu-dia.tsx` |
| Modo prueba (Menú → Diagnóstico) | `modo-prueba.ts`, `src/app/(conductor)/conductor/diagnostico/page.tsx` |
| Foto achicada antes de guardarla · guardar y purgar fotos | `foto.ts` · `almacen/paquete.ts` |

Fuera de IndexedDB, en `localStorage` y sin datos de destinatarios: `ares-modo-prueba`,
`ares-gps-simulado`, `dashund-partida-empresa` (la central) y `dashund-voz-navegacion`.

## Agregar o cambiar un store
El paso a paso, con el patrón de `idb.ts` y la prueba de versión, está en
`references/agregar-store.md`. Lo mínimo:
1. Preguntar al dueño (cambia el formato de datos) y reservar «usa idb v6» en `specs/README.md`.
2. `VERSION = 6` con su línea en el comentario de versiones; el store en `FilaDe` y `STORES`; el
   `createObjectStore` dentro de `if (!base.objectStoreNames.contains(…))`.
3. Si mueve datos, una función pura en `almacen/migrar.ts`, que corre dentro de la transacción de
   versión con `evento.oldVersion > 0 && evento.oldVersion < 6`, sin `await`.
4. Con datos de destinatarios: sumarlo a `STORES_DEL_DIA` **y** borrarlo por fecha en
   `cerrarYBorrarDia`. `STORES_DEL_DIA` solo cubre el cierre de sesión y el modo prueba; el cierre
   del día borra store por store.
5. Las operaciones nuevas, en `almacen/<tema>.ts`, con `enFila` + `escribir` y exportadas por el
   barril.
6. Pruebas (abajo) y docs: `docs/ARQUITECTURA.md` §2, `docs/CLASES.md` §1 y §4, `docs/PRIVACIDAD.md`
   si hay datos de personas, la v5/v6 de `AGENTS.md` y `specs/README.md`, y `MEMORY.md`.

## Qué pasa al publicar
- La APK y la PWA cargan producción: el cambio llega en la próxima apertura (`public/sw.js`: red
  primero, con 4 s de espera; si no responde, la copia guardada). Publicado a mediodía, sube la
  base a mitad de la ruta.
- La subida de versión corre una vez y es atómica. Si falla, la base queda como estaba con todo
  adentro, pero la app no abre el día hasta publicar el arreglo.
- No hay vuelta atrás (`VersionError`, arriba). Revertir un deploy de Vercel después de una subida
  deja a los teléfonos que ya la abrieron sin poder abrir la base.
- Por eso, un push a `main` con cambio de base se pregunta antes y sale con el día cerrado y la
  cola enviada: sin el aviso «registros sin enviar» en «Tu día».
- Un preview de Vercel o `localhost` es otro origen, con otra base: probar ahí no toca la del
  conductor.

## Pruebas
- Siempre: `npm test`, `npm run lint` y `npm run build`.
- Una sola: `node --import ./pruebas/registrar.mjs --test pruebas/idb-version.test.mjs`.
- Las del tema (132 pruebas, ~4 s): `idb-version`, `migracion-v3`, `3-almacen`, `4-envio`,
  `privacidad`, `modo-prueba`, `paquete`, `listo-para-terreno`, `asistencia-entrega`,
  `renombrado-conductor` y `arquitectura`.
- Cómo se escriben:
  - `import "fake-indexeddb/auto"` en la primera línea, y los módulos con `await import(…)`.
  - Cada archivo corre en su propio proceso, con una base nueva. Dentro de él, se limpia con
    `vaciar` en `test.beforeEach`.
  - La base vieja se arma a mano, **antes** del primer import del almacén, y se cierra con
    `base.close()`: si no, la subida queda bloqueada.
  - Los plazos (retención, deshacer) se prueban con `dobles/reloj.mjs`, y el servidor con `espia`
    de `dobles/supabase-client.mjs`.
  - Datos inventados: calles reales de Arica con números y nombres inventados.
- La pantalla no tiene pruebas: se recorre (skill `recorrer-conductor`). En la APK, la base se ve
  en `chrome://inspect` → Application → IndexedDB (skill `apk-local`). Lo que se vea ahí no se
  copia al chat ni al repo.

## Pendientes
- **Spec 026 (borrador):** pedir almacenamiento persistente (`navigator.storage.persist()`) y
  mostrar en Diagnóstico cuánto se usa. Sin cambio de formato ni de versión. Antes, medir en la
  APK si la WebView desaloja y si `persist()` responde.
- **Spec 022 (borrador):** dónde se guarda el ⚠ (¿campo en `pedidos` o derivado?). **Spec 025
  (borrador):** dónde se guarda la referencia de la dirección. **Spec 021:** no cambia stores.
- `AndroidManifest.xml` tiene `allowBackup="true"`: el respaldo de Android puede copiar
  IndexedDB a la cuenta de Google del conductor (`MEMORY.md`; toca `android/`, se pregunta).
- **Hueco visto el 2026-11-05 (sin arreglar):** si en modo prueba se cierra y borra el día, su
  `ResumenDia` queda en `dias` después de «Salir y borrar». Ese mismo día, `sincronizarDiaTrabajo`
  lo sube a `encomienda_jornadas` (reproducido con `fake-indexeddb` y el doble de Supabase).

## Docs y código que hoy no calzan
- `AGENTS.md` dice que `pruebas/arquitectura.test.mjs` hace cumplir «solo `almacen/` toca
  `idb`»: ninguna regla A1–A10 lo revisa, y `modo-prueba.ts` importa `./idb`. Lo mismo afirman
  `docs/ARQUITECTURA.md` §2 y `docs/CLASES.md` §3.
- `docs/ARQUITECTURA.md` §2 dice que el cierre borra «pedidos y ruta»; también borra `fotos`.
- La spec 022 dice que un campo nuevo sube la versión de `idb.ts`; `idb.ts` dice que no.
- El comentario de `STORES_DEL_DIA` cita «005: lecturas», y el `data-model.md` de la 007,
  `lecturasPendientes`: ese store se descartó (005, T009).
- `enviar.ts` cita la «migración 0026», y `tipos.ts`, `ruta.ts` y `enviar.ts` citan «0032»: hoy las
  migraciones van de 0001 a 0007.
- `idb.ts` habla de «un día de 30 paradas»; hoy son ~60–100. La T008 de la 007 nombra
  `diasSinCerrar`; la función es `diasPorBorrar`.
