# Specs: features pendientes

**Todo lo que falta desarrollar está aquí**, una carpeta por feature (`NNN-nombre/`). Lo que no
tiene carpeta no está pendiente: o está hecho (resumen en `docs/HOJA-DE-RUTA.md`) o nadie lo ha
pedido. Un *Pendiente* en `AGENTS.md` apunta a su carpeta.

- Una carpeta crece así: `spec.md` (qué y por qué; un borrador alcanza para anotarla) → `plan.md`
  (+ `research`, `data-model`, `contracts`, `quickstart`) → `tasks.md`.
- Reglas: `.specify/memory/constitution.md`. Orden: `docs/HOJA-DE-RUTA.md`.
- Spec Kit en Claude Code: `/speckit-specify` (crea la carpeta aquí), `/speckit-clarify`,
  `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze` y `/speckit-implement`.

**Próximo número: 029.**

## Preparar el día real (prioridad, dueño 2026-11-09)

La tarea de ahora es dejar la app lista para probarla en un día real, sin que ninguna feature deje
tirado al conductor (`AGENTS.md`, «Ahora»). Lo que no sirve para eso está en «Después del día real».

1. **Ensayo completo** en la APK de prueba, en modo prueba y con GPS simulado (skill
   `recorrer-conductor`): un día inventado de ~60 pedidos con Plus Code, los seis pasos del flujo y
   un tramo sin señal. Se arregla lo que falle; lo que no quede firme se le muestra al dueño para
   decidir si se apaga ese día.
   - Cerrar el día: la lista de no entregados, el borrado (007) y los conteos y el pago en el panel
     del jefe (`npm run test:base`; una migración sin correr ya lo dejó en $0).
2. **Riesgos conocidos** que pueden dejarlo tirado:
   - **Escáner en vivo (028), ensayo 2026-11-09:** en el teléfono del conductor, con la cámara
     encendida cada redibujo de ARES espera a la GPU 1 a 5 s (con un texto que cambia cada 0,5 s:
     3 cuadros ≥ 4,9 s en 10 s; sin cámara, ninguno). Pasa con la WebView transparente u opaca, sin
     ML Kit, sin captura, solo con la vista previa, con TextureView y a 720p/15 cuadros/s: no se
     arregla ajustando el plugin. Cada etiqueta leída redibuja, así que cargar el auto puede trabarse
     en cada paquete; si el conductor toca durante una traba de más de 8 s, Android cierra ARES
     (ANR, ya pasó el 2026-11-08 escaneando). En producción, escribir la OF apaga la cámara (sin ANR)
     y apagarla traba 2 a 5 s; un teclado propio fue peor (cada tecla redibuja). El dueño decide si
     el día real carga el auto con el escáner de siempre (el de Google, una etiqueta por toque).
   - **Google Maps sigue a la parada ya cerrada (020), ensayo 2026-11-09:** al cerrar una parada,
     ARES manda la siguiente y Maps pregunta «¿Salir de la navegación?»; si nadie toca, la cuenta
     regresiva elige «No». Arreglo en `GoogleMaps.java` (`FLAG_ACTIVITY_CLEAR_TASK`, verificado en
     la APK de prueba: arranca derecho a la nueva). Va en la APK 1.6.1, con las llamadas de fondo
     (`TrasLlamar.java`: con la llamada en curso vuelve ARES o, desde la burbuja, Google Maps).
   - ~~`NetworkError` al abrir~~: era `document.fonts.load` con la cara «Fallback» (Arial no existe
     en Android); arreglado en `ruta-mapa.tsx`.
   - La central en la configuración no tiene el Plus Code: la ruta parte de donde la ubique el
     buscador (gasta una consulta a Google la primera vez). Los ensayos anteriores partían ~2,7 km
     al norte.
   - Burbuja (020): el permiso `POST_NOTIFICATIONS`, el altavoz al llamar y si ARES vuelve adelante
     al cerrar la última parada.
   - Guía: Cloud Vision usa `GOOGLE_MAPS_KEY` y va antes que ML Kit; confirmar que la guía se lee
     con la clave como está.
   - Textos con consejos obvios, por decidir (dueño): «¿Qué hacemos con esta parada?», «Conviene
     llamarlo(s)», «Devuélvelos a Starken. Revisa…» y «…: revisa la dirección».
3. **Le toca al dueño:**
   - Instalar la APK 1.6.1 con el día cerrado y probar una llamada desde ARES y otra desde la
     burbuja (se marca sola y vuelve ARES o Google Maps).
   - Vercel: `APK_VERSION_MINIMA=1.6.1` y `APK_URL` de la 1.6.1; borrar `LECTURA_MODELO` y
     `NEXT_PUBLIC_MAPBOX_TOKEN` (y anular el token de Mapbox).
   - Panel → Configuración: la dirección de la central, con el Plus Code al comienzo.
   - Supabase Auth: Site URL y redirect.
   - El chip en el teléfono, para probar las llamadas (015, T019).
4. **La víspera:**
   - Despertar Supabase si está pausado (~5 min).
   - Publicar con el día cerrado y la cola enviada.
   - Usar la APK de producción (`cl.dashund.ares` 1.6.0), no la de prueba.
