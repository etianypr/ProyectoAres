# AGENTS.md — ARES, reparto de encomiendas de Dashund
App que suple al pioneta: ayuda a un conductor de Arica a ubicar direcciones, armar la mejor ruta,
contactar al receptor y registrar cada entrega, y le deja al jefe los conteos para calcular el pago.
La prioridad es entregar más en menos tiempo, con pocos toques.

## Stack y estructura
Next.js 16.4 (App Router) + Supabase, publicado en Vercel. Node.js 24. Dos experiencias que no
comparten layout: el panel del jefe (escritorio) y la app del conductor (APK Android o PWA).

- **Este Next.js no es el de tu entrenamiento**: lee la guía en `node_modules/next/dist/docs/`
  antes de escribir código. El middleware se llama Proxy (`src/proxy.ts`).
- TypeScript estricto, React 19, Tailwind 4 (`cn()` de `lib/comun/utils`), íconos `lucide-react`.
- Supabase: Postgres + RLS + `pg_cron`, un solo proyecto (gratis; se pausa si queda inactivo).
  Migraciones `supabase/migrations/0001–0007`; la siguiente es la 0008.
- Teléfono: IndexedDB `dashund-encomiendas` v5 (la siguiente versión libre es la v6). Mapa:
  MapLibre + OpenFreeMap.
- APK: Capacitor 8, paquete `cl.dashund.ares`. Abre `https://proyecto-ares-five.vercel.app/conductor`,
  así que cada deploy le llega solo. Lo nativo está en `android/` (plugin `Telefono`, ML Kit) y la web
  lo usa solo a través de `src/lib/nativo/`.
- Proveedores: OpenRouteService (matriz y trazado), OSM/Nominatim y Google Geocoding (direcciones),
  ML Kit en el teléfono y Google Cloud Vision (texto de fotos), Anthropic (guía, etiquetas,
  direcciones sin ubicar) y Meta WhatsApp (en pausa). Mapbox va de salida (spec 019). Las variables
  están en `.env.example`.
- Pruebas con `node:test`, sin framework (`pruebas/`). Servidor MCP de datos geo en `mcp/`
  (registrado en `.mcp.json`).
- Spec Kit: la constitución está en `.specify/memory/constitution.md` (v1.4.0) y el índice en
  `specs/README.md`. Prioridad: la app del conductor; el panel y los pagos van después.

```text
src/
├── proxy.ts                    # sesión de Supabase por request
├── app/(app)/                  # panel: encomiendas, conductores, configuración
├── app/(conductor)/            # app del conductor: conductor/encomiendas (pantalla.tsx + _componentes, _hooks, _mapa) · diagnostico · tema-dashund
├── app/api/                    # whatsapp · lectura (IA) · texto (Vision) · geocodificar (Google) · direccion-ia
├── components/                 # ui (sin dominio) · direccion · panel · marca (logo Dashund)
├── lib/                        # una carpeta por dominio, sin archivos sueltos
│   ├── encomiendas/            # catálogos, estados, pago, paquete, lectura/ · local/ = el teléfono (almacen/, idb, generar-ruta/, planificar…)
│   ├── geo/                    # coordenada, trazado, matriz (ORS), ors/, geocoding/, direccion-ia/, plus-code
│   ├── rutas/orden-paradas/    # optimizador del orden de paradas
│   ├── nativo/                 # única puerta a la APK, con respaldo web
│   └── auth/ · supabase/ · comun/ · whatsapp/ · conductores/
└── types/db.ts                 # esquema Postgres (`Database`)
android/ · capacitor/ · capacitor.config.ts   # la APK
supabase/migrations/            # SQL re-ejecutable; cada una termina en un select de verificación
pruebas/ · mcp/ · scripts/ · specs/ · docs/
```