5. **El día real:** cada feature anota su resultado en su `tasks.md`; las que pasan se cierran
   (carpeta borrada, resumen en `docs/HOJA-DE-RUTA.md`).

## Índice

Estados: borrador → definida → en curso → hecha (falta día real) · postergada.

### Entran al día real

| Paso | Feature | Qué | Estado | Rama | Tareas | Para el día real |
|---|---|---|---|---|---|---|
| 1 y 4 | [005](005-carga-rapida-pedidos/spec.md) carga rápida | guía → ruta → escaneo de etiqueta | en curso (falta terreno) | — | 32/34 | ≥ 50 etiquetas reales (T030; mide también la 021 y la 028: linterna, ⚠, modo avión, sin cámara) y quickstart (T031) |
| 1 | [016](016-ubicar-direcciones/spec.md) ubicar direcciones | tipeo de la guía y calles cortas sin numerar | en curso (Google conectado) | — | 11/13 | ≤ 3 direcciones a corregir en un día real (T013) |
| 1 | [018](018-corregir-direcciones-ia/spec.md) corregir direcciones con IA | las «Sin ubicar» se corrigen con los buscadores y el catálogo de calles | hecha (falta día real) | — | 9/10 | una guía real (T008) |
| 2 y 5 | [022](022-pedidos-con-problemas/spec.md) pedidos con ⚠ | el ⚠ queda en el pedido (`Pedido.problemas`), la dirección en duda entra a la ruta con su primera opción y se avisa dos paradas antes; la OF de otro largo deja de ser ⚠ | hecha (falta día real) | — | 11/12 | la línea de la burbuja y un día real en la APK (T012) |
| 3 | [019](019-sin-mapbox/spec.md) sin Mapbox | ORS, MapLibre y OpenFreeMap (Liberty); Google da el número de casa | hecha (falta día real) | — | 13/16 | el dueño borra el token de Mapbox en Vercel (T013); día real (T014). Google sin tope, decisión del dueño (T012) |
| 3 | [024](024-criterios-de-ruta/spec.md) criterios de ruta | bultos fuera antes (≤ 1 % de km), «Invertir orden de ruta», el orden cobra km ($130) y tiempo ($6.000/h) y el cupo de ORS no es «Sin señal» | hecha (falta día real) | — (en `main` desde 2026-11-09) | 13/14 | medido en el teléfono (2026-11-09, 53 paradas): armar 20,3 s (antes 15 s), 1 matriz + 32 trazados; invertir +2,4 km y 12 trazados, volver 0 (T009 ok). el dueño acepta los 20 s (T013). Después del día real: T006, éxito por parada y ganancia |
| 3 | [017](017-listo-para-terreno/spec.md) listo para terreno | errores del flujo, rutas por calle y con horarios | en curso | — | 25/27 | prueba en terreno (T051) |
| 4 | [003](003-referencia-paquete/spec.md) OF y referencia del paquete | OF y descripción en cada parada, búsqueda por OF | hecha (falta día real) | — | 15/16 | foto con la cámara y SC-001 en terreno (T016) |
| todos | [027](027-hoja-por-paso/spec.md) la hoja paso por paso | la cabecera de la hoja dice el paso del día que toca y adentro va solo lo de ese paso | hecha (falta día real) | — | 15/16 | escáner, «Salir a repartir» y volver de Google Maps en la APK (T016) |
| 5 | [020](020-burbuja-google-maps/spec.md) burbuja de Google Maps | la ruta en ARES, la guía en Google Maps con la burbuja encima | hecha (falta día real) | — | 16/19 | quickstart en el teléfono (T018; ensayo 2026-11-09: navegar, burbuja y entregar desde ella bien; Maps a la parada siguiente, en la APK 1.6.1); día real (T019): 8 de cada 10 paradas sin volver a ARES |
| 5 | [015](015-app-android/spec.md) app Android (APK) | llamar con un toque, abrir sin señal, pantalla encendida, escáner | en curso | — | 27/30 | llamadas con chip (T019) y quickstart en el teléfono del conductor (T013, T030) |
| 5 | [023](023-paradas-cercanas/spec.md) paradas cercanas | «N cerca» al lado de «Centrar»: hasta 3 pendientes a ≤ 300 m, marcadas en el mapa; «Ahora» deja una como la próxima | hecha (falta día real) | — (en `main` desde 2026-11-09) | — | día real |

### Después del día real (postergadas, dueño 2026-11-09)

No se empiezan ni se retoman sin que el dueño lo pida. Un detalle nuevo que no afecta el día real
se anota aquí.

| Feature | Qué | Estado | Tareas | Lo que falta |
|---|---|---|---|---|
| [025](025-referencias-en-direcciones/spec.md) referencias en direcciones | se ubica por la calle con número; «con…», «frente a…» quedan para el conductor | postergada (borrador) | — | dónde se guarda la referencia. El día real dirá cuántas direcciones con «con…» se ubican mal |
| [026](026-guardado-persistente/spec.md) guardado persistente | pedir que el teléfono no borre IndexedDB (el día y la `cola`) por falta de espacio | postergada (borrador) | — | medir en la APK si la WebView desaloja y si `persist()` responde |
| [002](002-reestructuracion-codigo/spec.md) reestructuración | `lib/` por dominio, archivos chicos, nombres del glosario | postergada (en curso) | 45/51 | partir `pedido-form-local` (T042; antes, si el ensayo obliga a tocarlo); quickstart (T047); tablas `encomienda_*` (T049–T051, con aprobación) |
| [007](007-cumplimiento-datos/spec.md) cumplimiento | borrado diario, no entregados, modo piloto/oficial | postergada (MVP hecho) | 13/20 | el MVP entra al día real (paso 6); falta modo piloto/oficial (P3) y plantillas (con la 004) |
| [006](006-indicadores-negocio/spec.md) indicadores | entregas sobre asignado, contactados, rendimiento, margen, bono | postergada (hecha, falta quickstart) | 14/15 | quickstart (T015) |
| [004](004-menos-visitas-fallidas/spec.md) menos visitas fallidas | WhatsApp propio, «voy llegando» | postergada (fase WhatsApp, sin chip) | 0/21 | — |
| [014](014-horario-conveniente/spec.md) ¿conviene ir al pedido con horario? | al tocarle el turno, ir, dejar para después o descartar | postergada (fase WhatsApp, borrador) | — | — |

Detalles anotados para después: `allowBackup="true"` (toca `android/`; skill
`privacidad-destinatarios`), falta `/favicon.ico`, y en modo prueba «Salir y borrar» no vacía
`dias` ni apaga la IA ni Google.

**Hechas:** 001 (asistencia de ruta), 008 a 013, 021 y 028. Lo que decidieron está en `docs/` (resumen en
`docs/HOJA-DE-RUTA.md`, modelo en `docs/CLASES.md`, WhatsApp en `docs/WHATSAPP.md`). Sus carpetas se
borraron y siguen en el historial de git.

## Cómo se trabaja: una rama por feature

1. **Anotar en `main`.** Se crea la carpeta `NNN-nombre/` con su `spec.md` (un borrador alcanza),
   se agrega su fila aquí y se sube el «Próximo número». Así el número queda reservado y dos ramas
   no toman el mismo.
2. **Empezar.** La rama sale de `main` y se llama igual que la carpeta. Después, aquí, en `main`:
   estado «en curso» y el nombre de la rama.
   ```powershell
   git switch main; git pull
   git switch -c NNN-nombre
   ```
3. **Trabajar en la rama:**
   - En la rama se tocan la carpeta de la feature y el código. **Este índice se edita solo en
     `main`**, para que dos ramas no choquen aquí.
   - Para traer lo nuevo de `main`: `git merge main`.
   - Cada push publica un preview en Vercel.
   - Spec Kit busca la feature activa en `.specify/feature.json`, un archivo local que no se versiona.
     `/speckit-specify` lo escribe; si se retoma otra feature, se cambia a mano
     (`{ "feature_directory": "specs/NNN-nombre" }`).
4. **Terminar.** Se corre la verificación de `AGENTS.md`, el dueño aprueba y se une a `main`. Un push
   a `main` publica en producción: hacerlo con el día cerrado y la cola enviada. En ese mismo cambio
   se borra la carpeta, se escribe su resumen en `docs/HOJA-DE-RUTA.md` y se quita su fila de aquí.
5. **Varias a la vez.** Cada una va en su rama. Lo que se comparte se reserva primero aquí, en
   `main`, anotándolo en la fila de la feature (por ejemplo «usa idb v6» o «migración 0008»): ver
   «Reglas compartidas».

Commits y push: se pregunta antes (`AGENTS.md`, «Límites»).

**Volver atrás una feature.** Cada una entra a `main` con su propio merge (`git merge --no-ff`),
así que se puede deshacer entera sin tocar las demás: `git revert -m 1 <commit del merge>`
(`git log --merges --oneline` los lista). Si cambió `android/`, deshacerla también pide una APK.

## Reglas compartidas entre features

- **Base local (IndexedDB):** cada feature que agrega un store sube a la **siguiente versión libre**
  de `idb.ts` (hoy v6, la libre es la v7). Si el store tiene datos de destinatarios, se registra en
  `STORES_DEL_DIA` (lo borra el cierre del día, spec 007).
- **Migraciones SQL:** cada una toma el **siguiente número libre** de `supabase/migrations/` (hoy
  0008).
- **Reserva entre ramas:** la versión de `idb.ts` y el número de migración se anotan en la fila de la
  feature, en `main`, antes de usarlos. La siguiente rama toma el número que sigue.
- **Rutas de archivos:** las tareas asumen la estructura de la 002 (Fases 1–2 + US1).
- **Cruces:**
  - OF y referencia del paquete → 003.
  - Borrado y lista «No entregados» → 007.
  - Teléfono del receptor → 005 (lo usa la 004).
  - Asignados del día → 005 (lo usa la 006).
  - Etiqueta leída en el teléfono y escáner en vivo → 021 y 028, hechas (resumen en
    `docs/HOJA-DE-RUTA.md`).