El detalle está en `docs/`: `ARQUITECTURA.md` (sistema, datos, acceso, flujo del día y carpetas),
`CLASES.md` (glosario, tipos, estados y dónde está cada cosa), `HOJA-DE-RUTA.md` (prioridades y lo
que se midió), `PRIVACIDAD.md` y `WHATSAPP.md`. El estado del proyecto está en `MEMORY.md`.

## Comandos
PowerShell, desde la raíz.

```powershell
npm install
npm run dev              # http://localhost:3000 (antes copia el worker de MapLibre a public/)
npm run build
npm run lint
npm test                 # sin red ni base de datos (~40 s)
npm run test:base        # esquema de encomiendas y cuenta del pago contra la base real (solo lectura)
npm run test:esquema     # cada campo de src/types/db.ts existe en la base
npm run mcp              # servidor MCP geo (stdio)
npm run calles           # regenera el catálogo de calles de Arica desde OSM
npm run sondear          # mide los proveedores de direcciones con direcciones reales (llama a Mapbox: gasta)
```

Para probar en el teléfono hace falta HTTPS: `npx ngrok http 3000`.

APK en GitHub: tag `apk-v1.2.3` (o Actions → APK → Run workflow); la firma y sus secretos están en
`specs/015-app-android/quickstart.md`. Build local contra el servidor
local, con JDK 21 (está en `%LOCALAPPDATA%\Java\`; el JDK 17 de Program Files falla) y adb en
`%LOCALAPPDATA%\Android\Sdk\platform-tools\`:

```powershell
npm run build; npx next start -p 3000      # dejarlo corriendo
$env:CAP_SERVER_URL="http://localhost:3000/conductor"; npx cap sync android
$env:JAVA_HOME="<JDK 21>"; cd android
& "$env:JAVA_HOME\bin\java.exe" "-Dorg.gradle.appname=gradlew" -jar gradle\wrapper\gradle-wrapper.jar assembleDebug
adb reverse tcp:3000 tcp:3000; adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Sin `CAP_SERVER_URL`, la APK apunta a producción. Para depurar: `chrome://inspect` con el teléfono
por USB, o Menú → Diagnóstico en la app.

## Ramas y publicación
- `main` es producción: Vercel publica cada push (proyecto `proyecto-ares`) y la APK lo carga.
  Solo entra lo terminado y verificado.
- Cada feature se desarrolla en su propia rama, creada desde `main` y con el nombre de su spec
  (`020-burbuja-google-maps`). Vuelve a `main` cuando pasa la verificación y el dueño lo aprueba.
- Cada rama genera un preview en Vercel (detrás del login de Vercel), para probar antes de pasar a
  `main`.
- `respaldo-mapbox` guarda la última versión con Mapbox. En ella no se trabaja.
- Publicar con el día del conductor cerrado y la cola enviada: un cambio en la base del teléfono
  puede borrar lo que tenga guardado.
- CLI de Vercel: `npx --yes vercel@latest …`, sobre una copia hecha con `git archive HEAD` para que
  `.env.local` no se suba.

## Convenciones
- Idioma: español de Chile. Textos visibles, comentarios, identificadores y nombres de archivo en
  español (`tarjeta-parada.tsx`, `ubicarDireccion`, `STORES_DEL_DIA`).
- Glosario único para código, pantalla y docs (`docs/CLASES.md` §0): `Pedido`, `Ruta`, `Parada`
  (solo en pantalla), `DiaTrabajo`, `ActividadPorEnviar`/`Actividad`, `PagoDelDia`. Se dice
  **conductor** y **día de trabajo**. No se usa "hub". Las tablas de la base tienen sus propios
  nombres (`encomienda_jornadas` = `DiaTrabajo`…); la equivalencia está en `docs/ARQUITECTURA.md` §2.
- No hay Prettier; ESLint de Next (`npm run lint`). Sangría de 2 espacios, comillas dobles, punto y
  coma y el alias `@/`.
- Archivos en kebab-case, componentes exportados en PascalCase (`export function TarjetaParada`) y
  hooks en `use-*.ts`. Las carpetas privadas de una ruta son `_componentes/`, `_hooks/` y `_mapa/`.
  `pantalla.tsx` solo une piezas.
- Los comentarios explican el porqué y citan la spec que lo pidió ("spec 017, N4"), no el qué.
- Capas (`pruebas/arquitectura.test.mjs`, A1–A10):
  - `app → components → lib`: `lib` no importa de `app` ni de `components`, y `components/ui` no
    lleva lógica de dominio.
  - Solo `almacen/` toca `idb`, y solo `lib/nativo/` importa `@capacitor/*`.
  - Un módulo que lee un secreto lleva `import "server-only"`. `lib/encomiendas/local/` no se
    importa desde el servidor.
  - Toda consulta a Supabase va tipada con `Database`, sin casts.
  - Un archivo de más de ~400 líneas se divide al tocarlo.
- Diseño del conductor, «Plano» (`tema-dashund.css`; solo lo carga el layout del conductor):
  - Colores: naranja Dashund `#d4531a` en el mapa y `#c4491a` en los botones con texto blanco
    (para cumplir AA), con neutros cálidos.
  - Tipografía: Manrope, más IBM Plex Mono solo para OF, km y horas.
  - Ningún estado depende solo del color.
  - Nada de degradados, neón, Inter/Roboto ni tarjetas con franja lateral.
- Las pantallas no llevan instrucciones: solo estados, datos y botones. El cómo se usa va en una o
  dos líneas de `_componentes/ayuda.tsx`. Si cambia el nombre de un botón, se cambia también la
  Ayuda.
- Docs y specs concisos: viñetas, y lo que vive en otro documento se enlaza en vez de repetirse.

## Reglas de dominio / trampas conocidas
Los principios están en `.specify/memory/constitution.md`. Esta lista es lo que el código ya decidió
y un agente no debe "corregir".

- **Contexto.** La empresa es **Dashund**: 1 conductor y 1 mandante (Starken, con envíos de Mercado
  Libre), en Arica, con unos 100 destinos al día. Los pedidos llegan en la guía de despacho de
  Infologistic, que no tiene API (no volver a preguntarlo). El nombre, el teléfono y el POR PAGAR
  solo vienen en la etiqueta.
- **Datos de destinatarios.** Nombre, teléfono, dirección, OF y fotos viven solo en el teléfono y
  se borran al cerrar el día. Al servidor sube solo el hecho (`encomienda_actividad`).
  - Nunca van al servidor, a los logs ni al repo (comentarios, commits, docs o pruebas). Las
    pruebas usan calles reales con números y nombres inventados.
  - Un store nuevo con esos datos se registra en `STORES_DEL_DIA`.
  - Un error de red nunca borra, y la `cola` no se toca.
- **Proveedores y ley.** Todo proveedor que reciba datos de destinatarios figura en
  `docs/PRIVACIDAD.md` (lo verifica A10). Dashund es encargado de Starken (Ley 21.719). Lo legal se
  cierra antes del lanzamiento oficial y no frena el desarrollo.
- **Un pedido es de un solo día**, sin arrastre. Lo no entregado se tacha y, si vuelve a salir, se
  escanea de nuevo. No se diseña nada en torno a arrastrar pedidos.
- **Resultado.** Es entregado o no entregado, **sin motivo** (spec 012), y no se reintroducen
  motivos sin preguntar.
  - Dejar el paquete con un vecino o el conserje cuenta como entregado.
  - "Dejar como pendiente" manda la parada al final de la ruta.
  - La disponibilidad (lo que dice el receptor) y el resultado son dimensiones separadas.
- **OF.** Se acepta cualquiera que tenga dígitos. La que no tiene 9 lleva ⚠ y nunca bloquea. Se
  quitan los ceros a la izquierda: el código de barras de 26 dígitos trae la OF en los dígitos
  15 a 23. En el paquete no se escribe nada; la parada muestra la OF y su descripción.
- **Pago.** Se calcula en Postgres (`private.encomienda_congelar_dia()`), y `lib/encomiendas/pago.ts`
  es una copia para la vista previa. Las dos se tocan juntas y se corre `npm run test:base`. Cada
  día guarda su tarifa, así que cambiar la regla no mueve los días anteriores.
- **Rutas.** El objetivo son los km.
  - La ruta es cerrada: vuelve a la central.
  - Cada zona se recorre una sola vez (`generar-ruta/zonas.ts`, zonas de 900 m).
  - No se da la vuelta en pasajes ni en calles residenciales.
  - Con un solo conductor, sectorizar (k-means, HSAC) alarga la ruta entre 4 % y 20 %, y el orden
    ya está en el óptimo práctico: no proponer ALNS, Tabu ni colonias de hormigas. Lo que mejora la
    ruta es ubicar bien las direcciones.
  - Se muestra una propuesta por defecto, y hasta tres solo si difieren de verdad.
- **Navegación (spec 020).** ARES muestra la ruta, es importante que en cada parada tambien te muestre que paradas tienes cerca (esto por si tenemos un pedido pendiente o agendamos una entrega que la aplicacion no sabe) y maneja las paradas, pero **no guía**. Guía la
  app Google Maps, con la burbuja de ARES encima, ligada al pedido abierto y siempre con el botón
  "Navegar". El Navigation SDK y la navegación propia de ARES (cartel y voz) se fueron.
- **Plata.** El dueño no puede pagar sorpresas.
  - Mapbox sale entero y no se vuelve a proponer.
  - Todo servicio de pago lleva una cuota que lo deje en US$0. Google Geocoding tiene tope diario,
    y Cloud Vision está apagada en la clave (se usa ML Kit).
  - ORS es gratis: 500 consultas de matriz al día. Sin cupo contesta 429, y la ruta sigue en línea
    recta con aviso.
- **WhatsApp.** Queda en pausa hasta que el dueño tenga el chip y el token de Meta
  (`WHATSAPP_EN_PAUSA`). Sin las variables, la app funciona sin avisos (spec 013); no se empuja
  trabajo de WhatsApp. En Meta, el orden de los botones (Sí, estaré · Mañana · Otro horario) es el
  del payload y no se cambia.
- **Plus Code primero.** En Arica las casas no tienen numeración confiable. Un Plus Code se resuelve
  sin red y se guarda completo. Ojo: una misma dirección puede existir en Arica y en Azapa.
- **Proveedores de direcciones.** Cambian sin avisar, y un fixture viejo pasa en verde igual. Si las
  direcciones fallan, primero se mide con `npm run sondear` (avisando lo que gasta) y después se
  toca código.
- **APK.** Solo hace falta reinstalarla si cambia `android/`; en ese caso se sube
  `APK_VERSION_MINIMA` en Vercel. La clave de firma (`*.keystore`) no va al repo: una APK firmada
  con otra clave no se instala encima.
- **Base.** No se cambian nombres de tablas o columnas, ni se borran columnas, sin aprobación: el
  teléfono puede estar corriendo código anterior. El nombre de la base IndexedDB tampoco se
  cambia, porque dejaría huérfanos los datos.
- **MCP.** En stdio, stdout es el canal del protocolo; para depurar se usa `console.error`.
- **`npm audit`.** Las 5 altas de `braces` están aceptadas (solo afectan al lint). No se corre
  `npm audit fix --force`, porque baja a Next 14.

## Forma de trabajar
- Cada propuesta o cambio de estructura va con la estructura de datos (tablas de Postgres y stores
  de IndexedDB) y el diagrama del sistema, marcando dónde los docs no coinciden con el código: el
  dueño valida la arquitectura antes de aprobar.
- En cambios de diseño, mostrar primero la forma más barata en tokens que represente la idea (una
  maqueta o una comparación lado a lado), para que la confirme o la descarte.
- En cambios de código, explicar por qué se hizo lo que se hizo.
- Se implementa el gesto real del conductor en terreno (cámara en mano, de a una foto), no un atajo
  equivalente. Antes de cerrar, recorrerlo como él: qué botón, en qué orden, con la cámara o con la
  galería.
- Spec Kit: no se generan checklists. Una spec terminada se borra de `specs/` y su resumen pasa a
  `docs/HOJA-DE-RUTA.md`. La próxima spec nueva es la 021.

## Límites
- ✅ Siempre: correr la verificación que corresponde.
- ✅ Siempre: actualizar `docs/ARQUITECTURA.md` o `docs/CLASES.md` en el mismo cambio, si cambia un
  límite, una tabla, un store, un tipo o una carpeta.
- ✅ Siempre: actualizar `MEMORY.md` al terminar cada tarea.
- ⚠ Pregunta antes: commits y push. Un push a `main` publica en producción y la APK lo carga.
- ⚠ Pregunta antes: cualquier consulta a una API de pago o con cuota. Decir cuántas consultas son y
  cuánto cuestan, pedir una vez y reutilizar dentro de la corrida, y nunca usar `Infinity` como cupo.
- ⚠ Pregunta antes: dependencias o proveedores nuevos (con su costo y su tope) y cambios en el
  formato de datos.
- ⚠ Pregunta antes: migraciones contra Supabase. Hay un solo proyecto: es producción.
- ⚠ Pregunta antes: cambios en `android/`, porque obligan a recompilar y reinstalar la APK.
- ⚠ Pregunta antes: borrar archivos.
- 🚫 Nunca: datos reales de destinatarios en el repo, ni secretos en el código o en el chat.
- 🚫 Nunca: tocar otro proyecto de la cuenta de Vercel que no sea `proyecto-ares`.
- 🚫 Nunca: crear cuentas, claves o cuotas de Google, ni cargar secretos en Vercel. Eso lo hace el
  dueño.

## Verificación
Un cambio no está terminado hasta que sus comandos salen en 0 y, si se ve en la app, se recorre.

Siempre: `npm test`, `npm run lint` y `npm run build`.

Según lo que cambió:

- **Rutas, direcciones, WhatsApp, estados de entrega, pago o privacidad:** pruebas enfocadas nuevas
  (constitución III). Las pruebas importan el `src/` real; un proveedor se sustituye reemplazando el
  `fetch` global, no el módulo, así que no gastan cuota.
- **Migración:** que sea re-ejecutable y termine en un `select` que dé todo `true`. Después,
  `npm run test:esquema` y `npm run test:base`, y actualizar `src/types/db.ts`.
- **Pago (SQL o `pago.ts`):** cambiar las dos copias y correr `npm run test:base`.
- **Store de IndexedDB:** usar la siguiente versión libre de `idb.ts`, con migración al abrir y una
  prueba de que no se pierde nada (`idb-version.test.mjs`).
- **Pantalla del conductor:** no hay pruebas de componentes de React. Se recorre a mano en el
  teléfono o a 360 px, con los escenarios del `quickstart.md` de la spec, en modo prueba (nada va a
  la base ni por WhatsApp; hay GPS simulado). En la APK: `chrome://inspect` y Menú → Diagnóstico.
- **`android/`:** build local de la APK e instalación con adb.
- **MCP:** `pruebas/16-mcp.test.mjs`, que ya corre en `npm test`.

## Memoria
- Al empezar, lee `MEMORY.md` (raíz del repo) para conocer el estado del proyecto y las decisiones
  tomadas. Es la única memoria: no se guardan notas aparte en la memoria automática de Claude Code.
- Al terminar una tarea, actualízalo con el estado actual, las decisiones importantes (con su
  porqué) y los errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en vez de dejarlo en
  la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos de destinatarios).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
